import type { AgoraGroup, AgoraMessage, AgoraProject, AgoraTask, GroupListResponse, Identity, KanbanStatus, MessageListResponse, ProfileStatusResponse, ProjectListResponse, TaskDocument, TaskDocumentKind, TaskDocumentListResponse, TaskListResponse } from '../shared/types';

export const MOCK_DEV_TOKEN = 'change-me-dev-token';
export const MOCK_DEV_PROFILE_ID = 'seldon-ceo';

function mockProfileForToken(token: string): string | undefined {
  return token === MOCK_DEV_TOKEN ? MOCK_DEV_PROFILE_ID : undefined;
}

export function buildAuthHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const mockProfileId = mockProfileForToken(token);
  if (mockProfileId) headers['X-Hermes-Profile'] = mockProfileId;
  return headers;
}

export function buildSocketAuth(token: string): Record<string, string> {
  const auth: Record<string, string> = { token };
  const mockProfileId = mockProfileForToken(token);
  if (mockProfileId) auth.profileId = mockProfileId;
  return auth;
}

function buildJsonHeaders(token: string): Record<string, string> {
  return { ...buildAuthHeaders(token), 'Content-Type': 'application/json' };
}

export async function fetchIdentity(token: string): Promise<Identity> {
  const response = await fetch('/api/v1/me', { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Identity failed: ${response.status}`);
  return response.json();
}

export async function fetchMessages(token: string, channel = 'general'): Promise<MessageListResponse> {
  const response = await fetch(`/api/v1/messages?channel=${encodeURIComponent(channel)}&limit=100`, { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Messages failed: ${response.status}`);
  return response.json();
}

export async function fetchGroups(token: string): Promise<GroupListResponse> {
  const response = await fetch('/api/v1/groups', { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Groups failed: ${response.status}`);
  return response.json();
}

export async function createGroup(token: string, name: string, memberProfileIds: string[]): Promise<AgoraGroup> {
  const response = await fetch('/api/v1/groups', {
    method: 'POST',
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ name, memberProfileIds })
  });
  if (!response.ok) throw new Error(`Create group failed: ${response.status}`);
  return response.json();
}

export async function updateGroup(token: string, groupId: string, name: string, memberProfileIds: string[]): Promise<AgoraGroup> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ name, memberProfileIds })
  });
  if (!response.ok) throw new Error(`Update group failed: ${response.status}`);
  return response.json();
}

export async function deleteGroup(token: string, groupId: string): Promise<void> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token)
  });
  if (!response.ok) throw new Error(`Delete group failed: ${response.status}`);
}

export async function fetchGroupMessages(token: string, groupId: string): Promise<MessageListResponse> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}/messages?limit=100`, { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Group messages failed: ${response.status}`);
  return response.json();
}

export async function fetchProfileStatuses(token: string): Promise<ProfileStatusResponse> {
  const response = await fetch('/api/v1/profiles/status', { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Profile status failed: ${response.status}`);
  return response.json();
}

export async function fetchProjects(token: string): Promise<ProjectListResponse> {
  const response = await fetch('/api/v1/projects', { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Projects failed: ${response.status}`);
  return response.json();
}

export async function createProject(token: string, name: string, description: string, memberProfileIds: string[]): Promise<AgoraProject> {
  const response = await fetch('/api/v1/projects', {
    method: 'POST',
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ name, description, memberProfileIds })
  });
  if (!response.ok) throw new Error(`Create project failed: ${response.status}`);
  return response.json();
}

export async function updateProject(token: string, projectId: string, name: string, description: string, memberProfileIds: string[]): Promise<AgoraProject> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ name, description, memberProfileIds })
  });
  if (!response.ok) throw new Error(`Update project failed: ${response.status}`);
  return response.json();
}

export async function deleteProject(token: string, projectId: string): Promise<void> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token)
  });
  if (!response.ok) throw new Error(`Delete project failed: ${response.status}`);
}

export async function fetchProjectTasks(token: string, projectId: string): Promise<TaskListResponse> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks`, { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Project tasks failed: ${response.status}`);
  return response.json();
}

export async function createProjectTask(token: string, projectId: string, input: { title: string; description?: string; status?: KanbanStatus; assigneeProfileIds?: string[]; labels?: string[] }): Promise<AgoraTask> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks`, {
    method: 'POST',
    headers: buildJsonHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`Create task failed: ${response.status}`);
  return response.json();
}

export async function updateProjectTask(token: string, projectId: string, taskId: string, input: Partial<Pick<AgoraTask, 'title' | 'description' | 'status' | 'assigneeProfileIds' | 'labels' | 'order'>>): Promise<AgoraTask> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: buildJsonHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`Update task failed: ${response.status}`);
  return response.json();
}

export async function fetchTaskDocuments(token: string, projectId: string, taskId: string): Promise<TaskDocumentListResponse> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/documents`, { headers: buildAuthHeaders(token) });
  if (!response.ok) throw new Error(`Task documents failed: ${response.status}`);
  return response.json();
}

export async function appendTaskDocument(token: string, projectId: string, taskId: string, body: string, kind: TaskDocumentKind = 'note'): Promise<TaskDocument> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/documents`, {
    method: 'POST',
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ body, kind })
  });
  if (!response.ok) throw new Error(`Append task document failed: ${response.status}`);
  return response.json();
}

export async function postMessage(token: string, text: string, channel = 'general'): Promise<AgoraMessage> {
  const response = await fetch('/api/v1/messages', {
    method: 'POST',
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ channel, text })
  });
  if (!response.ok) throw new Error(`Post failed: ${response.status}`);
  return response.json();
}

export async function postGroupMessage(token: string, groupId: string, text: string, metadata?: Record<string, unknown>): Promise<AgoraMessage> {
  const body = Object.keys(metadata ?? {}).length > 0 ? { text, metadata } : { text };
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: buildJsonHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Post group failed: ${response.status}`);
  return response.json();
}
