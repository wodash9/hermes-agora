import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentProfileConfig, AgoraGroup, AgoraMessage, AgoraProject, AgoraTask, Author, GroupListResponse, KanbanStatus, MessageListResponse, ProfilePresence, ProfileStatus, ProfileStatusResponse, ProjectListResponse, ProjectStatus, TaskDocument, TaskDocumentKind, TaskDocumentListResponse, TaskListResponse } from '../shared/types.js';

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
  memberProfileIds: string[];
  createdBy: Author;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  memberProfileIds?: string[];
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

export class JsonMessageStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string, private data: StoreFile) {}

  static async open(filePath: string): Promise<JsonMessageStore> {
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.messages)) throw new Error('Invalid store shape');
      return new JsonMessageStore(filePath, {
        version: 1,
        messages: parsed.messages.map((message) => ({ ...message, groupId: message.groupId ?? null })),
        groups: parsed.groups ?? [],
        profileStatuses: parsed.profileStatuses ?? {},
        projects: parsed.projects ?? [],
        tasks: parsed.tasks ?? [],
        taskDocuments: parsed.taskDocuments ?? []
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const store = new JsonMessageStore(filePath, { version: 1, messages: [], groups: [], profileStatuses: {}, projects: [], tasks: [], taskDocuments: [] });
      await store.persist();
      return store;
    }
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
    this.data.messages.push(message);
    this.setProfileStatus(input.author.profileId, { status: 'online', lastSeenAt: now, lastMessageAt: now });
    await this.persist();
    return message;
  }

  async listMessages(input: ListMessagesInput = {}): Promise<MessageListResponse> {
    const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
    let messages = [...this.data.messages];
    if (input.groupId) {
      const groupId = normalizeGroupId(input.groupId);
      messages = messages.filter((message) => message.groupId === groupId);
    } else if (input.channel) {
      const channel = normalizeChannel(input.channel);
      messages = messages.filter((message) => !message.groupId && message.channel === channel);
    }
    if (input.after) {
      const index = messages.findIndex((message) => message.id === input.after);
      if (index >= 0) messages = messages.slice(index + 1);
    }
    if (input.before) {
      const index = messages.findIndex((message) => message.id === input.before);
      if (index >= 0) messages = messages.slice(0, index);
    }
    messages = messages.slice(-limit);
    return { messages, nextCursor: messages.at(-1)?.id ?? null };
  }

  async createGroup(input: CreateGroupInput): Promise<AgoraGroup> {
    const name = normalizeGroupName(input.name);
    const id = input.id ? normalizeGroupId(input.id) : uniqueGroupId(slugifyGroupName(name), this.data.groups);
    if (this.data.groups.some((group) => group.id === id)) throw new Error('Group already exists');
    const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
    if (memberProfileIds.length === 0) throw new Error('Group needs at least one member');
    const now = new Date().toISOString();
    const group: AgoraGroup = { id, name, memberProfileIds, createdAt: now, updatedAt: now, createdBy: input.createdBy };
    this.data.groups.push(group);
    await this.persist();
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
    await this.persist();
    return group;
  }

  async deleteGroup(idRaw: string): Promise<boolean> {
    const id = normalizeGroupId(idRaw);
    const index = this.data.groups.findIndex((group) => group.id === id);
    if (index === -1) return false;
    this.data.groups.splice(index, 1);
    this.data.messages = this.data.messages.filter((message) => message.groupId !== id);
    await this.persist();
    return true;
  }

  getGroup(idRaw: string): AgoraGroup | null {
    const id = normalizeGroupId(idRaw);
    return this.data.groups.find((group) => group.id === id) ?? null;
  }

  listGroups(): GroupListResponse {
    return { groups: [...this.data.groups].sort((left, right) => left.name.localeCompare(right.name)), generatedAt: new Date().toISOString() };
  }

  async createProject(input: CreateProjectInput): Promise<AgoraProject> {
    const name = normalizeProjectName(input.name);
    const id = input.id ? normalizeProjectId(input.id) : uniqueProjectId(slugifyProjectName(name), this.data.projects);
    if (this.data.projects.some((project) => project.id === id)) throw new Error('Project already exists');
    const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
    if (memberProfileIds.length === 0) throw new Error('Project needs at least one member');
    const now = new Date().toISOString();
    const project: AgoraProject = { id, name, description: normalizeDescription(input.description ?? ''), status: 'active', memberProfileIds, createdAt: now, updatedAt: now, createdBy: input.createdBy };
    this.data.projects.push(project);
    await this.persist();
    return project;
  }

  async updateProject(idRaw: string, input: UpdateProjectInput): Promise<AgoraProject> {
    const project = this.getProject(idRaw);
    if (!project) throw new Error('Project not found');
    if (typeof input.name === 'string') project.name = normalizeProjectName(input.name);
    if (typeof input.description === 'string') project.description = normalizeDescription(input.description);
    if (input.memberProfileIds) {
      const memberProfileIds = normalizeMemberProfileIds(input.memberProfileIds);
      if (memberProfileIds.length === 0) throw new Error('Project needs at least one member');
      project.memberProfileIds = memberProfileIds;
      for (const task of this.data.tasks.filter((item) => item.projectId === project.id)) {
        task.assigneeProfileIds = task.assigneeProfileIds.filter((profileId) => memberProfileIds.includes(profileId));
      }
    }
    if (input.status) project.status = parseProjectStatus(input.status);
    project.updatedAt = new Date().toISOString();
    await this.persist();
    return project;
  }

  async deleteProject(idRaw: string): Promise<boolean> {
    const id = normalizeProjectId(idRaw);
    const index = this.data.projects.findIndex((project) => project.id === id);
    if (index === -1) return false;
    this.data.projects.splice(index, 1);
    const deletedTaskIds = new Set(this.data.tasks.filter((task) => task.projectId === id).map((task) => task.id));
    this.data.tasks = this.data.tasks.filter((task) => task.projectId !== id);
    this.data.taskDocuments = this.data.taskDocuments.filter((document) => !deletedTaskIds.has(document.taskId));
    await this.persist();
    return true;
  }

  getProject(idRaw: string): AgoraProject | null {
    const id = normalizeProjectId(idRaw);
    return this.data.projects.find((project) => project.id === id) ?? null;
  }

  listProjects(): ProjectListResponse {
    return { projects: [...this.data.projects].sort((left, right) => left.name.localeCompare(right.name)), generatedAt: new Date().toISOString() };
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
      assigneeProfileIds: normalizeAssignees(input.assigneeProfileIds ?? [], project.memberProfileIds),
      labels: normalizeLabels(input.labels ?? []),
      order: nextTaskOrder(this.data.tasks, project.id),
      sourceMessageId: input.sourceMessageId ?? null,
      sourceGroupId: input.sourceGroupId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy
    };
    this.data.tasks.push(task);
    project.updatedAt = now;
    await this.persist();
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
    if (input.assigneeProfileIds) task.assigneeProfileIds = normalizeAssignees(input.assigneeProfileIds, project.memberProfileIds);
    if (input.labels) task.labels = normalizeLabels(input.labels);
    if (typeof input.order === 'number' && Number.isFinite(input.order)) task.order = Math.max(0, input.order);
    const now = new Date().toISOString();
    task.updatedAt = now;
    task.updatedBy = input.updatedBy;
    project.updatedAt = now;
    await this.persist();
    return task;
  }

  getProjectTask(projectIdRaw: string, taskId: string): AgoraTask | null {
    const projectId = normalizeProjectId(projectIdRaw);
    return this.data.tasks.find((task) => task.projectId === projectId && task.id === taskId) ?? null;
  }

  listProjectTasks(projectIdRaw: string, filters: { status?: KanbanStatus; assigneeProfileId?: string } = {}): TaskListResponse {
    const projectId = normalizeProjectId(projectIdRaw);
    let tasks = this.data.tasks.filter((task) => task.projectId === projectId);
    if (filters.status) tasks = tasks.filter((task) => task.status === parseKanbanStatus(filters.status));
    if (filters.assigneeProfileId) tasks = tasks.filter((task) => task.assigneeProfileIds.includes(filters.assigneeProfileId!.trim().toLowerCase()));
    return { tasks: [...tasks].sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt)), generatedAt: new Date().toISOString() };
  }

  async appendTaskDocument(projectIdRaw: string, taskId: string, input: CreateTaskDocumentInput): Promise<TaskDocument> {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    const body = input.body.trim();
    if (!body) throw new Error('Task document body is required');
    if (body.length > 8000) throw new Error('Task document exceeds 8000 characters');
    const document: TaskDocument = { id: `doc_${randomUUID()}`, taskId: task.id, kind: input.kind ? parseTaskDocumentKind(input.kind) : 'note', body, author: input.author, createdAt: new Date().toISOString() };
    this.data.taskDocuments.push(document);
    task.updatedAt = document.createdAt;
    task.updatedBy = input.author;
    const project = this.getProject(projectIdRaw);
    if (project) project.updatedAt = document.createdAt;
    await this.persist();
    return document;
  }

  listTaskDocuments(projectIdRaw: string, taskId: string): TaskDocumentListResponse {
    const task = this.getProjectTask(projectIdRaw, taskId);
    if (!task) throw new Error('Task not found');
    return { documents: this.data.taskDocuments.filter((document) => document.taskId === task.id).sort((left, right) => left.createdAt.localeCompare(right.createdAt)), generatedAt: new Date().toISOString() };
  }

  async updateProfileStatus(input: UpdateProfileStatusInput): Promise<StoredProfileStatus> {
    const now = new Date().toISOString();
    const current = this.data.profileStatuses[input.profileId];
    const next = this.setProfileStatus(input.profileId, {
      status: input.status,
      note: input.note ?? current?.note ?? null,
      lastSeenAt: now,
      lastMessageAt: input.lastMessageAt ?? current?.lastMessageAt ?? null
    });
    await this.persist();
    return next;
  }

  listProfileStatuses(agentProfiles: Record<string, AgentProfileConfig>): ProfileStatusResponse {
    const profiles: ProfileStatus[] = Object.entries(agentProfiles).map(([profileId, config]) => {
      const stored = this.data.profileStatuses[profileId];
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

  private setProfileStatus(profileId: string, patch: Partial<StoredProfileStatus> & { status: ProfilePresence; lastSeenAt: string }): StoredProfileStatus {
    const current = this.data.profileStatuses[profileId];
    const next: StoredProfileStatus = {
      status: patch.status,
      lastSeenAt: patch.lastSeenAt,
      lastMessageAt: patch.lastMessageAt ?? current?.lastMessageAt ?? null,
      note: patch.note ?? current?.note ?? null
    };
    this.data.profileStatuses[profileId] = next;
    return next;
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const tmp = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(tmp, payload, 'utf8');
      await rename(tmp, this.filePath);
    });
    await this.writeQueue;
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

function nextTaskOrder(tasks: AgoraTask[], projectId: string): number {
  const orders = tasks.filter((task) => task.projectId === projectId).map((task) => task.order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

function normalizeMemberProfileIds(profileIds: string[]): string[] {
  if (!Array.isArray(profileIds)) throw new Error('memberProfileIds must be an array');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const profileIdRaw of profileIds) {
    if (typeof profileIdRaw !== 'string') throw new Error('Invalid member profile id');
    const profileId = profileIdRaw.trim().toLowerCase();
    if (!profileId.match(/^[a-z0-9][a-z0-9-]{1,63}$/)) throw new Error(`Invalid member profile id: ${profileIdRaw}`);
    if (!seen.has(profileId)) {
      seen.add(profileId);
      normalized.push(profileId);
    }
  }
  return normalized;
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
