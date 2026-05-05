import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import type { AgoraEvents } from './app.js';
import { authenticateToken } from './auth.js';

export function attachAgoraSocket(httpServer: HttpServer, config: ServerConfig, events: AgoraEvents): Server {
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
    const identity = socket.data.identity as { channels?: string[]; scopes?: string[] } | undefined;
    const channels = identity?.scopes?.includes('admin') ? ['general', 'strategy', 'qa'] : identity?.channels ?? ['general'];
    for (const channel of channels) socket.join(channel);
    socket.emit('room:joined', { channels });
  });

  events.on('message:new', (message) => {
    io.to(message.channel).emit('message:new', message);
  });

  return io;
}
