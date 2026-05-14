import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import type { AgoraEvents } from './app.js';
import { authenticateToken } from './auth.js';
import type { SQLiteMessageStore } from './store.js';
import type { Identity } from '../shared/types.js';

export function attachAgoraSocket(httpServer: HttpServer, config: ServerConfig, events: AgoraEvents, store: SQLiteMessageStore): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true }
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : undefined;
      const profileId = typeof socket.handshake.auth.profileId === 'string' ? socket.handshake.auth.profileId : undefined;
      socket.data.identity = await authenticateToken(config, token, profileId);
      next();
    } catch (error) {
      next(new Error((error as Error).message));
    }
  });

  io.on('connection', (socket) => {
    const identity = socket.data.identity as Identity | undefined;
    const channels = identity?.scopes?.includes('admin') ? ['general', 'strategy', 'qa'] : identity?.channels ?? ['general'];
    for (const channel of channels) socket.join(channel);
    for (const group of visibleGroupsFor(identity, store)) socket.join(groupRoom(group.id));
    for (const project of visibleProjectsFor(identity, store)) socket.join(projectRoom(project.id));
    socket.emit('room:joined', { channels, groups: visibleGroupsFor(identity, store).map((group) => group.id), projects: visibleProjectsFor(identity, store).map((project) => project.id) });
  });

  events.on('group:updated', (group) => {
    for (const socket of io.sockets.sockets.values()) {
      const identity = socket.data.identity as Identity | undefined;
      if (identity && canSeeGroup(identity, group)) socket.join(groupRoom(group.id));
      else socket.leave(groupRoom(group.id));
    }
  });

  events.on('message:new', (message) => {
    const room = message.groupId ? groupRoom(message.groupId) : message.channel;
    io.to(room).emit('message:new', message);
  });

  events.on('project:updated', (project) => {
    for (const socket of io.sockets.sockets.values()) {
      const identity = socket.data.identity as Identity | undefined;
      if (identity && canSeeProject(identity, project, store)) socket.join(projectRoom(project.id));
      else socket.leave(projectRoom(project.id));
    }
    io.to(projectRoom(project.id)).emit('project:updated', project);
  });

  events.on('project:deleted', (projectId) => {
    io.to(projectRoom(projectId)).emit('project:deleted', { projectId });
  });

  events.on('task:updated', (task) => {
    io.to(projectRoom(task.projectId)).emit('task:updated', task);
  });

  events.on('task:documented', (payload) => {
    io.to(projectRoom(payload.task.projectId)).emit('task:documented', payload);
  });

  return io;
}

function visibleGroupsFor(identity: Identity | undefined, store: SQLiteMessageStore) {
  if (!identity) return [];
  const groups = store.listGroups().groups;
  if (identity.scopes.includes('admin')) return groups;
  return groups.filter((group) => canSeeGroup(identity, group));
}

function visibleProjectsFor(identity: Identity | undefined, store: SQLiteMessageStore) {
  if (!identity || !hasProjectReadScope(identity)) return [];
  const projects = store.listProjects().projects;
  if (identity.scopes.includes('admin')) return projects;
  return projects.filter((project) => canSeeProject(identity, project, store));
}

function canSeeGroup(identity: Identity, group: { createdBy: { profileId: string }; memberProfileIds: string[] }): boolean {
  return identity.scopes.includes('admin') || group.createdBy.profileId === identity.profileId || group.memberProfileIds.includes(identity.profileId);
}

function canSeeProject(identity: Identity, project: { ownerProfileId: string; memberProfileIds: string[]; sharedGroupIds: string[] }, store: SQLiteMessageStore): boolean {
  if (!hasProjectReadScope(identity)) return false;
  return identity.scopes.includes('admin') || project.ownerProfileId === identity.profileId || project.memberProfileIds.includes(identity.profileId) || project.sharedGroupIds.some((groupId) => {
    const group = store.getGroup(groupId);
    return group ? canSeeGroup(identity, group) : false;
  });
}

function hasProjectReadScope(identity: Identity): boolean {
  return identity.type === 'human' || identity.scopes.includes('admin') || identity.scopes.includes('projects:read');
}

function groupRoom(groupId: string): string {
  return `group:${groupId}`;
}

function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}
