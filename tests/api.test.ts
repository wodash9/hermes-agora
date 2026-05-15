import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgoraApp } from '../src/server/app';
import { loadServerConfig } from '../src/server/config';
import { SQLiteMessageStore } from '../src/server/store';

let dir: string;
let app: Awaited<ReturnType<typeof createAgoraApp>>['app'];

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agora-api-'));
  const config = loadServerConfig({ HUB_AGENT_TOKEN: 'test-secret', DATA_FILE: join(dir, 'store.json'), CORS_ORIGIN: 'http://localhost:3000' });
  const store = await SQLiteMessageStore.open(config.dataFile);
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

  it('lets admins create groups with assigned Hermes profiles', async () => {
    const create = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Equipo QA', memberProfileIds: ['columbo-qa', 'daneel-cto'] })
      .expect(201);

    expect(create.body.name).toBe('Equipo QA');
    expect(create.body.memberProfileIds).toEqual(['columbo-qa', 'daneel-cto']);

    const list = await request(app)
      .get('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .expect(200);
    expect(list.body.groups.map((group: { id: string }) => group.id)).toContain(create.body.id);
  });

  it('lets admins add and remove profiles from an existing group', async () => {
    const create = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Equipo Mutable', memberProfileIds: ['jeeves-ops', 'daneel-cto'] })
      .expect(201);

    const update = await request(app)
      .patch(`/api/v1/groups/${create.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Equipo Mutable', memberProfileIds: ['daneel-cto', 'columbo-qa'] })
      .expect(200);

    expect(update.body.memberProfileIds).toEqual(['daneel-cto', 'columbo-qa']);
    await request(app)
      .get(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .expect(403);
    await request(app)
      .get(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .expect(200);
  });

  it('rejects group creation by non-admin agents, unknown members and ids that cannot be used as group channels', async () => {
    await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ name: 'Nope', memberProfileIds: ['jeeves-ops'] })
      .expect(403);

    await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Invalid', memberProfileIds: ['ghost-agent'] })
      .expect(400);

    await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ id: 'a'.repeat(59), name: 'Too Long', memberProfileIds: ['jeeves-ops'] })
      .expect(400);
  });

  it('deletes groups so members can no longer read them', async () => {
    const create = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Temporary Squad', memberProfileIds: ['jeeves-ops'] })
      .expect(201);

    await request(app)
      .delete(`/api/v1/groups/${create.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .expect(204);

    await request(app)
      .get(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .expect(404);
  });

  it('restricts group messages to assigned members', async () => {
    const create = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Legal Squad', memberProfileIds: ['portia-legal', 'atticus-suplan-legal'] })
      .expect(201);

    await request(app)
      .post(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'portia-legal')
      .send({ text: 'TASK legal only' })
      .expect(201);

    const directed = await request(app)
      .post(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'portia-legal')
      .send({ text: 'TASK legal directed', metadata: { targetProfileIds: ['atticus-suplan-legal'] } })
      .expect(201);
    expect(directed.body.metadata.targetProfileIds).toEqual(['atticus-suplan-legal']);

    await request(app)
      .post(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'portia-legal')
      .send({ text: 'TASK invalid target', metadata: { targetProfileIds: ['jeeves-ops'] } })
      .expect(400);

    await request(app)
      .post(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'portia-legal')
      .send({ text: 'TASK empty directed target', metadata: { targetProfileIds: [] } })
      .expect(400);

    const memberRead = await request(app)
      .get(`/api/v1/groups/${create.body.id}/messages?limit=10`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'atticus-suplan-legal')
      .expect(200);
    expect(memberRead.body.messages.map((message: { text: string }) => message.text)).toEqual(['TASK legal only', 'TASK legal directed']);
    expect(memberRead.body.messages[0].groupId).toBe(create.body.id);

    await request(app)
      .get(`/api/v1/groups/${create.body.id}/messages`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .expect(403);
  });

  it('creates private projects for the requester and keeps them hidden from outsiders', async () => {
    const create = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ name: 'Jeeves Private', description: 'Solo propietario' })
      .expect(201);

    expect(create.body.id).toBe('jeeves-private');
    expect(create.body.ownerProfileId).toBe('jeeves-ops');
    expect(create.body.memberProfileIds).toEqual([]);
    expect(create.body.sharedGroupIds).toEqual([]);

    const ownerList = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .expect(200);
    expect(ownerList.body.projects.map((project: { id: string }) => project.id)).toContain(create.body.id);

    const outsiderList = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .expect(200);
    expect(outsiderList.body.projects.map((project: { id: string }) => project.id)).not.toContain(create.body.id);

    await request(app)
      .get(`/api/v1/projects/${create.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .expect(403);
  });

  it('shares projects through groups and limits project management to owner or admin', async () => {
    const group = await request(app)
      .post('/api/v1/groups')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Proyecto Grupo', memberProfileIds: ['jeeves-ops', 'columbo-qa'] })
      .expect(201);

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ name: 'Shared By Group', sharedGroupIds: [group.body.id] })
      .expect(201);

    expect(project.body.ownerProfileId).toBe('jeeves-ops');
    expect(project.body.sharedGroupIds).toEqual([group.body.id]);

    const groupMemberList = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .expect(200);
    expect(groupMemberList.body.projects.map((item: { id: string }) => item.id)).toContain(project.body.id);

    await request(app)
      .post(`/api/v1/projects/${project.body.id}/tasks`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ title: 'Tarea por grupo' })
      .expect(201);

    await request(app)
      .patch(`/api/v1/projects/${project.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ name: 'No debería' })
      .expect(403);

    await request(app)
      .get(`/api/v1/projects/${project.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .expect(403);
  });

  it('creates projects and restricts visibility to project members', async () => {
    const create = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Agora Roadmap', description: 'Trabajo de producto', memberProfileIds: ['daneel-cto', 'columbo-qa'] })
      .expect(201);

    expect(create.body.id).toBe('agora-roadmap');
    expect(create.body.memberProfileIds).toEqual(['daneel-cto', 'columbo-qa']);

    const memberList = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .expect(200);
    expect(memberList.body.projects.map((project: { id: string }) => project.id)).toContain(create.body.id);

    const outsiderList = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .expect(200);
    expect(outsiderList.body.projects.map((project: { id: string }) => project.id)).not.toContain(create.body.id);

    const jeevesPrivate = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ name: 'Jeeves Own Project' })
      .expect(201);
    expect(jeevesPrivate.body.ownerProfileId).toBe('jeeves-ops');
  });

  it('lets project members create, move, read and document kanban tasks', async () => {
    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Kanban QA', memberProfileIds: ['daneel-cto', 'columbo-qa'] })
      .expect(201);

    const task = await request(app)
      .post(`/api/v1/projects/${project.body.id}/tasks`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .send({ title: 'Implementar tablero', description: 'MVP interactivo', assigneeProfileIds: ['columbo-qa'], labels: ['ui'] })
      .expect(201);

    expect(task.body.status).toBe('backlog');
    expect(task.body.assigneeProfileIds).toEqual(['columbo-qa']);

    const moved = await request(app)
      .patch(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ status: 'review' })
      .expect(200);
    expect(moved.body.status).toBe('review');

    await request(app)
      .post(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/documents`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ kind: 'qa', body: 'QA: revisar responsive antes de deploy' })
      .expect(201);

    const docs = await request(app)
      .get(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/documents`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .expect(200);
    expect(docs.body.documents[0].body).toContain('QA');

    const emptyWhiteboard = await request(app)
      .get(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/whiteboard`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .expect(200);
    expect(emptyWhiteboard.body.taskId).toBe(task.body.id);
    expect(emptyWhiteboard.body.strokes).toEqual([]);

    const whiteboard = await request(app)
      .patch(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/whiteboard`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({
        title: 'Flujo de pantalla',
        strokes: [
          { id: 'rect_1', kind: 'rectangle', color: '#93c5fd', fill: '#0f172a', size: 3, label: 'UI', points: [{ x: 10, y: 10 }, { x: 120, y: 80 }] },
          { id: 'circle_1', kind: 'circle', color: '#a7f3d0', size: 2, label: 'Agente', points: [{ x: 220, y: 40 }, { x: 300, y: 120 }] },
          { id: 'arrow_1', kind: 'arrow', color: '#fbbf24', size: 4, label: 'evento', points: [{ x: 120, y: 45 }, { x: 220, y: 80 }] }
        ]
      })
      .expect(200);
    expect(whiteboard.body.title).toBe('Flujo de pantalla');
    expect(whiteboard.body.strokes.map((stroke: { kind: string }) => stroke.kind)).toEqual(['rectangle', 'circle', 'arrow']);
    expect(whiteboard.body.strokes[0]).toMatchObject({ label: 'UI', fill: '#0f172a' });

    const renamedWhiteboard = await request(app)
      .patch(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/whiteboard`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ title: 'Flujo refinado' })
      .expect(200);
    expect(renamedWhiteboard.body.title).toBe('Flujo refinado');
    expect(renamedWhiteboard.body.strokes[2]).toMatchObject({ kind: 'arrow', label: 'evento' });

    await request(app)
      .patch(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/whiteboard`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ strokes: [{ id: 'bad', color: '#93c5fd', size: 3, points: [{ x: 'NaN', y: 10 }] }] })
      .expect(400);

    const manyStrokes = Array.from({ length: 90 }, (_, index) => ({ id: `stroke_${index}`, color: '#93c5fd', size: 3, points: Array.from({ length: 130 }, (__, pointIndex) => ({ x: pointIndex, y: index })) }));
    const cappedWhiteboard = await request(app)
      .patch(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/whiteboard`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'columbo-qa')
      .send({ title: 'Capped', strokes: manyStrokes })
      .expect(200);
    expect(cappedWhiteboard.body.strokes).toHaveLength(80);
    expect(cappedWhiteboard.body.strokes[0].points).toHaveLength(120);

    await request(app)
      .get(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/whiteboard`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .expect(403);

    await request(app)
      .patch(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'jeeves-ops')
      .send({ status: 'done' })
      .expect(403);

    await request(app)
      .post(`/api/v1/projects/${project.body.id}/tasks`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .send({ title: 'Asignación inválida', assigneeProfileIds: ['jeeves-ops'] })
      .expect(400);
  });

  it('deletes projects with their tasks and documents', async () => {
    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .send({ name: 'Temporary Project', memberProfileIds: ['daneel-cto'] })
      .expect(201);

    const task = await request(app)
      .post(`/api/v1/projects/${project.body.id}/tasks`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .send({ title: 'Tarea temporal' })
      .expect(201);

    await request(app)
      .post(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}/documents`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .send({ body: 'Documento temporal' })
      .expect(201);

    await request(app)
      .delete(`/api/v1/projects/${project.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'seldon-ceo')
      .expect(204);

    await request(app)
      .get(`/api/v1/projects/${project.body.id}/tasks/${task.body.id}`)
      .set('Authorization', 'Bearer test-secret')
      .set('X-Hermes-Profile', 'daneel-cto')
      .expect(404);
  });
});
