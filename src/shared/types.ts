export type ParticipantType = 'human' | 'agent' | 'system';

export type AgentScope = 'messages:read' | 'messages:write' | 'projects:read' | 'projects:write' | 'admin';

export type ProfilePresence = 'online' | 'idle' | 'offline' | 'blocked' | 'unknown';
export type ProjectStatus = 'active' | 'archived';
export type KanbanStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
export type TaskDocumentKind = 'note' | 'result' | 'blocker' | 'qa';

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

export interface AgoraProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  memberProfileIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: Author;
}

export interface ProjectListResponse {
  projects: AgoraProject[];
  generatedAt: string;
}

export interface AgoraTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: KanbanStatus;
  assigneeProfileIds: string[];
  labels: string[];
  order: number;
  sourceMessageId?: string | null;
  sourceGroupId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: Author;
  updatedBy?: Author;
}

export interface TaskListResponse {
  tasks: AgoraTask[];
  generatedAt: string;
}

export interface TaskDocument {
  id: string;
  taskId: string;
  kind: TaskDocumentKind;
  body: string;
  author: Author;
  createdAt: string;
}

export interface TaskDocumentListResponse {
  documents: TaskDocument[];
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
