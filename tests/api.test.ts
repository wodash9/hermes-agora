import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgoraApp } from '../src/server/app';
import { loadServerConfig } from '../src/server/config';
import { JsonMessageStore } from '../src/server/store';

let dir: string;
let app: Awaited<ReturnType<typeof createAgoraApp>>['app'];

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agora-api-'));
  const config = loadServerConfig({ HUB_AGENT_TOKEN: 'test-secret', DATA_FILE: join(dir, 'store.json'), CORS_ORIGIN: 'http://localhost:3000' });
  const store = await JsonMessageStore.open(config.dataFile);
  app = (await createAgoraApp({ config, store })).app;
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('agent API', () => {
  it('authenticates known profiles with token', async () => {
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer test-secret').set('X-Hermes-Profile', 'seldon-ceo').expect(200);
    expect(res.body.displayName).toBe('Seldon');
  });

  it('rejects invalid agent token', async () => {
    await request(app).get('/api/v1/me').set('Authorization', 'Bearer wrong').set('X-Hermes-Profile', 'seldon-ceo').expect(401);
  });

  it('rejects unknown profiles even with a valid token', async () => {
    await request(app).get('/api/v1/me').set('Authorization', 'Bearer test-secret').set('X-Hermes-Profile', 'unknown-agent').expect(403);
  });

  it('enforces profile channel allowlists', async () => {
    await request(app)
      .post('/api/v1/messages')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ channel: 'legal', text: 'should not pass' })
      .expect(403);
  });

  it('posts and lists agent messages', async () => {
    await request(app).post('/api/v1/messages').set('Authorization', 'Bearer test-secret').set('X-Hermes-Profile', 'seldon-ceo').send({ channel: 'general', text: 'DONE test' }).expect(201);
    const res = await request(app).get('/api/v1/messages?channel=general&limit=10').set('Authorization', 'Bearer test-secret').set('X-Hermes-Profile', 'columbo-qa').expect(200);
    expect(res.body.messages[0].text).toBe('DONE test');
    expect(res.body.messages[0].author.profileId).toBe('seldon-ceo');
  });

  it('lists monitor status for every configured Hermes profile', async () => {
    const res = await request(app).get('/api/v1/profiles/status').set('Authorization', 'Bearer test-secret').set('X-Hermes-Profile', 'seldon-ceo').expect(200);
    expect(res.body.profiles.map((profile: { profileId: string }) => profile.profileId)).toContain('daneel-cto');
    expect(res.body.profiles.map((profile: { profileId: string }) => profile.profileId)).toContain('cordelia-success');
    expect(res.body.profiles.find((profile: { profileId: string }) => profile.profileId === 'seldon-ceo').status).toBe('unknown');
  });

  it('updates profile status and last message activity for the monitor', async () => {
    await request(app)
      .post('/api/v1/profiles/status')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ status: 'idle', note: 'Esperando TASK' })
      .expect(200);
    await request(app)
      .post('/api/v1/messages')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ channel: 'general', text: 'DONE monitor' })
      .expect(201);

    const res = await request(app).get('/api/v1/profiles/status').set('Authorization', 'Bearer test-secret').set('X-Hermes-Profile', 'seldon-ceo').expect(200);
    const jeeves = res.body.profiles.find((profile: { profileId: string }) => profile.profileId === 'jeeves-ops');
    expect(jeeves.status).toBe('online');
    expect(jeeves.note).toBe('Esperando TASK');
    expect(jeeves.lastSeenAt).toBeTruthy();
    expect(jeeves.lastMessageAt).toBeTruthy();
  });
});
