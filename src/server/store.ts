import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentProfileConfig, AgoraMessage, Author, MessageListResponse, ProfilePresence, ProfileStatus, ProfileStatusResponse } from '../shared/types.js';

interface StoredProfileStatus {
  status: ProfilePresence;
  lastSeenAt: string;
  lastMessageAt?: string | null;
  note?: string | null;
}

interface StoreFile {
  version: 1;
  messages: AgoraMessage[];
  profileStatuses: Record<string, StoredProfileStatus>;
}

export interface CreateMessageInput {
  channel: string;
  text: string;
  author: Author;
  metadata?: Record<string, unknown>;
  threadId?: string | null;
  replyTo?: string | null;
}

export interface ListMessagesInput {
  channel?: string;
  limit?: number;
  after?: string;
  before?: string;
}

export interface UpdateProfileStatusInput {
  profileId: string;
  status: ProfilePresence;
  note?: string | null;
  lastMessageAt?: string | null;
}

export class JsonMessageStore {
  private constructor(private readonly filePath: string, private data: StoreFile) {}

  static async open(filePath: string): Promise<JsonMessageStore> {
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.messages)) throw new Error('Invalid store shape');
      return new JsonMessageStore(filePath, { version: 1, messages: parsed.messages, profileStatuses: parsed.profileStatuses ?? {} });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const store = new JsonMessageStore(filePath, { version: 1, messages: [], profileStatuses: {} });
      await store.persist();
      return store;
    }
  }

  async createMessage(input: CreateMessageInput): Promise<AgoraMessage> {
    const channel = normalizeChannel(input.channel);
    const text = input.text.trim();
    if (!text) throw new Error('Message text is required');
    if (text.length > 8000) throw new Error('Message text exceeds 8000 characters');
    if (input.metadata && JSON.stringify(input.metadata).length > 8192) throw new Error('Message metadata exceeds 8192 bytes');

    const now = new Date().toISOString();
    const message: AgoraMessage = {
      id: `msg_${randomUUID()}`,
      channel,
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
    if (input.channel) {
      const channel = normalizeChannel(input.channel);
      messages = messages.filter((message) => message.channel === channel);
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
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(tmp, this.filePath);
  }
}

export function normalizeChannel(channel: string): string {
  const normalized = channel.trim().toLowerCase();
  if (!normalized.match(/^[a-z0-9][a-z0-9-]{0,63}$/)) throw new Error('Invalid channel slug');
  return normalized;
}

export function parseProfilePresence(value: unknown): ProfilePresence {
  if (value === 'online' || value === 'idle' || value === 'offline' || value === 'blocked') return value;
  throw new Error('Invalid profile status');
}
