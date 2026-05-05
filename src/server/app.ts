import { EventEmitter } from 'node:events';
import express from 'express';
import cors from 'cors';
import type { ServerConfig } from './config.js';
import { requireIdentity, requireScope, type AuthenticatedRequest } from './auth.js';
import { JsonMessageStore, normalizeChannel, normalizeGroupId, parseProfilePresence } from './store.js';
import { canAccessChannel } from './auth.js';
import type { AgoraGroup, AgoraMessage, Identity } from '../shared/types.js';

export interface AgoraEvents {
  on(event: 'message:new', listener: (message: AgoraMessage) => void): this;
  emit(event: 'message:new', message: AgoraMessage): boolean;
  on(event: 'group:updated', listener: (group: AgoraGroup) => void): this;
  emit(event: 'group:updated', group: AgoraGroup): boolean;
}

export interface CreateAgoraAppOptions {
  config: ServerConfig;
  store: JsonMessageStore;
}

export async function createAgoraApp({ config, store }: CreateAgoraAppOptions) {
  const app = express();
  const events = new EventEmitter() as AgoraEvents;

  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin blocked'));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'hermes-agora', version: '0.1.0' }));

  const auth = requireIdentity(config);
  app.get('/api/v1/me', auth, (req: AuthenticatedRequest, res) => res.json(req.identity));

  app.get('/api/v1/messages', auth, requireScope('messages:read'), async (req: AuthenticatedRequest, res) => {
    const { channel, limit, after, before } = req.query;
    try {
      const channelSlug = normalizeChannel(typeof channel === 'string' ? channel : 'general');
      if (!canAccessChannel(req.identity!, channelSlug)) return res.status(403).json({ error: 'Channel forbidden for this identity' });
      const result = await store.listMessages({
        channel: channelSlug,
        limit: typeof limit === 'string' ? Number(limit) : 50,
        after: typeof after === 'string' ? after : undefined,
        before: typeof before === 'string' ? before : undefined
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post('/api/v1/messages', auth, requireScope('messages:write'), async (req: AuthenticatedRequest, res) => {
    try {
      const channelSlug = normalizeChannel(typeof req.body.channel === 'string' ? req.body.channel : 'general');
      if (!canAccessChannel(req.identity!, channelSlug)) return res.status(403).json({ error: 'Channel forbidden for this identity' });
      const message = await store.createMessage({
        channel: channelSlug,
        text: typeof req.body.text === 'string' ? req.body.text : '',
        author: req.identity!,
        metadata: typeof req.body.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : {},
        threadId: typeof req.body.threadId === 'string' ? req.body.threadId : null,
        replyTo: typeof req.body.replyTo === 'string' ? req.body.replyTo : null
      });
      events.emit('message:new', message);
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/groups', auth, requireScope('messages:read'), (req: AuthenticatedRequest, res) => {
    const allGroups = store.listGroups();
    const groups = canManageGroups(req.identity!) ? allGroups.groups : allGroups.groups.filter((group) => isGroupMember(req.identity!, group));
    res.json({ groups, generatedAt: allGroups.generatedAt });
  });

  app.post('/api/v1/groups', auth, requireScope('messages:write'), async (req: AuthenticatedRequest, res) => {
    if (!canManageGroups(req.identity!)) return res.status(403).json({ error: 'Only humans or admin agents can create groups' });
    try {
      const memberProfileIds = parseMemberProfileIds(req.body.memberProfileIds, config);
      const group = await store.createGroup({
        name: typeof req.body.name === 'string' ? req.body.name : '',
        memberProfileIds,
        createdBy: req.identity!,
        id: typeof req.body.id === 'string' ? req.body.id : undefined
      });
      events.emit('group:updated', group);
      res.status(201).json(group);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/v1/groups/:groupId', auth, requireScope('messages:write'), async (req: AuthenticatedRequest, res) => {
    if (!canManageGroups(req.identity!)) return res.status(403).json({ error: 'Only humans or admin agents can update groups' });
    try {
      const groupId = normalizeGroupId(String(req.params.groupId));
      const group = await store.updateGroup(groupId, {
        name: typeof req.body.name === 'string' ? req.body.name : undefined,
        memberProfileIds: Array.isArray(req.body.memberProfileIds) ? parseMemberProfileIds(req.body.memberProfileIds, config) : undefined
      });
      events.emit('group:updated', group);
      res.json(group);
    } catch (error) {
      const status = (error as Error).message === 'Group not found' ? 404 : 400;
      res.status(status).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/v1/groups/:groupId', auth, requireScope('messages:write'), async (req: AuthenticatedRequest, res) => {
    if (!canManageGroups(req.identity!)) return res.status(403).json({ error: 'Only humans or admin agents can delete groups' });
    try {
      const deleted = await store.deleteGroup(String(req.params.groupId));
      if (!deleted) return res.status(404).json({ error: 'Group not found' });
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/groups/:groupId/messages', auth, requireScope('messages:read'), async (req: AuthenticatedRequest, res) => {
    try {
      const group = requireGroupAccess(store, req.identity!, String(req.params.groupId));
      const { limit, after, before } = req.query;
      const result = await store.listMessages({
        groupId: group.id,
        limit: typeof limit === 'string' ? Number(limit) : 50,
        after: typeof after === 'string' ? after : undefined,
        before: typeof before === 'string' ? before : undefined
      });
      res.json(result);
    } catch (error) {
      const status = groupAccessStatus(error as Error);
      res.status(status).json({ error: (error as Error).message });
    }
  });

  app.post('/api/v1/groups/:groupId/messages', auth, requireScope('messages:write'), async (req: AuthenticatedRequest, res) => {
    try {
      const group = requireGroupAccess(store, req.identity!, String(req.params.groupId));
      const message = await store.createMessage({
        channel: `group-${group.id}`,
        groupId: group.id,
        text: typeof req.body.text === 'string' ? req.body.text : '',
        author: req.identity!,
        metadata: typeof req.body.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : {},
        threadId: typeof req.body.threadId === 'string' ? req.body.threadId : null,
        replyTo: typeof req.body.replyTo === 'string' ? req.body.replyTo : null
      });
      events.emit('message:new', message);
      res.status(201).json(message);
    } catch (error) {
      const status = groupAccessStatus(error as Error);
      res.status(status).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/profiles/status', auth, requireScope('messages:read'), (_req: AuthenticatedRequest, res) => {
    res.json(store.listProfileStatuses(config.agentProfiles));
  });

  app.post('/api/v1/profiles/status', auth, requireScope('messages:write'), async (req: AuthenticatedRequest, res) => {
    try {
      const status = parseProfilePresence(req.body.status);
      const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 240) : null;
      const updated = await store.updateProfileStatus({ profileId: req.identity!.profileId, status, note });
      res.json({ profileId: req.identity!.profileId, ...updated });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/me', auth, (req: AuthenticatedRequest, res) => res.json(req.identity));
  app.get('/api/messages', auth, requireScope('messages:read'), async (req: AuthenticatedRequest, res) => {
    try {
      const channelSlug = normalizeChannel(typeof req.query.channel === 'string' ? req.query.channel : 'general');
      if (!canAccessChannel(req.identity!, channelSlug)) return res.status(403).json({ error: 'Channel forbidden for this identity' });
      const result = await store.listMessages({ channel: channelSlug, limit: 50 });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  if (config.nodeEnv === 'production') {
    app.use(express.static('dist', { index: false, maxAge: '1y', immutable: true }));
    app.get(/^(?!\/api|\/health|\/socket\.io).*/, (_req, res) => res.sendFile('index.html', { root: 'dist' }));
  }

  return { app, events };
}

function canManageGroups(identity: Identity): boolean {
  return identity.type === 'human' || identity.scopes.includes('admin');
}

function isGroupMember(identity: Identity, group: AgoraGroup): boolean {
  return canManageGroups(identity) || group.memberProfileIds.includes(identity.profileId);
}

function requireGroupAccess(store: JsonMessageStore, identity: Identity, groupIdRaw: string): AgoraGroup {
  const group = store.getGroup(groupIdRaw);
  if (!group) throw new Error('Group not found');
  if (!isGroupMember(identity, group)) throw new Error('Group forbidden for this identity');
  return group;
}

function groupAccessStatus(error: Error): number {
  if (error.message === 'Group not found') return 404;
  if (error.message === 'Group forbidden for this identity') return 403;
  return 400;
}

function parseMemberProfileIds(value: unknown, config: ServerConfig): string[] {
  if (!Array.isArray(value)) throw new Error('memberProfileIds must be an array');
  const memberProfileIds: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('Invalid member profile id');
    const profileId = item.trim().toLowerCase();
    if (!config.agentProfiles[profileId]) throw new Error(`Unknown group member profile: ${profileId}`);
    if (!seen.has(profileId)) {
      seen.add(profileId);
      memberProfileIds.push(profileId);
    }
  }
  return memberProfileIds;
}
