import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import type { AgoraEvents } from './app.js';
import { authenticateToken } from './auth.js';
import type { JsonMessageStore } from './store.js';
import type { Identity } from '../shared/types.js';

export function attachAgoraSocket(httpServer: HttpServer, config: ServerConfig, events: AgoraEvents, store: JsonMessageStore): Server {
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
    socket.emit('room:joined', { channels, groups: visibleGroupsFor(identity, store).map((group) => group.id) });
  });

  events.on('group:updated', (group) => {
    for (const socket of io.sockets.sockets.values()) {
      const identity = socket.data.identity as Identity | undefined;
      if (identity && canSeeGroup(identity, group.memberProfileIds)) socket.join(groupRoom(group.id));
      else socket.leave(groupRoom(group.id));
    }
  });

  events.on('message:new', (message) => {
    const room = message.groupId ? groupRoom(message.groupId) : message.channel;
    io.to(room).emit('message:new', message);
  });

  return io;
}

function visibleGroupsFor(identity: Identity | undefined, store: JsonMessageStore) {
  if (!identity) return [];
  const groups = store.listGroups().groups;
  if (identity.type === 'human' || identity.scopes.includes('admin')) return groups;
  return groups.filter((group) => group.memberProfileIds.includes(identity.profileId));
}

function canSeeGroup(identity: Identity, memberProfileIds: string[]): boolean {
  return identity.type === 'human' || identity.scopes.includes('admin') || memberProfileIds.includes(identity.profileId);
}

function groupRoom(groupId: string): string {
  return `group:${groupId}`;
}
