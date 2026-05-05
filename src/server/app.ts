import { EventEmitter } from 'node:events';
import express from 'express';
import cors from 'cors';
import type { ServerConfig } from './config.js';
import { requireIdentity, requireScope, type AuthenticatedRequest } from './auth.js';
import { JsonMessageStore, normalizeChannel } from './store.js';
import { canAccessChannel } from './auth.js';
import type { AgoraMessage } from '../shared/types.js';

export interface AgoraEvents {
  on(event: 'message:new', listener: (message: AgoraMessage) => void): this;
  emit(event: 'message:new', message: AgoraMessage): boolean;
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
