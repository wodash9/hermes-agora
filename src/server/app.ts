import { EventEmitter } from 'node:events';
import express from 'express';
import cors from 'cors';
import type { ServerConfig } from './config.js';
import { requireIdentity, requireScope, type AuthenticatedRequest } from './auth.js';
import { JsonMessageStore, normalizeChannel, normalizeGroupId, normalizeProjectId, parseKanbanStatus, parseProfilePresence, parseProjectStatus, parseTaskDocumentKind } from './store.js';
import { canAccessChannel } from './auth.js';
import type { AgoraGroup, AgoraMessage, AgoraProject, AgoraTask, Identity, TaskDocument } from '../shared/types.js';

export interface AgoraEvents {
  on(event: 'message:new', listener: (message: AgoraMessage) => void): this;
  emit(event: 'message:new', message: AgoraMessage): boolean;
  on(event: 'group:updated', listener: (group: AgoraGroup) => void): this;
  emit(event: 'group:updated', group: AgoraGroup): boolean;
  on(event: 'project:updated', listener: (project: AgoraProject) => void): this;
  emit(event: 'project:updated', project: AgoraProject): boolean;
  on(event: 'project:deleted', listener: (projectId: string) => void): this;
  emit(event: 'project:deleted', projectId: string): boolean;
  on(event: 'task:updated', listener: (task: AgoraTask) => void): this;
  emit(event: 'task:updated', task: AgoraTask): boolean;
  on(event: 'task:documented', listener: (payload: { task: AgoraTask; document: TaskDocument }) => void): this;
  emit(event: 'task:documented', payload: { task: AgoraTask; document: TaskDocument }): boolean;
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
      const metadata = buildGroupMessageMetadata(req.body.metadata, group);
      const message = await store.createMessage({
        channel: `group-${group.id}`,
        groupId: group.id,
        text: typeof req.body.text === 'string' ? req.body.text : '',
        author: req.identity!,
        metadata,
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

  app.get('/api/v1/projects', auth, requireScope('projects:read'), (req: AuthenticatedRequest, res) => {
    const allProjects = store.listProjects();
    const projects = canManageProjects(req.identity!) ? allProjects.projects : allProjects.projects.filter((project) => isProjectMember(req.identity!, project));
    res.json({ projects, generatedAt: allProjects.generatedAt });
  });

  app.post('/api/v1/projects', auth, requireScope('projects:write'), async (req: AuthenticatedRequest, res) => {
    if (!canManageProjects(req.identity!)) return res.status(403).json({ error: 'Only humans or admin agents can create projects' });
    try {
      const memberProfileIds = parseMemberProfileIds(req.body.memberProfileIds, config);
      const project = await store.createProject({
        id: typeof req.body.id === 'string' ? req.body.id : undefined,
        name: typeof req.body.name === 'string' ? req.body.name : '',
        description: typeof req.body.description === 'string' ? req.body.description : '',
        memberProfileIds,
        createdBy: req.identity!
      });
      events.emit('project:updated', project);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/projects/:projectId', auth, requireScope('projects:read'), (req: AuthenticatedRequest, res) => {
    try {
      const project = requireProjectAccess(store, req.identity!, String(req.params.projectId));
      res.json(project);
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/v1/projects/:projectId', auth, requireScope('projects:write'), async (req: AuthenticatedRequest, res) => {
    if (!canManageProjects(req.identity!)) return res.status(403).json({ error: 'Only humans or admin agents can update projects' });
    try {
      const projectId = normalizeProjectId(String(req.params.projectId));
      const project = await store.updateProject(projectId, {
        name: typeof req.body.name === 'string' ? req.body.name : undefined,
        description: typeof req.body.description === 'string' ? req.body.description : undefined,
        memberProfileIds: Array.isArray(req.body.memberProfileIds) ? parseMemberProfileIds(req.body.memberProfileIds, config) : undefined,
        status: typeof req.body.status === 'string' ? parseProjectStatus(req.body.status) : undefined
      });
      events.emit('project:updated', project);
      res.json(project);
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/v1/projects/:projectId', auth, requireScope('projects:write'), async (req: AuthenticatedRequest, res) => {
    if (!canManageProjects(req.identity!)) return res.status(403).json({ error: 'Only humans or admin agents can delete projects' });
    try {
      const projectId = normalizeProjectId(String(req.params.projectId));
      const deleted = await store.deleteProject(projectId);
      if (!deleted) return res.status(404).json({ error: 'Project not found' });
      events.emit('project:deleted', projectId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/projects/:projectId/tasks', auth, requireScope('projects:read'), (req: AuthenticatedRequest, res) => {
    try {
      const project = requireProjectAccess(store, req.identity!, String(req.params.projectId));
      const status = typeof req.query.status === 'string' ? parseKanbanStatus(req.query.status) : undefined;
      const assigneeProfileId = typeof req.query.assigneeProfileId === 'string' ? req.query.assigneeProfileId : undefined;
      res.json(store.listProjectTasks(project.id, { status, assigneeProfileId }));
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.post('/api/v1/projects/:projectId/tasks', auth, requireScope('projects:write'), async (req: AuthenticatedRequest, res) => {
    try {
      const project = requireProjectAccess(store, req.identity!, String(req.params.projectId));
      const task = await store.createProjectTask({
        projectId: project.id,
        title: typeof req.body.title === 'string' ? req.body.title : '',
        description: typeof req.body.description === 'string' ? req.body.description : '',
        status: typeof req.body.status === 'string' ? parseKanbanStatus(req.body.status) : undefined,
        assigneeProfileIds: Array.isArray(req.body.assigneeProfileIds) ? req.body.assigneeProfileIds : [],
        labels: Array.isArray(req.body.labels) ? req.body.labels : [],
        sourceMessageId: typeof req.body.sourceMessageId === 'string' ? req.body.sourceMessageId : null,
        sourceGroupId: typeof req.body.sourceGroupId === 'string' ? req.body.sourceGroupId : null,
        createdBy: req.identity!
      });
      events.emit('task:updated', task);
      res.status(201).json(task);
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/projects/:projectId/tasks/:taskId', auth, requireScope('projects:read'), (req: AuthenticatedRequest, res) => {
    try {
      const project = requireProjectAccess(store, req.identity!, String(req.params.projectId));
      const task = store.getProjectTask(project.id, String(req.params.taskId));
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/v1/projects/:projectId/tasks/:taskId', auth, requireScope('projects:write'), async (req: AuthenticatedRequest, res) => {
    try {
      const project = requireProjectAccess(store, req.identity!, String(req.params.projectId));
      const task = await store.updateProjectTask(project.id, String(req.params.taskId), {
        title: typeof req.body.title === 'string' ? req.body.title : undefined,
        description: typeof req.body.description === 'string' ? req.body.description : undefined,
        status: typeof req.body.status === 'string' ? parseKanbanStatus(req.body.status) : undefined,
        assigneeProfileIds: Array.isArray(req.body.assigneeProfileIds) ? req.body.assigneeProfileIds : undefined,
        labels: Array.isArray(req.body.labels) ? req.body.labels : undefined,
        order: typeof req.body.order === 'number' ? req.body.order : undefined,
        updatedBy: req.identity!
      });
      events.emit('task:updated', task);
      res.json(task);
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.get('/api/v1/projects/:projectId/tasks/:taskId/documents', auth, requireScope('projects:read'), (req: AuthenticatedRequest, res) => {
    try {
      requireProjectAccess(store, req.identity!, String(req.params.projectId));
      res.json(store.listTaskDocuments(String(req.params.projectId), String(req.params.taskId)));
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
    }
  });

  app.post('/api/v1/projects/:projectId/tasks/:taskId/documents', auth, requireScope('projects:write'), async (req: AuthenticatedRequest, res) => {
    try {
      const project = requireProjectAccess(store, req.identity!, String(req.params.projectId));
      const document = await store.appendTaskDocument(project.id, String(req.params.taskId), {
        kind: typeof req.body.kind === 'string' ? parseTaskDocumentKind(req.body.kind) : undefined,
        body: typeof req.body.body === 'string' ? req.body.body : '',
        author: req.identity!
      });
      const task = store.getProjectTask(project.id, String(req.params.taskId));
      if (task) events.emit('task:documented', { task, document });
      res.status(201).json(document);
    } catch (error) {
      res.status(projectAccessStatus(error as Error)).json({ error: (error as Error).message });
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

function canManageProjects(identity: Identity): boolean {
  return identity.type === 'human' || identity.scopes.includes('admin');
}

function isGroupMember(identity: Identity, group: AgoraGroup): boolean {
  return canManageGroups(identity) || group.memberProfileIds.includes(identity.profileId);
}

function isProjectMember(identity: Identity, project: AgoraProject): boolean {
  return canManageProjects(identity) || project.memberProfileIds.includes(identity.profileId);
}

function requireGroupAccess(store: JsonMessageStore, identity: Identity, groupIdRaw: string): AgoraGroup {
  const group = store.getGroup(groupIdRaw);
  if (!group) throw new Error('Group not found');
  if (!isGroupMember(identity, group)) throw new Error('Group forbidden for this identity');
  return group;
}

function requireProjectAccess(store: JsonMessageStore, identity: Identity, projectIdRaw: string): AgoraProject {
  const project = store.getProject(projectIdRaw);
  if (!project) throw new Error('Project not found');
  if (!isProjectMember(identity, project)) throw new Error('Project forbidden for this identity');
  return project;
}

function groupAccessStatus(error: Error): number {
  if (error.message === 'Group not found') return 404;
  if (error.message === 'Group forbidden for this identity') return 403;
  return 400;
}

function projectAccessStatus(error: Error): number {
  if (error.message === 'Project not found' || error.message === 'Task not found') return 404;
  if (error.message === 'Project forbidden for this identity') return 403;
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

function buildGroupMessageMetadata(value: unknown, group: AgoraGroup): Record<string, unknown> {
  const metadata: Record<string, unknown> = typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  if (!Object.prototype.hasOwnProperty.call(metadata, 'targetProfileIds')) return metadata;

  if (!Array.isArray(metadata.targetProfileIds)) throw new Error('targetProfileIds must be an array');
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const item of metadata.targetProfileIds) {
    if (typeof item !== 'string') throw new Error('Invalid target profile id');
    const profileId = item.trim().toLowerCase();
    if (!group.memberProfileIds.includes(profileId)) throw new Error(`Target profile is not a member of this group: ${profileId}`);
    if (!seen.has(profileId)) {
      seen.add(profileId);
      targets.push(profileId);
    }
  }
  if (targets.length === 0) throw new Error('targetProfileIds must include at least one group member');
  metadata.targetProfileIds = targets;
  return metadata;
}
