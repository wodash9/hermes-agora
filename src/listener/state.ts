import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ListenerState {
  version: 1;
  profiles: Record<string, ProfileListenerState>;
}

export interface ProfileListenerState {
  groups: Record<string, GroupListenerState>;
}

export interface GroupListenerState {
  cursor: string | null;
  processedMessageIds: string[];
  initialized: boolean;
}

export interface ListenerStateStore {
  load(): Promise<ListenerState>;
  save(state: ListenerState): Promise<void>;
}

export class FileListenerStateStore implements ListenerStateStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<ListenerState> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ListenerState>;
      if (parsed.version !== 1 || typeof parsed.profiles !== 'object' || parsed.profiles === null) throw new Error('Invalid listener state shape');
      return normalizeState(parsed as ListenerState);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { version: 1, profiles: {} };
    }
  }

  async save(state: ListenerState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify(normalizeState(state), null, 2);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const tmp = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(tmp, payload, 'utf8');
      await rename(tmp, this.filePath);
    });
    await this.writeQueue;
  }
}

export function getGroupState(state: ListenerState, profileId: string, groupId: string): GroupListenerState {
  state.profiles[profileId] ??= { groups: {} };
  state.profiles[profileId].groups[groupId] ??= { cursor: null, processedMessageIds: [], initialized: false };
  return state.profiles[profileId].groups[groupId];
}

export function rememberProcessed(groupState: GroupListenerState, messageId: string, maxProcessedIds = 500): void {
  if (!groupState.processedMessageIds.includes(messageId)) groupState.processedMessageIds.push(messageId);
  if (groupState.processedMessageIds.length > maxProcessedIds) {
    groupState.processedMessageIds.splice(0, groupState.processedMessageIds.length - maxProcessedIds);
  }
  groupState.cursor = messageId;
}

function normalizeState(state: ListenerState): ListenerState {
  const normalized: ListenerState = { version: 1, profiles: {} };
  for (const [profileId, profileState] of Object.entries(state.profiles ?? {})) {
    normalized.profiles[profileId] = { groups: {} };
    for (const [groupId, groupState] of Object.entries(profileState.groups ?? {})) {
      normalized.profiles[profileId].groups[groupId] = {
        cursor: typeof groupState.cursor === 'string' ? groupState.cursor : null,
        processedMessageIds: Array.isArray(groupState.processedMessageIds)
          ? groupState.processedMessageIds.filter((id): id is string => typeof id === 'string').slice(-500)
          : [],
        initialized: groupState.initialized === true
      };
    }
  }
  return normalized;
}
