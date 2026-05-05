export type ParticipantType = 'human' | 'agent' | 'system';

export type AgentScope = 'messages:read' | 'messages:write' | 'admin';

export interface Author {
  type: ParticipantType;
  profileId: string;
  displayName: string;
  email?: string;
}

export interface AgoraMessage {
  id: string;
  channel: string;
  text: string;
  author: Author;
  metadata?: Record<string, unknown>;
  createdAt: string;
  threadId?: string | null;
  replyTo?: string | null;
}

export interface MessageListResponse {
  messages: AgoraMessage[];
  nextCursor: string | null;
}

export interface AgentProfileConfig {
  displayName: string;
  scopes: AgentScope[];
  channels: string[];
}

export interface Identity {
  type: 'human' | 'agent';
  profileId: string;
  displayName: string;
  email?: string;
  scopes: AgentScope[];
  channels: string[];
}
