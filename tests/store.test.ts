import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonMessageStore } from '../src/server/store';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('JsonMessageStore', () => {
  it('persists posted messages and returns newest history last', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.json');
    const store = await JsonMessageStore.open(file);
    const msg = await store.createMessage({ channel: 'general', text: 'hola', author: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }, metadata: { task: 'demo' } });
    const reopened = await JsonMessageStore.open(file);
    const history = await reopened.listMessages({ channel: 'general', limit: 10 });
    expect(history.messages).toHaveLength(1);
    expect(history.messages[0].id).toBe(msg.id);
    expect(history.messages[0].text).toBe('hola');
  });

  it('serializes concurrent profile status writes without tmp-file races', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.json');
    const store = await JsonMessageStore.open(file);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.updateProfileStatus({
      profileId: `agent-${index}`,
      status: 'idle',
      note: `heartbeat ${index}`
    })));
    const reopened = await JsonMessageStore.open(file);
    const statuses = reopened.listProfileStatuses(Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`agent-${index}`, {
      displayName: `Agent ${index}`,
      scopes: ['messages:read' as const],
      channels: ['general']
    }])));
    expect(statuses.profiles).toHaveLength(20);
    expect(statuses.profiles.every((profile) => profile.status === 'idle')).toBe(true);
  });

  it('persists projects, kanban tasks and task documents across reopen', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.json');
    const store = await JsonMessageStore.open(file);
    const author = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const project = await store.createProject({ name: 'Persistent Project', description: 'Persistencia', memberProfileIds: ['daneel-cto'], createdBy: author });
    const task = await store.createProjectTask({ projectId: project.id, title: 'Persistir tarea', assigneeProfileIds: ['daneel-cto'], createdBy: author });
    await store.updateProjectTask(project.id, task.id, { status: 'done', updatedBy: author });
    await store.appendTaskDocument(project.id, task.id, { kind: 'result', body: 'Hecho', author });

    const reopened = await JsonMessageStore.open(file);
    expect(reopened.listProjects().projects[0].name).toBe('Persistent Project');
    expect(reopened.listProjectTasks(project.id).tasks[0].status).toBe('done');
    expect(reopened.listTaskDocuments(project.id, task.id).documents[0].body).toBe('Hecho');
  });
});
