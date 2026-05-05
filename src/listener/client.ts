import type { AgoraGroup, AgoraMessage, GroupListResponse, MessageListResponse } from '../shared/types.js';
import type { AgoraListenerClient } from './processor.js';
import { redactSensitive } from './redaction.js';

export interface HttpAgoraClientOptions {
  baseUrl: string;
  agentToken: string;
  timeoutMs?: number;
}

export class HttpAgoraClient implements AgoraListenerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpAgoraClientOptions) {
    if (!options.agentToken) throw new Error('HUB_AGENT_TOKEN is required for agora-listener');
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 15000, 1000), 120000);
  }

  async listGroups(profileId: string): Promise<AgoraGroup[]> {
    const response = await this.request<GroupListResponse>(profileId, '/api/v1/groups');
    return response.groups;
  }

  async listGroupMessages(profileId: string, groupId: string, after?: string | null): Promise<AgoraMessage[]> {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    const response = await this.request<MessageListResponse>(profileId, `/api/v1/groups/${encodeURIComponent(groupId)}/messages?${params.toString()}`);
    return response.messages;
  }

  async postGroupMessage(profileId: string, groupId: string, text: string, options?: { replyTo?: string | null; metadata?: Record<string, unknown> }): Promise<void> {
    await this.request<AgoraMessage>(profileId, `/api/v1/groups/${encodeURIComponent(groupId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        replyTo: options?.replyTo ?? null,
        metadata: options?.metadata ?? {}
      })
    });
  }

  async updateStatus(profileId: string, status: 'online' | 'idle' | 'blocked', note: string): Promise<void> {
    await this.request(profileId, '/api/v1/profiles/status', {
      method: 'POST',
      body: JSON.stringify({ status, note })
    });
  }

  private async request<T = unknown>(profileId: string, path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.agentToken}`,
          'X-Hermes-Profile': profileId,
          'Content-Type': 'application/json',
          'User-Agent': 'hermes-agora-listener/0.1',
          ...(init.headers ?? {})
        }
      });
      const body = await response.text();
      if (!response.ok) {
        const detail = safeErrorDetail(body);
        throw new Error(`Agora API ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
      }
      if (!body) return undefined as T;
      return JSON.parse(body) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? redactSensitive(parsed.error).slice(0, 300) : '';
  } catch {
    return redactSensitive(body).slice(0, 300);
  }
}
