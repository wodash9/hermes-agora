import request from 'supertest';
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
let app: Awaited<ReturnType<typeof createAgoraApp>>['app'];
let baseUrl: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agora-socket-'));
  const config = loadServerConfig({ HUB_AGENT_TOKEN: 'test-secret', DATA_FILE: join(dir, 'store.json'), CORS_ORIGIN: 'http://localhost:3000' });
  const store = await JsonMessageStore.open(config.dataFile);
  const created = await createAgoraApp({ config, store });
  app = created.app;
  httpServer = createServer(app);
  attachAgoraSocket(httpServer, config, created.events, store);
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

  it('emits group messages only to assigned group members', async () => {
    const member = await connect({ token: 'test-secret', profileId: 'jeeves-ops' });
    const outsider = await connect({ token: 'test-secret', profileId: 'columbo-qa' });
    const group = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Socket Squad', memberProfileIds: ['jeeves-ops'] })
      .expect(201);

    let memberCount = 0;
    let outsiderCount = 0;
    member.on('message:new', () => { memberCount += 1; });
    outsider.on('message:new', () => { outsiderCount += 1; });

    await request(app)
      .post(`/api/v1/groups/${group.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ text: 'socket private' })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(memberCount).toBe(1);
    expect(outsiderCount).toBe(0);
    member.close();
    outsider.close();
  });
});
