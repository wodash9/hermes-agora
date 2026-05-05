import type { AgoraMessage, Identity, MessageListResponse, ProfileStatusResponse } from '../shared/types';

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
