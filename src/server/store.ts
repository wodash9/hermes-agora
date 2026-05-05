import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentProfileConfig, AgoraGroup, AgoraMessage, Author, GroupListResponse, MessageListResponse, ProfilePresence, ProfileStatus, ProfileStatusResponse } from '../shared/types.js';

interface StoredProfileStatus {
  status: ProfilePresence;
  lastSeenAt: string;
  lastMessageAt?: string | null;
  note?: string | null;
}

interface StoreFile {
  version: 1;
  messages: AgoraMessage[];
  groups: AgoraGroup[];
  profileStatuses: Record<string, StoredProfileStatus>;
}

export interface CreateMessageInput {
  channel: string;
  groupId?: string | null;
  text: string;
  author: Author;
  metadata?: Record<string, unknown>;
  threadId?: string | null;
  replyTo?: string | null;
}

export interface ListMessagesInput {
  channel?: string;
  groupId?: string;
  limit?: number;
  after?: string;
  before?: string;
}

export interface CreateGroupInput {
  id?: string;
  name: string;
  memberProfileIds: string[];
  createdBy: Author;
}

export interface UpdateGroupInput {
  name?: string;
  memberProfileIds?: string[];
}

export interface UpdateProfileStatusInput {
  profileId: string;
  status: ProfilePresence;
  note?: string | null;
  lastMessageAt?: string | null;
}

export class JsonMessageStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string, private data: StoreFile) {}

  static async open(filePath: string): Promise<JsonMessageStore> {
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.messages)) throw new Error('Invalid store shape');
      return new JsonMessageStore(filePath, {
        version: 1,
        messages: parsed.messages.map((message) => ({ ...message, groupId: message.groupId ?? null })),
        groups: parsed.groups ?? [],
        profileStatuses: parsed.profileStatuses ?? {}
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const store = new JsonMessageStore(filePath, { version: 1, messages: [], groups: [], profileStatuses: {} });
      await store.persist();
      return store;
    }
  }

  async createMessage(input: CreateMessageInput): Promise<AgoraMessage> {
    const groupId = input.groupId ? normalizeGroupId(input.groupId) : null;
    const channel = groupId ? normalizeChannel(input.channel || `group-${groupId}`) : normalizeChannel(input.channel);
    const text = input.text.trim();
    if (!text) throw new Error('Message text is required');
    if (text.length > 8000) throw new Error('Message text exceeds 8000 characters');
    if (input.metadata && JSON.stringify(input.metadata).length > 8192) throw new Error('Message metadata exceeds 8192 bytes');

    const now = new Date().toISOString();
    const message: AgoraMessage = {
      id: `msg_${randomUUID()}`,
      channel,
      groupId,
      text,
      author: input.author,
      metadata: input.metadata ?? {},
      createdAt: now,
      threadId: input.threadId ?? null,
      replyTo: input.replyTo ?? null
    };
    this.data.messages.push(message);
    this.setProfileStatus(input.author.profileId, { status: 'online', lastSeenAt: now, lastMessageAt: now });
    await this.persist();
    return message;
  }

  async listMessages(input: ListMessagesInput = {}): Promise<MessageListResponse> {
    const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
    let messages = [...this.data.messages];
    if (input.groupId) {
      const groupId = normalizeGroupId(input.groupId);
      messages = messages.filter((message) => message.groupId === groupId);
    } else if (input.channel) {
      const channel = normalizeChannel(input.channel);
      messages = messages.filter((message) => !message.groupId && message.channel === channel);
    }
    if (input.after) {
      const index = messages.findIndex((message) => message.id === input.after);
      if (index >= 0) messages = messages.slice(index + 1);
    }
    if (input.before) {
      const index = messages.findIndex((message) => message.id === input.before);
      if (index >= 0) messages = messages.slice(0, index);
    }
    messages = messages.slice(-limit);
    return { messages, nextCursor: messages.at(-1)?.id ?? null };
  }

  async createGroup(input: CreateGroupInput): Promise<AgoraGroup> {
    const name = normalizeGroupName(input.name);
    const id = input.id ? normalizeGroupId(input.id) : uniqueGroupId(slugifyGroupName(name), this.data.groups);
    if (this.data.groups.some((group) => group.id === id)) throw new Error('Group already exists');
    const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
    if (memberProfileIds.length === 0) throw new Error('Group needs at least one member');
    const now = new Date().toISOString();
    const group: AgoraGroup = { id, name, memberProfileIds, createdAt: now, updatedAt: now, createdBy: input.createdBy };
    this.data.groups.push(group);
    await this.persist();
    return group;
  }

  async updateGroup(idRaw: string, input: UpdateGroupInput): Promise<AgoraGroup> {
    const id = normalizeGroupId(idRaw);
    const group = this.getGroup(id);
    if (!group) throw new Error('Group not found');
    if (typeof input.name === 'string') group.name = normalizeGroupName(input.name);
    if (input.memberProfileIds) {
      const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
      if (memberProfileIds.length === 0) throw new Error('Group needs at least one member');
      group.memberProfileIds = memberProfileIds;
    }
    group.updatedAt = new Date().toISOString();
    await this.persist();
    return group;
  }

  async deleteGroup(idRaw: string): Promise<boolean> {
    const id = normalizeGroupId(idRaw);
    const index = this.data.groups.findIndex((group) => group.id === id);
    if (index === -1) return false;
    this.data.groups.splice(index, 1);
    this.data.messages = this.data.messages.filter((message) => message.groupId !== id);
    await this.persist();
    return true;
  }

  getGroup(idRaw: string): AgoraGroup | null {
    const id = normalizeGroupId(idRaw);
    return this.data.groups.find((group) => group.id === id) ?? null;
  }

  listGroups(): GroupListResponse {
    return { groups: [...this.data.groups].sort((left, right) => left.name.localeCompare(right.name)), generatedAt: new Date().toISOString() };
  }

  async updateProfileStatus(input: UpdateProfileStatusInput): Promise<StoredProfileStatus> {
    const now = new Date().toISOString();
    const current = this.data.profileStatuses[input.profileId];
    const next = this.setProfileStatus(input.profileId, {
      status: input.status,
      note: input.note ?? current?.note ?? null,
      lastSeenAt: now,
      lastMessageAt: input.lastMessageAt ?? current?.lastMessageAt ?? null
    });
    await this.persist();
    return next;
  }

  listProfileStatuses(agentProfiles: Record<string, AgentProfileConfig>): ProfileStatusResponse {
    const profiles: ProfileStatus[] = Object.entries(agentProfiles).map(([profileId, config]) => {
      const stored = this.data.profileStatuses[profileId];
      return {
        profileId,
        displayName: config.displayName,
        status: stored?.status ?? 'unknown',
        channels: config.channels,
        scopes: config.scopes,
        lastSeenAt: stored?.lastSeenAt ?? null,
        lastMessageAt: stored?.lastMessageAt ?? null,
        note: stored?.note ?? null
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName));
    return { profiles, generatedAt: new Date().toISOString() };
  }

  private setProfileStatus(profileId: string, patch: Partial<StoredProfileStatus> & { status: ProfilePresence; lastSeenAt: string }): StoredProfileStatus {
    const current = this.data.profileStatuses[profileId];
    const next: StoredProfileStatus = {
      status: patch.status,
      lastSeenAt: patch.lastSeenAt,
      lastMessageAt: patch.lastMessageAt ?? current?.lastMessageAt ?? null,
      note: patch.note ?? current?.note ?? null
    };
    this.data.profileStatuses[profileId] = next;
    return next;
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const tmp = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(tmp, payload, 'utf8');
      await rename(tmp, this.filePath);
    });
    await this.writeQueue;
  }
}

export function normalizeChannel(channel: string): string {
  const normalized = channel.trim().toLowerCase();
  if (!normalized.match(/^[a-z0-9][a-z0-9-]{0,63}$/)) throw new Error('Invalid channel slug');
  return normalized;
}

export function normalizeGroupId(groupId: string): string {
  const normalized = groupId.trim().toLowerCase();
  if (!normalized.match(/^[a-z0-9][a-z0-9-]{0,57}$/)) throw new Error('Invalid group id');
  return normalized;
}

export function parseProfilePresence(value: unknown): ProfilePresence {
  if (value === 'online' || value === 'idle' || value === 'offline' || value === 'blocked') return value;
  throw new Error('Invalid profile status');
}

function normalizeGroupName(nameRaw: string): string {
  const name = nameRaw.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('Group name is required');
  if (name.length > 80) throw new Error('Group name exceeds 80 characters');
  return name;
}

function normalizeMemberProfileIds(profileIds: string[]): string[] {
  if (!Array.isArray(profileIds)) throw new Error('memberProfileIds must be an array');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const profileIdRaw of profileIds) {
    if (typeof profileIdRaw !== 'string') throw new Error('Invalid member profile id');
    const profileId = profileIdRaw.trim().toLowerCase();
    if (!profileId.match(/^[a-z0-9][a-z0-9-]{1,63}$/)) throw new Error(`Invalid member profile id: ${profileIdRaw}`);
    if (!seen.has(profileId)) {
      seen.add(profileId);
      normalized.push(profileId);
    }
  }
  return normalized;
}

function slugifyGroupName(name: string): string {
  const slug = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'grupo';
}

function uniqueGroupId(base: string, groups: AgoraGroup[]): string {
  const existing = new Set(groups.map((group) => group.id));
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}
