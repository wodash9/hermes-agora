export type ParticipantType = 'human' | 'agent' | 'system';

export type AgentScope = 'messages:read' | 'messages:write' | 'admin';

export type ProfilePresence = 'online' | 'idle' | 'offline' | 'blocked' | 'unknown';

export interface Author {
  type: ParticipantType;
  profileId: string;
  displayName: string;
  email?: string;
}

export interface AgoraMessage {
  id: string;
  channel: string;
  groupId?: string | null;
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

export interface AgoraGroup {
  id: string;
  name: string;
  memberProfileIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: Author;
}

export interface GroupListResponse {
  groups: AgoraGroup[];
  generatedAt: string;
}

export interface ProfileStatus {
  profileId: string;
  displayName: string;
  status: ProfilePresence;
  channels: string[];
  scopes: AgentScope[];
  lastSeenAt: string | null;
  lastMessageAt: string | null;
  note: string | null;
}

export interface ProfileStatusResponse {
  profiles: ProfileStatus[];
  generatedAt: string;
}

export interface Identity {
  type: 'human' | 'agent';
  profileId: string;
  displayName: string;
  email?: string;
  scopes: AgentScope[];
  channels: string[];
}
