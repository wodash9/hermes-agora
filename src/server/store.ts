import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgoraMessage, Author, MessageListResponse } from '../shared/types.js';

interface StoreFile {
  version: 1;
  messages: AgoraMessage[];
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

export class JsonMessageStore {
  private constructor(private readonly filePath: string, private data: StoreFile) {}

  static async open(filePath: string): Promise<JsonMessageStore> {
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as StoreFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.messages)) throw new Error('Invalid store shape');
      return new JsonMessageStore(filePath, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const store = new JsonMessageStore(filePath, { version: 1, messages: [] });
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

    const message: AgoraMessage = {
      id: `msg_${randomUUID()}`,
      channel,
      text,
      author: input.author,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      threadId: input.threadId ?? null,
      replyTo: input.replyTo ?? null
    };
    this.data.messages.push(message);
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
