import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgoraApp } from '../src/server/app';
import { loadServerConfig } from '../src/server/config';
import { JsonMessageStore } from '../src/server/store';
import { attachAgoraSocket } from '../src/server/socket';

let dir: string;
let httpServer: HttpServer;
let baseUrl: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agora-socket-'));
  const config = loadServerConfig({ HUB_AGENT_TOKEN: 'test-secret', DATA_FILE: join(dir, 'store.json'), CORS_ORIGIN: 'http://localhost:3000' });
  const store = await JsonMessageStore.open(config.dataFile);
  const { app, events } = await createAgoraApp({ config, store });
  httpServer = createServer(app);
  attachAgoraSocket(httpServer, config, events);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

function connect(auth?: Record<string, string>): Promise<Socket> {
  const socket = createClient(baseUrl, { auth, transports: ['websocket'], forceNew: true, reconnection: false });
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

describe('Socket.IO auth', () => {
  it('rejects unauthenticated socket clients', async () => {
    await expect(connect()).rejects.toThrow();
  });

  it('accepts known Hermes profile with valid token', async () => {
    const socket = await connect({ token: 'test-secret', profileId: 'seldon-ceo' });
    expect(socket.connected).toBe(true);
    socket.close();
  });
});
