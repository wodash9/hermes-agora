import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SQLiteMessageStore } from '../src/server/store';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('SQLiteMessageStore', () => {
  it('persists posted messages and returns newest history last', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.sqlite');
    const store = await SQLiteMessageStore.open(file);
    const msg = await store.createMessage({ channel: 'general', text: 'hola', author: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }, metadata: { task: 'demo' } });
    const reopened = await SQLiteMessageStore.open(file);
    const history = await reopened.listMessages({ channel: 'general', limit: 10 });
    expect(history.messages).toHaveLength(1);
    expect(history.messages[0].id).toBe(msg.id);
    expect(history.messages[0].text).toBe('hola');
  });

  it('serializes concurrent profile status writes without tmp-file races', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.sqlite');
    const store = await SQLiteMessageStore.open(file);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.updateProfileStatus({
      profileId: `agent-${index}`,
      status: 'idle',
      note: `heartbeat ${index}`
    })));
    const reopened = await SQLiteMessageStore.open(file);
    const statuses = reopened.listProfileStatuses(Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`agent-${index}`, {
      displayName: `Agent ${index}`,
      scopes: ['messages:read' as const],
      channels: ['general']
    }])));
    expect(statuses.profiles).toHaveLength(20);
    expect(statuses.profiles.every((profile) => profile.status === 'idle')).toBe(true);
  });

  it('persists private/shared projects, kanban tasks and task documents across reopen', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.sqlite');
    const store = await SQLiteMessageStore.open(file);
    const author = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const project = await store.createProject({ name: 'Persistent Project', description: 'Persistencia', memberProfileIds: ['daneel-cto'], sharedGroupIds: ['qa-squad'], createdBy: author });
    expect(project.ownerProfileId).toBe('seldon-ceo');
    expect(project.sharedGroupIds).toEqual(['qa-squad']);
    const task = await store.createProjectTask({ projectId: project.id, title: 'Persistir tarea', assigneeProfileIds: ['daneel-cto'], createdBy: author });
    await store.updateProjectTask(project.id, task.id, { status: 'done', updatedBy: author });
    await store.appendTaskDocument(project.id, task.id, { kind: 'result', body: 'Hecho', author });
    await store.updateTaskWhiteboard(project.id, task.id, {
      title: 'Arquitectura inicial',
      strokes: [
        { id: 'rect_1', kind: 'rectangle', color: '#93c5fd', fill: '#1e293b', size: 3, label: 'API', points: [{ x: 12, y: 16 }, { x: 120, y: 90 }] },
        { id: 'circle_1', kind: 'circle', color: '#a7f3d0', size: 2, label: 'Agente', points: [{ x: 260, y: 40 }, { x: 340, y: 120 }] },
        { id: 'arrow_1', kind: 'arrow', color: '#fbbf24', size: 4, label: 'PATCH whiteboard', points: [{ x: 120, y: 60 }, { x: 260, y: 80 }] }
      ],
      updatedBy: author
    });

    const reopened = await SQLiteMessageStore.open(file);
    expect(reopened.listProjects().projects[0].name).toBe('Persistent Project');
    expect(reopened.listProjects().projects[0].ownerProfileId).toBe('seldon-ceo');
    expect(reopened.listProjects().projects[0].sharedGroupIds).toEqual(['qa-squad']);
    expect(reopened.listProjectTasks(project.id).tasks[0].status).toBe('done');
    expect(reopened.listTaskDocuments(project.id, task.id).documents[0].body).toBe('Hecho');
    expect(reopened.getTaskWhiteboard(project.id, task.id)?.title).toBe('Arquitectura inicial');
    expect(reopened.getTaskWhiteboard(project.id, task.id)?.strokes.map((stroke) => stroke.kind)).toEqual(['rectangle', 'circle', 'arrow']);
    expect(reopened.getTaskWhiteboard(project.id, task.id)?.strokes[0]).toMatchObject({ label: 'API', fill: '#1e293b' });
  });

  it('updates project membership and task assignee pruning as one SQLite-backed mutation', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.sqlite');
    const store = await SQLiteMessageStore.open(file);
    const author = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const project = await store.createProject({ name: 'Membership Project', memberProfileIds: ['daneel-cto', 'columbo-qa'], createdBy: author });
    const task = await store.createProjectTask({ projectId: project.id, title: 'Reasignar', assigneeProfileIds: ['daneel-cto', 'columbo-qa'], createdBy: author });

    await store.updateProject(project.id, { memberProfileIds: ['columbo-qa'], name: 'Membership Project Updated' });

    const updatedProject = store.getProject(project.id);
    const updatedTask = store.getProjectTask(project.id, task.id);
    expect(updatedProject?.memberProfileIds).toEqual(['columbo-qa']);
    expect(updatedProject?.name).toBe('Membership Project Updated');
    expect(updatedTask?.assigneeProfileIds).toEqual(['columbo-qa']);
  });

  it('imports an existing JSON store into SQLite exactly once', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const dbFile = join(dir, 'store.sqlite');
    const jsonFile = join(dir, 'hermes-agora.json');
    writeFileSync(jsonFile, JSON.stringify({
      version: 1,
      messages: [{
        id: 'msg_legacy',
        channel: 'general',
        groupId: null,
        text: 'legacy message',
        author: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' },
        metadata: { migrated: true },
        createdAt: '2026-05-12T00:00:00.000Z',
        threadId: null,
        replyTo: null
      }],
      groups: [],
      profileStatuses: {},
      projects: [{
        id: 'legacy-project',
        name: 'Legacy Project',
        description: 'from json',
        status: 'active',
        ownerProfileId: 'seldon-ceo',
        memberProfileIds: ['seldon-ceo'],
        sharedGroupIds: [],
        createdAt: '2026-05-12T00:00:00.000Z',
        updatedAt: '2026-05-12T00:00:00.000Z',
        createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
      }],
      tasks: [{
        id: 'task_legacy',
        projectId: 'legacy-project',
        title: 'Legacy Task',
        description: 'migrate me',
        status: 'todo',
        assigneeProfileIds: ['seldon-ceo'],
        labels: ['migration'],
        order: 0,
        sourceMessageId: null,
        sourceGroupId: null,
        createdAt: '2026-05-12T00:00:00.000Z',
        updatedAt: '2026-05-12T00:00:00.000Z',
        createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' },
        updatedBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
      }],
      taskDocuments: [{
        id: 'doc_legacy',
        taskId: 'task_legacy',
        kind: 'note',
        body: 'legacy evidence',
        author: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' },
        createdAt: '2026-05-12T00:00:00.000Z'
      }]
    }), 'utf8');

    const store = await SQLiteMessageStore.open(dbFile, { importJsonFile: jsonFile });
    expect(store.listProjects().projects[0].id).toBe('legacy-project');
    expect(store.listProjectTasks('legacy-project').tasks[0].title).toBe('Legacy Task');
    expect(store.listTaskDocuments('legacy-project', 'task_legacy').documents[0].body).toBe('legacy evidence');

    const migratedBackup = `${jsonFile}.migrated`;
    expect(existsSync(migratedBackup)).toBe(true);
    expect(JSON.parse(readFileSync(migratedBackup, 'utf8')).projects).toHaveLength(1);

    writeFileSync(jsonFile, JSON.stringify({ version: 1, messages: [], groups: [], profileStatuses: {}, projects: [], tasks: [], taskDocuments: [] }), 'utf8');
    const reopened = await SQLiteMessageStore.open(dbFile, { importJsonFile: jsonFile });
    expect(reopened.listProjects().projects.map((project) => project.id)).toEqual(['legacy-project']);
  });
});
