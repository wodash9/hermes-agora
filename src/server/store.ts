import Database from 'better-sqlite3';
import { access, mkdir, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentProfileConfig, AgoraGroup, AgoraMessage, AgoraProject, AgoraTask, Author, GroupListResponse, KanbanStatus, MessageListResponse, ProfilePresence, ProfileStatus, ProfileStatusResponse, ProjectListResponse, ProjectStatus, TaskDocument, TaskDocumentKind, TaskDocumentListResponse, TaskListResponse, TaskWhiteboard, WhiteboardStroke } from '../shared/types.js';

interface StoredProfileStatus {
  status: ProfilePresence;
  lastSeenAt: string;
  lastMessageAt?: string | null;
  note?: string | null;
}

interface StoreFile {
  version: 1;
  messages: AgoraMessage[];
  groups: AgoraGroup[];
  profileStatuses: Record<string, StoredProfileStatus>;
  projects: AgoraProject[];
  tasks: AgoraTask[];
  taskDocuments: TaskDocument[];
  taskWhiteboards?: TaskWhiteboard[];
}

export interface CreateMessageInput {
  channel: string;
  groupId?: string | null;
  text: string;
  author: Author;
  metadata?: Record<string, unknown>;
  threadId?: string | null;
  replyTo?: string | null;
}

export interface ListMessagesInput {
  channel?: string;
  groupId?: string;
  limit?: number;
  after?: string;
  before?: string;
}

export interface CreateGroupInput {
  id?: string;
  name: string;
  memberProfileIds: string[];
  createdBy: Author;
}

export interface UpdateGroupInput {
  name?: string;
  memberProfileIds?: string[];
}

export interface UpdateProfileStatusInput {
  profileId: string;
  status: ProfilePresence;
  note?: string | null;
  lastMessageAt?: string | null;
}

export interface CreateProjectInput {
  id?: string;
  name: string;
  description?: string;
  memberProfileIds?: string[];
  sharedGroupIds?: string[];
  createdBy: Author;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  memberProfileIds?: string[];
  sharedGroupIds?: string[];
  status?: ProjectStatus;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: KanbanStatus;
  assigneeProfileIds?: string[];
  labels?: string[];
  sourceMessageId?: string | null;
  sourceGroupId?: string | null;
  createdBy: Author;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: KanbanStatus;
  assigneeProfileIds?: string[];
  labels?: string[];
  order?: number;
  updatedBy: Author;
}

export interface CreateTaskDocumentInput {
  kind?: TaskDocumentKind;
  body: string;
  author: Author;
}

export interface UpdateTaskWhiteboardInput {
  title?: string;
  strokes?: WhiteboardStroke[];
  updatedBy: Author;
}

export interface SQLiteMessageStoreOptions {
  importJsonFile?: string;
}

type MessageRow = {
  id: string;
  channel: string;
  group_id: string | null;
  text: string;
  author_json: string;
  metadata_json: string;
  created_at: string;
  thread_id: string | null;
  reply_to: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  member_profile_ids_json: string;
  created_at: string;
  updated_at: string;
  created_by_json: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  owner_profile_id: string;
  member_profile_ids_json: string;
  shared_group_ids_json: string;
  created_at: string;
  updated_at: string;
  created_by_json: string;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  assignee_profile_ids_json: string;
  labels_json: string;
  order_index: number;
  source_message_id: string | null;
  source_group_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_json: string;
  updated_by_json: string | null;
};

type TaskDocumentRow = {
  id: string;
  task_id: string;
  kind: TaskDocumentKind;
  body: string;
  author_json: string;
  created_at: string;
};

type TaskWhiteboardRow = {
  task_id: string;
  title: string;
  strokes_json: string;
  updated_at: string;
  updated_by_json: string;
};

type ProfileStatusRow = {
  profile_id: string;
  status: ProfilePresence;
  last_seen_at: string;
  last_message_at: string | null;
  note: string | null;
};

export class SQLiteMessageStore {
  private constructor(private readonly db: Database.Database) {}

  static async open(filePath: string, options: SQLiteMessageStoreOptions = {}): Promise<SQLiteMessageStore> {
    await mkdir(dirname(filePath), { recursive: true });
    const db = new Database(filePath);
    const store = new SQLiteMessageStore(db);
    store.configure();
    store.migrateSchema();
    await store.importJsonIfNeeded(options.importJsonFile);
    return store;
  }

  async createMessage(input: CreateMessageInput): Promise<AgoraMessage> {
    const groupId = input.groupId ? normalizeGroupId(input.groupId) : null;
    const channel = groupId ? normalizeChannel(input.channel || `group-${groupId}`) : normalizeChannel(input.channel);
    const text = input.text.trim();
    if (!text) throw new Error('Message text is required');
    if (text.length > 8000) throw new Error('Message text exceeds 8000 characters');
    if (input.metadata && JSON.stringify(input.metadata).length > 8192) throw new Error('Message metadata exceeds 8192 bytes');

    const now = new Date().toISOString();
    const message: AgoraMessage = {
      id: `msg_${randomUUID()}`,
      channel,
      groupId,
      text,
      author: input.author,
      metadata: input.metadata ?? {},
      createdAt: now,
      threadId: input.threadId ?? null,
      replyTo: input.replyTo ?? null
    };
    const insert = this.db.prepare(`INSERT INTO messages (id, channel, group_id, text, author_json, metadata_json, created_at, thread_id, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const tx = this.db.transaction(() => {
      insert.run(message.id, message.channel, message.groupId ?? null, message.text, toJson(message.author), toJson(message.metadata ?? {}), message.createdAt, message.threadId ?? null, message.replyTo ?? null);
      this.setProfileStatus(input.author.profileId, { status: 'online', lastSeenAt: now, lastMessageAt: now });
    });
    tx();
    return message;
  }

  async listMessages(input: ListMessagesInput = {}): Promise<MessageListResponse> {
    const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
    let rows = this.db.prepare(`SELECT * FROM messages ORDER BY created_at ASC, rowid ASC`).all() as MessageRow[];
    if (input.groupId) {
      const groupId = normalizeGroupId(input.groupId);
      rows = rows.filter((message) => message.group_id === groupId);
    } else if (input.channel) {
      const channel = normalizeChannel(input.channel);
      rows = rows.filter((message) => !message.group_id && message.channel === channel);
    }
    if (input.after) {
      const index = rows.findIndex((message) => message.id === input.after);
      if (index >= 0) rows = rows.slice(index + 1);
    }
    if (input.before) {
      const index = rows.findIndex((message) => message.id === input.before);
      if (index >= 0) rows = rows.slice(0, index);
    }
    const messages = rows.slice(-limit).map(rowToMessage);
    return { messages, nextCursor: messages.at(-1)?.id ?? null };
  }

  async createGroup(input: CreateGroupInput): Promise<AgoraGroup> {
    const name = normalizeGroupName(input.name);
    const groups = this.allGroups();
    const id = input.id ? normalizeGroupId(input.id) : uniqueGroupId(slugifyGroupName(name), groups);
    if (groups.some((group) => group.id === id)) throw new Error('Group already exists');
    const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
    if (memberProfileIds.length === 0) throw new Error('Group needs at least one member');
    const now = new Date().toISOString();
    const group: AgoraGroup = { id, name, memberProfileIds, createdAt: now, updatedAt: now, createdBy: input.createdBy };
    this.insertGroup(group);
    return group;
  }

  async updateGroup(idRaw: string, input: UpdateGroupInput): Promise<AgoraGroup> {
    const id = normalizeGroupId(idRaw);
    const group = this.getGroup(id);
    if (!group) throw new Error('Group not found');
    if (typeof input.name === 'string') group.name = normalizeGroupName(input.name);
    if (input.memberProfileIds) {
      const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
      if (memberProfileIds.length === 0) throw new Error('Group needs at least one member');
      group.memberProfileIds = memberProfileIds;
    }
    group.updatedAt = new Date().toISOString();
    this.insertGroup(group);
    return group;
  }

  async deleteGroup(idRaw: string): Promise<boolean> {
    const id = normalizeGroupId(idRaw);
    const tx = this.db.transaction(() => {
      const deleted = this.db.prepare(`DELETE FROM groups WHERE id = ?`).run(id).changes;
      this.db.prepare(`DELETE FROM messages WHERE group_id = ?`).run(id);
      return deleted > 0;
    });
    return tx();
  }

  getGroup(idRaw: string): AgoraGroup | null {
    const id = normalizeGroupId(idRaw);
    const row = this.db.prepare(`SELECT * FROM groups WHERE id = ?`).get(id) as GroupRow | undefined;
    return row ? rowToGroup(row) : null;
  }

  listGroups(): GroupListResponse {
    return { groups: this.allGroups().sort((left, right) => left.name.localeCompare(right.name)), generatedAt: new Date().toISOString() };
  }

  async createProject(input: CreateProjectInput): Promise<AgoraProject> {
    const name = normalizeProjectName(input.name);
    const projects = this.allProjects();
    const id = input.id ? normalizeProjectId(input.id) : uniqueProjectId(slugifyProjectName(name), projects);
    if (projects.some((project) => project.id === id)) throw new Error('Project already exists');
    const ownerProfileId = normalizeProfileId(input.createdBy.profileId);
    const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds ?? []).filter((profileId) => profileId !== ownerProfileId);
    const sharedGroupIds = normalizeSharedGroupIds(input.sharedGroupIds ?? []);
    const now = new Date().toISOString();
    const project: AgoraProject = { id, name, description: normalizeDescription(input.description ?? ''), status: 'active', ownerProfileId, memberProfileIds, sharedGroupIds, createdAt: now, updatedAt: now, createdBy: input.createdBy };
    this.insertProject(project);
    return project;
  }

  async updateProject(idRaw: string, input: UpdateProjectInput): Promise<AgoraProject> {
    const project = this.getProject(idRaw);
    if (!project) throw new Error('Project not found');
    if (typeof input.name === 'string') project.name = normalizeProjectName(input.name);
    if (typeof input.description === 'string') project.description = normalizeDescription(input.description);
    const nextMemberProfileIds = input.memberProfileIds ? normalizeMemberProfileIds(input.memberProfileIds).filter((profileId) => profileId !== project.ownerProfileId) : null;
    if (input.sharedGroupIds) project.sharedGroupIds = normalizeSharedGroupIds(input.sharedGroupIds);
    if (input.status) project.status = parseProjectStatus(input.status);
    project.updatedAt = new Date().toISOString();

    const tx = this.db.transaction(() => {
      if (nextMemberProfileIds) {
        project.memberProfileIds = nextMemberProfileIds;
        const allowedAssignees = assignableProjectProfileIds(project);
        const tasks = this.listProjectTasks(project.id).tasks;
        const updateAssignees = this.db.prepare(`UPDATE tasks SET assignee_profile_ids_json = ? WHERE id = ?`);
        for (const task of tasks) {
          updateAssignees.run(toJson(task.assigneeProfileIds.filter((profileId) => allowedAssignees.includes(profileId))), task.id);
        }
      }
      this.insertProject(project);
    });
    tx();
    return project;
  }

  async deleteProject(idRaw: string): Promise<boolean> {
    const id = normalizeProjectId(idRaw);
    const tx = this.db.transaction(() => this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id).changes > 0);
    return tx();
  }

  getProject(idRaw: string): AgoraProject | null {
    const id = normalizeProjectId(idRaw);
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  listProjects(): ProjectListResponse {
    return { projects: this.allProjects().sort((left, right) => left.name.localeCompare(right.name)), generatedAt: new Date().toISOString() };
  }

  async createProjectTask(input: CreateTaskInput): Promise<AgoraTask> {
    const project = this.getProject(input.projectId);
    if (!project) throw new Error('Project not found');
    const title = normalizeTaskTitle(input.title);
    const now = new Date().toISOString();
    const task: AgoraTask = {
      id: `task_${randomUUID()}`,
      projectId: project.id,
      title,
      description: normalizeDescription(input.description ?? ''),
      status: input.status ? parseKanbanStatus(input.status) : 'backlog',
      assigneeProfileIds: normalizeAssignees(input.assigneeProfileIds ?? [], assignableProjectProfileIds(project)),
      labels: normalizeLabels(input.labels ?? []),
      order: nextTaskOrder(this.listProjectTasks(project.id).tasks),
      sourceMessageId: input.sourceMessageId ?? null,
      sourceGroupId: input.sourceGroupId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy
    };
    const tx = this.db.transaction(() => {
      this.insertTask(task);
      this.db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, project.id);
    });
    tx();
    return task;
  }

  async updateProjectTask(projectIdRaw: string, taskId: string, input: UpdateTaskInput): Promise<AgoraTask> {
    const project = this.getProject(projectIdRaw);
    if (!project) throw new Error('Project not found');
    const task = this.getProjectTask(project.id, taskId);
    if (!task) throw new Error('Task not found');
    if (typeof input.title === 'string') task.title = normalizeTaskTitle(input.title);
    if (typeof input.description === 'string') task.description = normalizeDescription(input.description);
    if (input.status) task.status = parseKanbanStatus(input.status);
    if (input.assigneeProfileIds) task.assigneeProfileIds = normalizeAssignees(input.assigneeProfileIds, assignableProjectProfileIds(project));
    if (input.labels) task.labels = normalizeLabels(input.labels);
    if (typeof input.order === 'number' && Number.isFinite(input.order)) task.order = Math.max(0, input.order);
    const now = new Date().toISOString();
    task.updatedAt = now;
    task.updatedBy = input.updatedBy;
    const tx = this.db.transaction(() => {
      this.insertTask(task);
      this.db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, project.id);
    });
    tx();
    return task;
  }

  getProjectTask(projectIdRaw: string, taskId: string): AgoraTask | null {
    const projectId = normalizeProjectId(projectIdRaw);
    const row = this.db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND id = ?`).get(projectId, taskId) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  listProjectTasks(projectIdRaw: string, filters: { status?: KanbanStatus; assigneeProfileId?: string } = {}): TaskListResponse {
    const projectId = normalizeProjectId(projectIdRaw);
    let tasks = (this.db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY order_index ASC, created_at ASC`).all(projectId) as TaskRow[]).map(rowToTask);
    if (filters.status) tasks = tasks.filter((task) => task.status === parseKanbanStatus(filters.status));
    if (filters.assigneeProfileId) tasks = tasks.filter((task) => task.assigneeProfileIds.includes(filters.assigneeProfileId!.trim().toLowerCase()));
    return { tasks, generatedAt: new Date().toISOString() };
  }

  async appendTaskDocument(projectIdRaw: string, taskId: string, input: CreateTaskDocumentInput): Promise<TaskDocument> {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    const body = input.body.trim();
    if (!body) throw new Error('Task document body is required');
    if (body.length > 8000) throw new Error('Task document exceeds 8000 characters');
    const document: TaskDocument = { id: `doc_${randomUUID()}`, taskId: task.id, kind: input.kind ? parseTaskDocumentKind(input.kind) : 'note', body, author: input.author, createdAt: new Date().toISOString() };
    const tx = this.db.transaction(() => {
      this.insertTaskDocument(document);
      this.db.prepare(`UPDATE tasks SET updated_at = ?, updated_by_json = ? WHERE id = ?`).run(document.createdAt, toJson(input.author), task.id);
      this.db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(document.createdAt, normalizeProjectId(projectIdRaw));
    });
    tx();
    return document;
  }

  listTaskDocuments(projectIdRaw: string, taskId: string): TaskDocumentListResponse {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    const documents = (this.db.prepare(`SELECT * FROM task_documents WHERE task_id = ? ORDER BY created_at ASC, rowid ASC`).all(task.id) as TaskDocumentRow[]).map(rowToTaskDocument);
    return { documents, generatedAt: new Date().toISOString() };
  }

  getTaskWhiteboard(projectIdRaw: string, taskId: string): TaskWhiteboard | null {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    const row = this.db.prepare(`SELECT * FROM task_whiteboards WHERE task_id = ?`).get(task.id) as TaskWhiteboardRow | undefined;
    return row ? rowToTaskWhiteboard(row) : null;
  }

  defaultTaskWhiteboard(projectIdRaw: string, taskId: string): TaskWhiteboard {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    return { taskId: task.id, title: `${task.title} whiteboard`, strokes: [], updatedAt: task.updatedAt, updatedBy: task.updatedBy ?? task.createdBy };
  }

  async updateTaskWhiteboard(projectIdRaw: string, taskId: string, input: UpdateTaskWhiteboardInput): Promise<TaskWhiteboard> {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    const current = this.getTaskWhiteboard(projectIdRaw, task.id);
    const title = normalizeWhiteboardTitle(input.title ?? current?.title ?? `${task.title} whiteboard`);
    const strokes = normalizeWhiteboardStrokes(input.strokes ?? current?.strokes ?? []);
    const now = new Date().toISOString();
    const whiteboard: TaskWhiteboard = { taskId: task.id, title, strokes, updatedAt: now, updatedBy: input.updatedBy };
    const tx = this.db.transaction(() => {
      this.insertTaskWhiteboard(whiteboard);
      this.db.prepare(`UPDATE tasks SET updated_at = ?, updated_by_json = ? WHERE id = ?`).run(now, toJson(input.updatedBy), task.id);
      this.db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, normalizeProjectId(projectIdRaw));
    });
    tx();
    return whiteboard;
  }

  async updateProfileStatus(input: UpdateProfileStatusInput): Promise<StoredProfileStatus> {
    const now = new Date().toISOString();
    const current = this.profileStatus(input.profileId);
    const next: StoredProfileStatus = {
      status: input.status,
      lastSeenAt: now,
      lastMessageAt: input.lastMessageAt ?? current?.lastMessageAt ?? null,
      note: input.note ?? current?.note ?? null
    };
    this.db.prepare(`INSERT INTO profile_statuses (profile_id, status, last_seen_at, last_message_at, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(profile_id) DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at, last_message_at = excluded.last_message_at, note = excluded.note`).run(input.profileId, next.status, next.lastSeenAt, next.lastMessageAt ?? null, next.note ?? null);
    return next;
  }

  listProfileStatuses(agentProfiles: Record<string, AgentProfileConfig>): ProfileStatusResponse {
    const profiles: ProfileStatus[] = Object.entries(agentProfiles).map(([profileId, config]) => {
      const stored = this.profileStatus(profileId);
      return {
        profileId,
        displayName: config.displayName,
        status: stored?.status ?? 'unknown',
        channels: config.channels,
        scopes: config.scopes,
        lastSeenAt: stored?.lastSeenAt ?? null,
        lastMessageAt: stored?.lastMessageAt ?? null,
        note: stored?.note ?? null
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName));
    return { profiles, generatedAt: new Date().toISOString() };
  }

  close(): void {
    this.db.close();
  }

  private configure(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  private migrateSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        group_id TEXT,
        text TEXT NOT NULL,
        author_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        thread_id TEXT,
        reply_to TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_group_created ON messages(group_id, created_at);

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        member_profile_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_statuses (
        profile_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_message_at TEXT,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        owner_profile_id TEXT NOT NULL DEFAULT '',
        member_profile_ids_json TEXT NOT NULL,
        shared_group_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        assignee_profile_ids_json TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        source_message_id TEXT,
        source_group_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_json TEXT NOT NULL,
        updated_by_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_project_order ON tasks(project_id, order_index, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);

      CREATE TABLE IF NOT EXISTS task_documents (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        author_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_task_documents_task_created ON task_documents(task_id, created_at);

      CREATE TABLE IF NOT EXISTS task_whiteboards (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        strokes_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_json TEXT NOT NULL
      );
    `);
    this.ensureProjectSharingColumns();
    this.db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO NOTHING`).run();
  }

  private ensureProjectSharingColumns(): void {
    const columns = new Set((this.db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((column) => column.name));
    if (!columns.has('owner_profile_id')) this.db.prepare(`ALTER TABLE projects ADD COLUMN owner_profile_id TEXT NOT NULL DEFAULT ''`).run();
    if (!columns.has('shared_group_ids_json')) this.db.prepare(`ALTER TABLE projects ADD COLUMN shared_group_ids_json TEXT NOT NULL DEFAULT '[]'`).run();

    const rows = this.db.prepare(`SELECT id, created_by_json, owner_profile_id FROM projects WHERE owner_profile_id = ''`).all() as Array<{ id: string; created_by_json: string; owner_profile_id: string }>;
    const update = this.db.prepare(`UPDATE projects SET owner_profile_id = ? WHERE id = ?`);
    for (const row of rows) {
      const createdBy = fromJson<Author>(row.created_by_json);
      update.run(normalizeProfileId(createdBy.profileId), row.id);
    }
  }

  private async importJsonIfNeeded(importJsonFile?: string): Promise<void> {
    if (!importJsonFile || this.meta('legacy_json_imported') === 'true') return;
    try {
      await access(importJsonFile);
    } catch {
      return;
    }
    const raw = await readFile(importJsonFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) throw new Error('Invalid legacy JSON store shape');
    const store: StoreFile = {
      version: 1,
      messages: parsed.messages.map((message) => ({ ...message, groupId: message.groupId ?? null })),
      groups: parsed.groups ?? [],
      profileStatuses: parsed.profileStatuses ?? {},
      projects: (parsed.projects ?? []).map((project) => ({
        ...project,
        ownerProfileId: project.ownerProfileId ?? project.createdBy.profileId,
        memberProfileIds: project.memberProfileIds ?? [],
        sharedGroupIds: project.sharedGroupIds ?? []
      })),
      tasks: parsed.tasks ?? [],
      taskDocuments: parsed.taskDocuments ?? [],
      taskWhiteboards: parsed.taskWhiteboards ?? []
    };
    const tx = this.db.transaction(() => {
      for (const message of store.messages) this.insertMessage(message);
      for (const group of store.groups) this.insertGroup(group);
      for (const [profileId, status] of Object.entries(store.profileStatuses)) {
        this.db.prepare(`INSERT INTO profile_statuses (profile_id, status, last_seen_at, last_message_at, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(profile_id) DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at, last_message_at = excluded.last_message_at, note = excluded.note`).run(profileId, status.status, status.lastSeenAt, status.lastMessageAt ?? null, status.note ?? null);
      }
      for (const project of store.projects) this.insertProject(project);
      for (const task of store.tasks) this.insertTask(task);
      for (const document of store.taskDocuments) this.insertTaskDocument(document);
      for (const whiteboard of store.taskWhiteboards ?? []) this.insertTaskWhiteboard(whiteboard);
      this.setMeta('legacy_json_imported', 'true');
      this.setMeta('legacy_json_imported_at', new Date().toISOString());
    });
    tx();
    try {
      await rename(importJsonFile, `${importJsonFile}.migrated`);
    } catch {
      console.warn('Legacy JSON import completed; could not rename legacy file, future imports are skipped by SQLite metadata.');
    }
  }

  private meta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  private allGroups(): AgoraGroup[] {
    return (this.db.prepare(`SELECT * FROM groups`).all() as GroupRow[]).map(rowToGroup);
  }

  private allProjects(): AgoraProject[] {
    return (this.db.prepare(`SELECT * FROM projects`).all() as ProjectRow[]).map(rowToProject);
  }

  private profileStatus(profileId: string): StoredProfileStatus | null {
    const row = this.db.prepare(`SELECT * FROM profile_statuses WHERE profile_id = ?`).get(profileId) as ProfileStatusRow | undefined;
    return row ? { status: row.status, lastSeenAt: row.last_seen_at, lastMessageAt: row.last_message_at, note: row.note } : null;
  }

  private setProfileStatus(profileId: string, patch: Partial<StoredProfileStatus> & { status: ProfilePresence; lastSeenAt: string }): StoredProfileStatus {
    const current = this.profileStatus(profileId);
    const next: StoredProfileStatus = {
      status: patch.status,
      lastSeenAt: patch.lastSeenAt,
      lastMessageAt: patch.lastMessageAt ?? current?.lastMessageAt ?? null,
      note: patch.note ?? current?.note ?? null
    };
    this.db.prepare(`INSERT INTO profile_statuses (profile_id, status, last_seen_at, last_message_at, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(profile_id) DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at, last_message_at = excluded.last_message_at, note = excluded.note`).run(profileId, next.status, next.lastSeenAt, next.lastMessageAt ?? null, next.note ?? null);
    return next;
  }

  private insertMessage(message: AgoraMessage): void {
    this.db.prepare(`INSERT INTO messages (id, channel, group_id, text, author_json, metadata_json, created_at, thread_id, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET channel = excluded.channel, group_id = excluded.group_id, text = excluded.text, author_json = excluded.author_json, metadata_json = excluded.metadata_json, created_at = excluded.created_at, thread_id = excluded.thread_id, reply_to = excluded.reply_to`).run(message.id, message.channel, message.groupId ?? null, message.text, toJson(message.author), toJson(message.metadata ?? {}), message.createdAt, message.threadId ?? null, message.replyTo ?? null);
  }

  private insertGroup(group: AgoraGroup): void {
    this.db.prepare(`INSERT INTO groups (id, name, member_profile_ids_json, created_at, updated_at, created_by_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, member_profile_ids_json = excluded.member_profile_ids_json, updated_at = excluded.updated_at`).run(group.id, group.name, toJson(group.memberProfileIds), group.createdAt, group.updatedAt, toJson(group.createdBy));
  }

  private insertProject(project: AgoraProject): void {
    this.db.prepare(`INSERT INTO projects (id, name, description, status, owner_profile_id, member_profile_ids_json, shared_group_ids_json, created_at, updated_at, created_by_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, status = excluded.status, owner_profile_id = excluded.owner_profile_id, member_profile_ids_json = excluded.member_profile_ids_json, shared_group_ids_json = excluded.shared_group_ids_json, updated_at = excluded.updated_at`).run(project.id, project.name, project.description, project.status, project.ownerProfileId, toJson(project.memberProfileIds), toJson(project.sharedGroupIds), project.createdAt, project.updatedAt, toJson(project.createdBy));
  }

  private insertTask(task: AgoraTask): void {
    this.db.prepare(`INSERT INTO tasks (id, project_id, title, description, status, assignee_profile_ids_json, labels_json, order_index, source_message_id, source_group_id, created_at, updated_at, created_by_json, updated_by_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, status = excluded.status, assignee_profile_ids_json = excluded.assignee_profile_ids_json, labels_json = excluded.labels_json, order_index = excluded.order_index, source_message_id = excluded.source_message_id, source_group_id = excluded.source_group_id, updated_at = excluded.updated_at, updated_by_json = excluded.updated_by_json`).run(task.id, task.projectId, task.title, task.description, task.status, toJson(task.assigneeProfileIds), toJson(task.labels), task.order, task.sourceMessageId ?? null, task.sourceGroupId ?? null, task.createdAt, task.updatedAt, toJson(task.createdBy), task.updatedBy ? toJson(task.updatedBy) : null);
  }

  private insertTaskDocument(document: TaskDocument): void {
    this.db.prepare(`INSERT INTO task_documents (id, task_id, kind, body, author_json, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, body = excluded.body, author_json = excluded.author_json, created_at = excluded.created_at`).run(document.id, document.taskId, document.kind, document.body, toJson(document.author), document.createdAt);
  }

  private insertTaskWhiteboard(whiteboard: TaskWhiteboard): void {
    this.db.prepare(`INSERT INTO task_whiteboards (task_id, title, strokes_json, updated_at, updated_by_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET title = excluded.title, strokes_json = excluded.strokes_json, updated_at = excluded.updated_at, updated_by_json = excluded.updated_by_json`).run(whiteboard.taskId, whiteboard.title, toJson(normalizeWhiteboardStrokes(whiteboard.strokes)), whiteboard.updatedAt, toJson(whiteboard.updatedBy));
  }
}

export function normalizeChannel(channel: string): string {
  const normalized = channel.trim().toLowerCase();
  if (!normalized.match(/^[a-z0-9][a-z0-9-]{0,63}$/)) throw new Error('Invalid channel slug');
  return normalized;
}

export function normalizeGroupId(groupId: string): string {
  const normalized = groupId.trim().toLowerCase();
  if (!normalized.match(/^[a-z0-9][a-z0-9-]{0,57}$/)) throw new Error('Invalid group id');
  return normalized;
}

export function normalizeProjectId(projectId: string): string {
  const normalized = projectId.trim().toLowerCase();
  if (!normalized.match(/^[a-z0-9][a-z0-9-]{0,57}$/)) throw new Error('Invalid project id');
  return normalized;
}

export function parseKanbanStatus(value: unknown): KanbanStatus {
  if (value === 'backlog' || value === 'todo' || value === 'in_progress' || value === 'review' || value === 'blocked' || value === 'done') return value;
  throw new Error('Invalid task status');
}

export function parseProjectStatus(value: unknown): ProjectStatus {
  if (value === 'active' || value === 'archived') return value;
  throw new Error('Invalid project status');
}

export function parseTaskDocumentKind(value: unknown): TaskDocumentKind {
  if (value === 'note' || value === 'result' || value === 'blocker' || value === 'qa') return value;
  throw new Error('Invalid task document kind');
}

export function parseProfilePresence(value: unknown): ProfilePresence {
  if (value === 'online' || value === 'idle' || value === 'offline' || value === 'blocked') return value;
  throw new Error('Invalid profile status');
}

function rowToMessage(row: MessageRow): AgoraMessage {
  return {
    id: row.id,
    channel: row.channel,
    groupId: row.group_id,
    text: row.text,
    author: fromJson<Author>(row.author_json),
    metadata: fromJson<Record<string, unknown>>(row.metadata_json),
    createdAt: row.created_at,
    threadId: row.thread_id,
    replyTo: row.reply_to
  };
}

function rowToGroup(row: GroupRow): AgoraGroup {
  return { id: row.id, name: row.name, memberProfileIds: fromJson<string[]>(row.member_profile_ids_json), createdAt: row.created_at, updatedAt: row.updated_at, createdBy: fromJson<Author>(row.created_by_json) };
}

function rowToProject(row: ProjectRow): AgoraProject {
  const createdBy = fromJson<Author>(row.created_by_json);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: parseProjectStatus(row.status),
    ownerProfileId: normalizeProfileId(row.owner_profile_id || createdBy.profileId),
    memberProfileIds: fromJson<string[]>(row.member_profile_ids_json),
    sharedGroupIds: fromJson<string[]>(row.shared_group_ids_json || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy
  };
}

function rowToTask(row: TaskRow): AgoraTask {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: parseKanbanStatus(row.status),
    assigneeProfileIds: fromJson<string[]>(row.assignee_profile_ids_json),
    labels: fromJson<string[]>(row.labels_json),
    order: row.order_index,
    sourceMessageId: row.source_message_id,
    sourceGroupId: row.source_group_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: fromJson<Author>(row.created_by_json),
    updatedBy: row.updated_by_json ? fromJson<Author>(row.updated_by_json) : undefined
  };
}

function rowToTaskDocument(row: TaskDocumentRow): TaskDocument {
  return { id: row.id, taskId: row.task_id, kind: parseTaskDocumentKind(row.kind), body: row.body, author: fromJson<Author>(row.author_json), createdAt: row.created_at };
}

function rowToTaskWhiteboard(row: TaskWhiteboardRow): TaskWhiteboard {
  return {
    taskId: row.task_id,
    title: row.title,
    strokes: normalizeWhiteboardStrokes(fromJson<WhiteboardStroke[]>(row.strokes_json)),
    updatedAt: row.updated_at,
    updatedBy: fromJson<Author>(row.updated_by_json)
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function normalizeGroupName(nameRaw: string): string {
  const name = nameRaw.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('Group name is required');
  if (name.length > 80) throw new Error('Group name exceeds 80 characters');
  return name;
}

function normalizeProjectName(nameRaw: string): string {
  const name = nameRaw.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('Project name is required');
  if (name.length > 90) throw new Error('Project name exceeds 90 characters');
  return name;
}

function normalizeTaskTitle(titleRaw: string): string {
  const title = titleRaw.trim().replace(/\s+/g, ' ');
  if (title.length < 2) throw new Error('Task title is required');
  if (title.length > 140) throw new Error('Task title exceeds 140 characters');
  return title;
}

function normalizeDescription(value: string): string {
  const description = value.trim();
  if (description.length > 4000) throw new Error('Description exceeds 4000 characters');
  return description;
}

function normalizeWhiteboardTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, ' ');
  if (title.length < 2) throw new Error('Whiteboard title is required');
  if (title.length > 120) throw new Error('Whiteboard title exceeds 120 characters');
  return title;
}

function normalizeWhiteboardStrokes(strokes: WhiteboardStroke[]): WhiteboardStroke[] {
  if (!Array.isArray(strokes)) throw new Error('strokes must be an array');
  return strokes.slice(-80).map((stroke, index) => {
    if (!stroke || typeof stroke !== 'object') throw new Error('Invalid whiteboard stroke');
    const id = typeof stroke.id === 'string' && stroke.id.trim() ? stroke.id.trim().slice(0, 80) : `stroke_${index}`;
    const kind = parseWhiteboardShapeKind(stroke.kind);
    const color = normalizeWhiteboardColor(stroke.color, '#93c5fd');
    const fill = stroke.fill === undefined ? undefined : normalizeWhiteboardColor(stroke.fill, 'transparent');
    const label = typeof stroke.label === 'string' ? stroke.label.trim().replace(/\s+/g, ' ').slice(0, 80) : undefined;
    const sizeRaw = Number(stroke.size);
    const size = Number.isFinite(sizeRaw) ? Math.min(16, Math.max(1, Math.round(sizeRaw))) : 3;
    if (!Array.isArray(stroke.points)) throw new Error('Invalid whiteboard stroke points');
    const maxPoints = kind === 'freehand' ? 120 : 2;
    const points = stroke.points.slice(0, maxPoints).map((point) => {
      const xRaw = Number(point?.x);
      const yRaw = Number(point?.y);
      if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) throw new Error('Invalid whiteboard point');
      return { x: Math.min(800, Math.max(0, Math.round(xRaw * 10) / 10)), y: Math.min(420, Math.max(0, Math.round(yRaw * 10) / 10)) };
    });
    if (kind !== 'freehand' && points.length < 2) throw new Error('Whiteboard shapes need two points');
    const normalized: WhiteboardStroke = { id, kind, color, size, points };
    if (fill && fill !== 'transparent') normalized.fill = fill;
    if (label) normalized.label = label;
    return normalized;
  }).filter((stroke) => stroke.points.length > 0);
}

function parseWhiteboardShapeKind(value: unknown): NonNullable<WhiteboardStroke['kind']> {
  if (value === undefined || value === null || value === 'freehand') return 'freehand';
  if (value === 'rectangle' || value === 'circle' || value === 'arrow') return value;
  throw new Error('Invalid whiteboard shape kind');
}

function normalizeWhiteboardColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (fallback === 'transparent') return fallback;
  return fallback;
}

function normalizeLabels(labels: string[]): string[] {
  if (!Array.isArray(labels)) throw new Error('labels must be an array');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const labelRaw of labels) {
    if (typeof labelRaw !== 'string') throw new Error('Invalid label');
    const label = labelRaw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
    if (label && !seen.has(label)) {
      seen.add(label);
      normalized.push(label);
    }
  }
  return normalized.slice(0, 12);
}

function normalizeAssignees(profileIds: string[], memberProfileIds: string[]): string[] {
  const assignees = normalizeMemberProfileIds(profileIds);
  for (const profileId of assignees) {
    if (!memberProfileIds.includes(profileId)) throw new Error(`Task assignee is not a project member: ${profileId}`);
  }
  return assignees;
}

function nextTaskOrder(tasks: AgoraTask[]): number {
  const orders = tasks.map((task) => task.order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

function normalizeMemberProfileIds(profileIds: string[]): string[] {
  if (!Array.isArray(profileIds)) throw new Error('memberProfileIds must be an array');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const profileIdRaw of profileIds) {
    if (typeof profileIdRaw !== 'string') throw new Error('Invalid member profile id');
    const profileId = normalizeProfileId(profileIdRaw);
    if (!seen.has(profileId)) {
      seen.add(profileId);
      normalized.push(profileId);
    }
  }
  return normalized;
}

function normalizeProfileId(profileIdRaw: string): string {
  const profileId = profileIdRaw.trim().toLowerCase();
  if (!profileId.match(/^[a-z0-9][a-z0-9._@-]{1,127}$/)) throw new Error(`Invalid member profile id: ${profileIdRaw}`);
  return profileId;
}

function normalizeSharedGroupIds(groupIds: string[]): string[] {
  if (!Array.isArray(groupIds)) throw new Error('sharedGroupIds must be an array');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const groupIdRaw of groupIds) {
    if (typeof groupIdRaw !== 'string') throw new Error('Invalid shared group id');
    const groupId = normalizeGroupId(groupIdRaw);
    if (!seen.has(groupId)) {
      seen.add(groupId);
      normalized.push(groupId);
    }
  }
  return normalized;
}

function assignableProjectProfileIds(project: AgoraProject): string[] {
  return normalizeMemberProfileIds([project.ownerProfileId, ...project.memberProfileIds]);
}

function slugifyGroupName(name: string): string {
  const slug = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'grupo';
}

function slugifyProjectName(name: string): string {
  const slug = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'proyecto';
}

function uniqueGroupId(base: string, groups: AgoraGroup[]): string {
  const existing = new Set(groups.map((group) => group.id));
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function uniqueProjectId(base: string, projects: AgoraProject[]): string {
  const existing = new Set(projects.map((project) => project.id));
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}
