import type { AgoraGroup, AgoraMessage, GroupListResponse, Identity, MessageListResponse, ProfileStatusResponse } from '../shared/types';

export async function fetchIdentity(token: string): Promise<Identity> {
  const response = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Identity failed: ${response.status}`);
  return response.json();
}

export async function fetchMessages(token: string, channel = 'general'): Promise<MessageListResponse> {
  const response = await fetch(`/api/v1/messages?channel=${encodeURIComponent(channel)}&limit=100`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Messages failed: ${response.status}`);
  return response.json();
}

export async function fetchGroups(token: string): Promise<GroupListResponse> {
  const response = await fetch('/api/v1/groups', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Groups failed: ${response.status}`);
  return response.json();
}

export async function createGroup(token: string, name: string, memberProfileIds: string[]): Promise<AgoraGroup> {
  const response = await fetch('/api/v1/groups', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, memberProfileIds })
  });
  if (!response.ok) throw new Error(`Create group failed: ${response.status}`);
  return response.json();
}

export async function updateGroup(token: string, groupId: string, name: string, memberProfileIds: string[]): Promise<AgoraGroup> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, memberProfileIds })
  });
  if (!response.ok) throw new Error(`Update group failed: ${response.status}`);
  return response.json();
}

export async function deleteGroup(token: string, groupId: string): Promise<void> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Delete group failed: ${response.status}`);
}

export async function fetchGroupMessages(token: string, groupId: string): Promise<MessageListResponse> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}/messages?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Group messages failed: ${response.status}`);
  return response.json();
}

export async function fetchProfileStatuses(token: string): Promise<ProfileStatusResponse> {
  const response = await fetch('/api/v1/profiles/status', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Profile status failed: ${response.status}`);
  return response.json();
}

export async function postMessage(token: string, text: string, channel = 'general'): Promise<AgoraMessage> {
  const response = await fetch('/api/v1/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text })
  });
  if (!response.ok) throw new Error(`Post failed: ${response.status}`);
  return response.json();
}

export async function postGroupMessage(token: string, groupId: string, text: string): Promise<AgoraMessage> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error(`Post group failed: ${response.status}`);
  return response.json();
}
