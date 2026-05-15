import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { AgoraGroup, AgoraMessage, AgoraProject, AgoraTask, Identity, KanbanStatus, ProfileStatus, TaskDocument } from '../shared/types';
import { createClientAuthConfig, initKeycloak, isMockAllowed, logoutKeycloak } from './auth';
import { appendTaskDocument, createGroup, createProject, createProjectTask, deleteGroup, deleteProject, fetchGroupMessages, fetchGroups, fetchIdentity, fetchMessages, fetchProfileStatuses, fetchProjectTasks, fetchProjects, fetchTaskDocuments, postGroupMessage, postMessage, updateGroup, updateProject, updateProjectTask, buildSocketAuth } from './api';
import { ACTION_OPTIONS, DIRECTED_TARGET_ALL, applyComposerAction, buildRecipientOptions, buildTargetMetadata, toggleMemberSelection, type ComposerAction } from './uiState';
import { scrollMessagesToLatest } from './scroll';
import './styles.css';

type View = 'chat' | 'monitor' | 'group' | 'projects';
type ProjectPanel = 'board' | 'access' | 'settings';

const KANBAN_COLUMNS: Array<{ status: KanbanStatus; label: string }> = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'En curso' },
  { status: 'review', label: 'Revisión' },
  { status: 'blocked', label: 'Bloqueado' },
  { status: 'done', label: 'Hecho' }
];

export function App() {
  const authConfig = useMemo(() => createClientAuthConfig(import.meta.env), []);
  const messagesRef = useRef<HTMLOListElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [messages, setMessages] = useState<AgoraMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<Record<string, AgoraMessage[]>>({});
  const [profiles, setProfiles] = useState<ProfileStatus[]>([]);
  const [groups, setGroups] = useState<AgoraGroup[]>([]);
  const [projects, setProjects] = useState<AgoraProject[]>([]);
  const [projectTasks, setProjectTasks] = useState<Record<string, AgoraTask[]>>({});
  const [taskDocuments, setTaskDocuments] = useState<Record<string, TaskDocument[]>>({});
  const [activeView, setActiveView] = useState<View>('chat');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [composerAction, setComposerAction] = useState<ComposerAction>('NONE');
  const [composerTargetProfileId, setComposerTargetProfileId] = useState(DIRECTED_TARGET_ALL);
  const [isGroupAdminOpen, setIsGroupAdminOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  function startMockSession() {
    setToken('change-me-dev-token');
    setIdentity({ type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon', scopes: ['messages:read', 'messages:write', 'projects:read', 'projects:write', 'admin'], channels: ['general'] });
    setIsLoggedOut(false);
    setIsLoading(false);
  }

  function clearSessionState() {
    setToken(null);
    setIdentity(null);
    setMessages([]);
    setGroupMessages({});
    setProfiles([]);
    setGroups([]);
    setProjects([]);
    setProjectTasks({});
    setTaskDocuments({});
    setActiveView('chat');
    setActiveGroupId(null);
    setActiveProjectId(null);
    setDraft('');
    setComposerAction('NONE');
    setComposerTargetProfileId(DIRECTED_TARGET_ALL);
    setIsGroupAdminOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (isLoggedOut) {
          setIsLoading(false);
          return;
        }
        if (authConfig.mode === 'mock') {
          if (!isMockAllowed()) throw new Error('Mock auth is local-only');
          startMockSession();
          return;
        }
        const kc = await initKeycloak(authConfig);
        if (!kc?.authenticated) {
          setIsLoading(false);
          return;
        }
        if (!cancelled && kc.token) setToken(kc.token);
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [authConfig, isLoggedOut]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function load() {
      try {
        const [me, history, statusResponse, groupResponse, projectResponse] = await Promise.all([
          fetchIdentity(token!),
          fetchMessages(token!),
          fetchProfileStatuses(token!),
          fetchGroups(token!),
          fetchProjects(token!).catch(() => ({ projects: [], generatedAt: new Date().toISOString() }))
        ]);
        if (!active) return;
        setIdentity(me);
        setMessages(history.messages);
        setProfiles(statusResponse.profiles);
        setGroups(groupResponse.groups);
        setProjects(projectResponse.projects);
        setActiveProjectId((current) => current ?? projectResponse.projects[0]?.id ?? null);
        setIsLoading(false);
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    }
    load();
    const refreshStatuses = () => void fetchProfileStatuses(token).then((response) => active && setProfiles(response.profiles)).catch(() => undefined);
    const refreshGroups = () => void fetchGroups(token).then((response) => active && setGroups(response.groups)).catch(() => undefined);
    const refreshProjects = () => void fetchProjects(token).then((response) => active && setProjects(response.projects)).catch(() => undefined);
    const interval = window.setInterval(() => { refreshStatuses(); refreshGroups(); refreshProjects(); }, 15_000);
    const socket = io({ auth: buildSocketAuth(token) });
    socket.on('message:new', (message: AgoraMessage) => {
      if (message.groupId) {
        setGroupMessages((current) => ({ ...current, [message.groupId!]: appendUnique(current[message.groupId!] ?? [], message) }));
      } else {
        setMessages((current) => appendUnique(current, message));
      }
      refreshStatuses();
    });
    socket.on('project:updated', (project: AgoraProject) => {
      setProjects((current) => upsertById(current, project));
      setActiveProjectId((current) => current ?? project.id);
    });
    socket.on('project:deleted', ({ projectId }: { projectId: string }) => {
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setProjectTasks((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setActiveProjectId((current) => current === projectId ? null : current);
    });
    socket.on('task:updated', (task: AgoraTask) => {
      setProjectTasks((current) => ({ ...current, [task.projectId]: upsertById(current[task.projectId] ?? [], task) }));
    });
    socket.on('task:documented', ({ task, document }: { task: AgoraTask; document: TaskDocument }) => {
      setProjectTasks((current) => ({ ...current, [task.projectId]: upsertById(current[task.projectId] ?? [], task) }));
      setTaskDocuments((current) => ({ ...current, [task.id]: appendUniqueDocument(current[task.id] ?? [], document) }));
    });
    return () => { active = false; window.clearInterval(interval); socket.close(); };
  }, [token]);

  useEffect(() => {
    if (!token || !activeGroupId || groupMessages[activeGroupId]) return;
    void fetchGroupMessages(token, activeGroupId).then((history) => setGroupMessages((current) => ({ ...current, [activeGroupId]: history.messages }))).catch((err) => setError((err as Error).message));
  }, [token, activeGroupId, groupMessages]);

  useEffect(() => {
    if (!token || !activeProjectId || projectTasks[activeProjectId]) return;
    void fetchProjectTasks(token, activeProjectId).then((response) => setProjectTasks((current) => ({ ...current, [activeProjectId]: response.tasks }))).catch((err) => setError((err as Error).message));
  }, [token, activeProjectId, projectTasks]);

  async function handleProjectRefresh(projectId: string) {
    if (!token) return;
    const response = await fetchProjectTasks(token, projectId);
    setProjectTasks((current) => ({ ...current, [projectId]: response.tasks }));
  }

  async function handleSaveProject(name: string, description: string, memberProfileIds: string[], sharedGroupIds: string[], projectId?: string) {
    if (!token) return;
    try {
      const project = projectId ? await updateProject(token, projectId, name, description, memberProfileIds, sharedGroupIds) : await createProject(token, name, description, memberProfileIds, sharedGroupIds);
      const projectResponse = await fetchProjects(token);
      setProjects(projectResponse.projects);
      setActiveProjectId(project.id);
      setActiveView('projects');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (!token) return;
    try {
      await deleteProject(token, projectId);
      const projectResponse = await fetchProjects(token);
      setProjects(projectResponse.projects);
      setProjectTasks((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setActiveProjectId(projectResponse.projects[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateTask(projectId: string, title: string, description: string, assigneeProfileIds: string[]) {
    if (!token) return;
    try {
      const task = await createProjectTask(token, projectId, { title, description, assigneeProfileIds, status: 'backlog' });
      setProjectTasks((current) => ({ ...current, [projectId]: upsertById(current[projectId] ?? [], task) }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleMoveTask(projectId: string, task: AgoraTask, status: KanbanStatus) {
    await handleUpdateTask(projectId, task, { status });
  }

  async function handleUpdateTask(projectId: string, task: AgoraTask, input: Partial<Pick<AgoraTask, 'title' | 'description' | 'status' | 'assigneeProfileIds' | 'labels' | 'order'>>) {
    if (!token) return;
    try {
      const updated = await updateProjectTask(token, projectId, task.id, input);
      setProjectTasks((current) => ({ ...current, [projectId]: upsertById(current[projectId] ?? [], updated) }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAppendTaskDocument(projectId: string, task: AgoraTask, body: string) {
    if (!token) return;
    try {
      const document = await appendTaskDocument(token, projectId, task.id, body, task.status === 'blocked' ? 'blocker' : task.status === 'review' ? 'qa' : task.status === 'done' ? 'result' : 'note');
      setTaskDocuments((current) => ({ ...current, [task.id]: appendUniqueDocument(current[task.id] ?? [], document) }));
      await handleProjectRefresh(projectId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleLoadTaskDocuments(projectId: string, taskId: string) {
    if (!token || taskDocuments[taskId]) return;
    const response = await fetchTaskDocuments(token, projectId, taskId);
    setTaskDocuments((current) => ({ ...current, [taskId]: response.documents }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const text = applyComposerAction(composerAction, draft);
    if (!text) return;
    const previousDraft = draft;
    setDraft('');
    try {
      if (activeView === 'group' && activeGroupId) {
        const message = await postGroupMessage(token, activeGroupId, text, buildTargetMetadata(composerTargetProfileId));
        setGroupMessages((current) => ({ ...current, [activeGroupId]: appendUnique(current[activeGroupId] ?? [], message) }));
      } else {
        const message = await postMessage(token, text);
        setMessages((current) => appendUnique(current, message));
      }
      const statusResponse = await fetchProfileStatuses(token);
      setProfiles(statusResponse.profiles);
    } catch (err) {
      setError((err as Error).message);
      setDraft(previousDraft);
    }
  }

  async function handleSaveGroup(name: string, memberProfileIds: string[], groupId?: string) {
    if (!token) return;
    const group = groupId ? await updateGroup(token, groupId, name, memberProfileIds) : await createGroup(token, name, memberProfileIds);
    const groupResponse = await fetchGroups(token);
    setGroups(groupResponse.groups);
    setActiveGroupId(group.id);
    setActiveView('group');
  }

  async function handleDeleteGroup(groupId: string) {
    if (!token) return;
    await deleteGroup(token, groupId);
    const groupResponse = await fetchGroups(token);
    setGroups(groupResponse.groups);
    setGroupMessages((current) => {
      const next = { ...current };
      delete next[groupId];
      return next;
    });
    if (activeGroupId === groupId) {
      setActiveGroupId(null);
      setActiveView('chat');
    }
  }

  async function handleLogin() {
    try {
      setError(null);
      setIsLoading(true);
      if (authConfig.mode === 'mock') {
        if (!isMockAllowed()) throw new Error('Mock auth is local-only');
        startMockSession();
        return;
      }
      const kc = await initKeycloak(authConfig);
      await kc?.login();
    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    try {
      clearSessionState();
      setIsLoggedOut(true);
      setIsLoading(false);
      await logoutKeycloak(authConfig);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeProjectTasks = activeProjectId ? projectTasks[activeProjectId] ?? [] : [];
  const activeMessages = activeView === 'group' && activeGroupId ? groupMessages[activeGroupId] ?? [] : messages;
  const recipientOptions = useMemo(() => buildRecipientOptions(activeGroup, profiles), [activeGroup, profiles]);
  const activeChannelValue = activeView === 'group' && activeGroupId ? `group:${activeGroupId}` : activeView === 'projects' && activeProjectId ? `project:${activeProjectId}` : activeView;

  function handleChannelSelect(value: string) {
    if (value.startsWith('group:')) {
      setActiveGroupId(value.slice('group:'.length));
      setActiveProjectId(null);
      setActiveView('group');
      return;
    }
    if (value.startsWith('project:')) {
      setActiveProjectId(value.slice('project:'.length));
      setActiveGroupId(null);
      setActiveView('projects');
      return;
    }
    setActiveGroupId(null);
    if (value !== 'projects') setActiveProjectId(null);
    setActiveView(value as View);
  }

  useEffect(() => {
    if (!activeGroup || (composerTargetProfileId !== DIRECTED_TARGET_ALL && !activeGroup.memberProfileIds.includes(composerTargetProfileId))) setComposerTargetProfileId(DIRECTED_TARGET_ALL);
  }, [activeGroup, composerTargetProfileId]);

  useLayoutEffect(() => {
    scrollMessagesToLatest(messagesRef.current);
  }, [activeMessages.length, activeGroupId, activeView]);

  useLayoutEffect(() => {
    document.querySelector('.sidebar .channel.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeView, activeGroupId]);

  if (isLoading) return <main className="center-card"><h1>Hermes Agora</h1><p>Inicializando hub interno…</p></main>;
  if (error) return <main className="center-card error"><h1>Hermes Agora</h1><p>{error}</p></main>;
  if (!token) return <LoginScreen onLogin={() => void handleLogin()} />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span aria-label="Hermes Agora">HA</span><strong>Hermes Agora</strong></div>
        <label className="mobile-channel-select"><span>Chat</span>
          <select value={activeChannelValue} onChange={(event) => handleChannelSelect(event.target.value)} aria-label="Seleccionar conversación">
            <option value="chat">General</option>
            <option value="monitor">Monitor</option>
            <option value="projects">Proyectos</option>
            {groups.map((group) => <option key={group.id} value={`group:${group.id}`}>Grupo: {group.name}</option>)}
            {projects.map((project) => <option key={project.id} value={`project:${project.id}`}>Proyecto: {project.name}</option>)}
          </select>
        </label>
        <button className={`channel ${activeView === 'chat' ? 'active' : ''}`} onClick={() => { setActiveView('chat'); setActiveGroupId(null); setActiveProjectId(null); }}>General</button>
        <button className={`channel ${activeView === 'monitor' ? 'active' : ''}`} onClick={() => setActiveView('monitor')}>Monitor</button>
        <button className={`channel ${activeView === 'projects' ? 'active' : ''}`} onClick={() => { setActiveView('projects'); setActiveGroupId(null); setActiveProjectId((current) => current ?? projects[0]?.id ?? null); }}>Proyectos</button>
        <section className="group-list">
          <small>Grupos</small>
          {groups.map((group) => <button key={group.id} className={`channel group-channel ${activeGroupId === group.id ? 'active' : ''}`} onClick={() => { setActiveView('group'); setActiveGroupId(group.id); setActiveProjectId(null); }}>Grupo: {group.name}</button>)}
          {groups.length === 0 && <p>No hay grupos todavía.</p>}
        </section>
        <section className="group-list project-nav-list">
          <small>Proyectos</small>
          {projects.map((project) => <button key={project.id} className={`channel group-channel ${activeProjectId === project.id ? 'active' : ''}`} onClick={() => { setActiveView('projects'); setActiveProjectId(project.id); setActiveGroupId(null); }}>Proyecto: {project.name}</button>)}
          {projects.length === 0 && <p>No hay proyectos todavía.</p>}
        </section>
        <button className="mobile-admin-toggle" onClick={() => setIsGroupAdminOpen((current) => !current)}>{isGroupAdminOpen ? 'Cerrar' : 'Gestionar grupos'}</button>
        <button type="button" className="mobile-logout-button" aria-label="Cerrar sesión" onClick={() => void handleLogout()}>Salir</button>
        <section className="identity">
          <small>Conectado como</small>
          <strong>{identity?.displayName ?? 'Operador'}</strong>
          <span>{identity?.type ?? 'human'}</span>
          <button type="button" className="logout-button" aria-label="Cerrar sesión" onClick={() => void handleLogout()}>Cerrar sesión</button>
        </section>
      </aside>
      {activeView === 'monitor' ? <MonitorScreen profiles={profiles} /> : activeView === 'projects' ? (
        <ProjectsScreen
          projects={projects}
          groups={groups}
          profiles={profiles}
          identity={identity}
          activeProject={activeProject}
          tasks={activeProjectTasks}
          taskDocuments={taskDocuments}
          onSelectProject={setActiveProjectId}
          onSaveProject={handleSaveProject}
          onDeleteProject={handleDeleteProject}
          onCreateTask={handleCreateTask}
          onMoveTask={handleMoveTask}
          onUpdateTask={handleUpdateTask}
          onAppendDocument={handleAppendTaskDocument}
          onLoadDocuments={handleLoadTaskDocuments}
        />
      ) : (
        <section className="chat">
          <header className="chat-header">
            <div className="chat-title-row">
              <div>
                <h1>{activeGroup ? activeGroup.name : 'General'}</h1>
                <p>{activeGroup ? `Grupo privado · ${activeGroup.memberProfileIds.length} perfiles` : 'Canal operativo para coordinación entre perfiles y operadores.'}</p>
              </div>
              {activeGroup && <button className="secondary-action" onClick={() => setIsGroupAdminOpen(true)}>Gestionar miembros</button>}
            </div>
          </header>
          <ol ref={messagesRef} className="messages">
            {activeMessages.map((message) => <li key={message.id} className={`message ${message.author.type}`}>
              <div className="message-meta"><strong>{message.author.displayName}</strong><span>{message.author.type}</span>{formatMessageTargets(message, profiles) && <span className="target-badge">Para: {formatMessageTargets(message, profiles)}</span>}<time>{new Date(message.createdAt).toLocaleString()}</time></div>
              <p>{message.text}</p>
            </li>)}
            {activeMessages.length === 0 && <li className="empty">Todavía no hay mensajes aquí.</li>}
          </ol>
          <form className="composer" onSubmit={handleSubmit}>
            <label className="action-select"><span>Acción</span>
              <select value={composerAction} onChange={(event) => setComposerAction(event.target.value as ComposerAction)} aria-label="Tipo de acción">
                {ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="recipient-select"><span>Para</span>
              <select value={composerTargetProfileId} onChange={(event) => setComposerTargetProfileId(event.target.value)} aria-label="Destinatario" disabled={!activeGroup}>
                {recipientOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={composerPlaceholder(composerAction, activeGroup?.name)} rows={1} />
            <button aria-label="Enviar mensaje"><span className="send-text">Enviar</span><span className="send-icon" aria-hidden="true">↵</span></button>
          </form>
        </section>
      )}
      <GroupAdminPanel groups={groups} profiles={profiles} activeGroupId={activeGroupId} isOpen={isGroupAdminOpen} onOpenChange={setIsGroupAdminOpen} onSave={handleSaveGroup} onDelete={handleDeleteGroup} />
    </main>
  );
}

function ProjectsScreen({ projects, groups, profiles, identity, activeProject, tasks, taskDocuments, onSelectProject, onSaveProject, onDeleteProject, onCreateTask, onMoveTask, onUpdateTask, onAppendDocument, onLoadDocuments }: {
  projects: AgoraProject[];
  groups: AgoraGroup[];
  profiles: ProfileStatus[];
  identity: Identity | null;
  activeProject: AgoraProject | null;
  tasks: AgoraTask[];
  taskDocuments: Record<string, TaskDocument[]>;
  onSelectProject: (projectId: string | null) => void;
  onSaveProject: (name: string, description: string, memberProfileIds: string[], sharedGroupIds: string[], projectId?: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onCreateTask: (projectId: string, title: string, description: string, assigneeProfileIds: string[]) => Promise<void>;
  onMoveTask: (projectId: string, task: AgoraTask, status: KanbanStatus) => Promise<void>;
  onUpdateTask: (projectId: string, task: AgoraTask, input: Partial<Pick<AgoraTask, 'title' | 'description' | 'status' | 'assigneeProfileIds' | 'labels' | 'order'>>) => Promise<void>;
  onAppendDocument: (projectId: string, task: AgoraTask, body: string) => Promise<void>;
  onLoadDocuments: (projectId: string, taskId: string) => Promise<void>;
}) {
  const [projectPanel, setProjectPanel] = useState<ProjectPanel>('board');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectMembers, setProjectMembers] = useState<string[]>([]);
  const [projectSharedGroupIds, setProjectSharedGroupIds] = useState<string[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]);
  const [documentDrafts, setDocumentDrafts] = useState<Record<string, string>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProjectName(activeProject?.name ?? '');
    setProjectDescription(activeProject?.description ?? '');
    setProjectMembers(activeProject?.memberProfileIds ?? []);
    setProjectSharedGroupIds(activeProject?.sharedGroupIds ?? []);
    setTaskAssignees([]);
    setSelectedTaskId(null);
    if (!activeProject) setProjectPanel('settings');
  }, [activeProject]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [selectedTaskId, tasks]);

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSaveProject(projectName, projectDescription, projectMembers, projectSharedGroupIds, activeProject?.id);
      if (!activeProject) {
        setProjectName('');
        setProjectDescription('');
        setProjectMembers([]);
        setProjectSharedGroupIds([]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!activeProject) return;
    setBusy(true);
    try {
      await onCreateTask(activeProject.id, taskTitle, taskDescription, taskAssignees);
      setTaskTitle('');
      setTaskDescription('');
      setTaskAssignees([]);
    } finally {
      setBusy(false);
    }
  }

  async function documentTask(task: AgoraTask) {
    if (!activeProject) return;
    const body = documentDrafts[task.id]?.trim();
    if (!body) return;
    setBusy(true);
    try {
      await onAppendDocument(activeProject.id, task, body);
      setDocumentDrafts((current) => ({ ...current, [task.id]: '' }));
    } finally {
      setBusy(false);
    }
  }

  async function updateTaskSpecification(task: AgoraTask, title: string, description: string) {
    if (!activeProject) return;
    setBusy(true);
    try {
      await onUpdateTask(activeProject.id, task, { title, description });
    } finally {
      setBusy(false);
    }
  }

  const memberNames = new Map(profiles.map((profile) => [profile.profileId, profile.displayName]));
  if (identity) memberNames.set(identity.profileId, identity.displayName);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const knownProjectMembers = identity && !profiles.some((profile) => profile.profileId === identity.profileId)
    ? [{ profileId: identity.profileId, displayName: `${identity.displayName} (yo)` }, ...profiles]
    : profiles;
  const selectableProjectMembers = knownProjectMembers.filter((profile) => profile.profileId !== (activeProject?.ownerProfileId ?? identity?.profileId));
  const ownerName = activeProject ? memberNames.get(activeProject.ownerProfileId) ?? activeProject.ownerProfileId : identity?.displayName ?? 'tú';
  const directMemberLabels = activeProject?.memberProfileIds.map((profileId) => memberNames.get(profileId) ?? profileId) ?? [];
  const sharedGroupLabels = activeProject?.sharedGroupIds.map((groupId) => groupNames.get(groupId) ?? groupId) ?? [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === 'done').length;
  const blockedTasks = tasks.filter((task) => task.status === 'blocked').length;
  const inFlightTasks = tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress' || task.status === 'review').length;
  const groupCountLabel = `${sharedGroupLabels.length} ${sharedGroupLabels.length === 1 ? 'grupo' : 'grupos'}`;
  const accessLabel = activeProject
    ? directMemberLabels.length || sharedGroupLabels.length
      ? `${directMemberLabels.length} perfiles · ${groupCountLabel}`
      : 'Privado'
    : 'Privado por defecto';
  const assignableProfileIds = activeProject ? [activeProject.ownerProfileId, ...activeProject.memberProfileIds].filter((profileId, index, all) => all.indexOf(profileId) === index) : [];
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;

  function startNewProject() {
    onSelectProject(null);
    setProjectPanel('settings');
    setProjectName('');
    setProjectDescription('');
    setProjectMembers([]);
    setProjectSharedGroupIds([]);
  }

  const projectForm = (mode: 'settings' | 'access') => <form className={`project-form ${mode === 'access' ? 'access-form' : ''}`} onSubmit={saveProject}>
    {mode === 'settings' && <>
      <div className="section-heading">
        <span>Detalles</span>
        <h2>{activeProject ? 'Información del proyecto' : 'Nuevo proyecto privado'}</h2>
        <p>Define un nombre claro y un objetivo operativo. La privacidad se gestiona en la pestaña Acceso.</p>
      </div>
      <label>Nombre<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ej. Rediseño Hermes Agora" /></label>
      <label>Descripción<textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="Objetivo, alcance y criterio de cierre" rows={5} /></label>
    </>}
    {mode === 'access' && <>
      <div className="section-heading">
        <span>Acceso</span>
        <h2>Usuarios, perfiles y grupos</h2>
        <p>Si no seleccionas perfiles ni grupos, solo {ownerName} podrá acceder al proyecto.</p>
      </div>
      <div className="access-summary-card">
        <span>Propietario</span><strong>{ownerName}</strong>
        <span>Visibilidad</span><strong>{accessLabel}</strong>
      </div>
      <fieldset>
        <legend>Compartir con usuarios/perfiles</legend>
        <div className="choice-list">
          {selectableProjectMembers.map((profile) => <label key={profile.profileId} className="checkbox-row">
            <input type="checkbox" checked={projectMembers.includes(profile.profileId)} onChange={(event) => setProjectMembers((current) => toggleMemberSelection(current, profile.profileId, event.target.checked))} />
            <span>{profile.displayName}</span><code>{profile.profileId}</code>
          </label>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Compartir con grupos</legend>
        <div className="choice-list">
          {groups.map((group) => <label key={group.id} className="checkbox-row">
            <input type="checkbox" checked={projectSharedGroupIds.includes(group.id)} onChange={(event) => setProjectSharedGroupIds((current) => toggleMemberSelection(current, group.id, event.target.checked))} />
            <span>{group.name}</span><code>{group.memberProfileIds.length} miembros</code>
          </label>)}
          {groups.length === 0 && <p className="form-hint">No hay grupos disponibles.</p>}
        </div>
      </fieldset>
    </>}
    <div className="form-actions">
      <button disabled={busy || !projectName.trim()}>{busy ? 'Guardando…' : activeProject ? 'Guardar cambios' : 'Crear proyecto'}</button>
      {activeProject && mode === 'settings' && <button className="danger" type="button" disabled={busy} onClick={() => { if (window.confirm(`Eliminar proyecto ${activeProject.name} y todas sus tareas/documentos?`)) void onDeleteProject(activeProject.id); }}>Eliminar proyecto</button>}
    </div>
  </form>;

  return <section className="projects-screen">
    <header className="chat-header project-header">
      <div className="project-title-block">
        <small>Hermes Agora / Proyectos</small>
        <h1>{activeProject?.name ?? 'Nuevo proyecto'}</h1>
        <p>Kanban operativo con proyectos privados por defecto. Comparte solo con usuarios o grupos cuando haga falta.</p>
      </div>
      <div className="project-header-actions">
        <label className="project-select">Proyecto activo
          <select value={activeProject?.id ?? ''} onChange={(event) => onSelectProject(event.target.value || null)}>
            <option value="">Selecciona proyecto</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <button type="button" className="secondary-action" onClick={startNewProject}>Nuevo proyecto</button>
      </div>
    </header>

    <div className="project-overview">
      <article><span>Tareas</span><strong>{totalTasks}</strong><small>{inFlightTasks} activas</small></article>
      <article><span>Bloqueos</span><strong>{blockedTasks}</strong><small>{blockedTasks ? 'requiere atención' : 'sin bloqueos'}</small></article>
      <article><span>Completadas</span><strong>{doneTasks}</strong><small>{totalTasks ? `${Math.round((doneTasks / totalTasks) * 100)}% cerrado` : 'sin histórico'}</small></article>
      <article><span>Visibilidad</span><strong>{accessLabel}</strong><small>Owner: {ownerName}</small></article>
    </div>

    <nav className="project-tabs" aria-label="Secciones del proyecto">
      <button type="button" className={projectPanel === 'board' ? 'active' : ''} disabled={!activeProject} onClick={() => setProjectPanel('board')}>Tablero</button>
      <button type="button" className={projectPanel === 'access' ? 'active' : ''} onClick={() => setProjectPanel('access')}>Acceso</button>
      <button type="button" className={projectPanel === 'settings' ? 'active' : ''} onClick={() => setProjectPanel('settings')}>Ajustes</button>
    </nav>

    <div className="project-workspace">
      {projectPanel === 'settings' && <section className="project-panel settings-panel">{projectForm('settings')}</section>}
      {projectPanel === 'access' && <section className="project-panel access-panel">{projectForm('access')}</section>}
      {projectPanel === 'board' && <section className="project-panel board-panel">
        {activeProject ? <>
          <div className="project-access-summary" aria-label="Resumen de acceso">
            <span>Propietario: {ownerName}</span>
            <span>{directMemberLabels.length ? `Usuarios/perfiles: ${directMemberLabels.join(', ')}` : 'Privado para owner'}</span>
            <span>{sharedGroupLabels.length ? `Grupos: ${sharedGroupLabels.join(', ')}` : 'Sin grupos compartidos'}</span>
          </div>
          <form className="task-create-form" onSubmit={createTask}>
            <div className="section-heading compact">
              <span>Quick add</span>
              <h2>Nueva tarea</h2>
              <p>Se crea en Backlog; luego se mueve en el tablero.</p>
            </div>
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Título de tarea" />
            <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Contexto y criterio de cierre" rows={2} />
            <div className="assignee-grid">
              {assignableProfileIds.map((profileId) => <label key={profileId} className="assignee-chip">
                <input type="checkbox" checked={taskAssignees.includes(profileId)} onChange={(event) => setTaskAssignees((current) => toggleMemberSelection(current, profileId, event.target.checked))} />
                {memberNames.get(profileId) ?? profileId}
              </label>)}
            </div>
            <button disabled={busy || !taskTitle.trim()}>Crear tarea</button>
          </form>
          <div className="kanban-board">
            {KANBAN_COLUMNS.map((column) => {
              const columnTasks = tasks.filter((task) => task.status === column.status);
              return <section key={column.status} className={`kanban-column status-${column.status}`}>
                <h3>{column.label}<span>{columnTasks.length}</span></h3>
                {columnTasks.map((task) => <article
                  key={task.id}
                  className="task-card"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir especificación de ${task.title}`}
                  onClick={() => setSelectedTaskId(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedTaskId(task.id);
                    }
                  }}
                >
                  <div className="task-card-head">
                    <strong>{task.title}</strong>
                    <select
                      value={task.status}
                      aria-label={`Mover ${task.title}`}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={(event) => void onMoveTask(activeProject.id, task, event.target.value as KanbanStatus)}
                    >
                      {KANBAN_COLUMNS.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}
                    </select>
                  </div>
                  <small>Asignado: {task.assigneeProfileIds.length ? task.assigneeProfileIds.map((profileId) => memberNames.get(profileId) ?? profileId).join(', ') : 'sin asignar'}</small>
                  <small>Click para abrir especificación Markdown · Documentación: {taskDocuments[task.id]?.length ?? 0}</small>
                </article>)}
                {columnTasks.length === 0 && <p className="empty-column">Sin tareas.</p>}
              </section>;
            })}
          </div>
          {activeProject && selectedTask && <TaskDetailModal
            task={selectedTask}
            projectId={activeProject.id}
            documents={taskDocuments[selectedTask.id] ?? []}
            documentDraft={documentDrafts[selectedTask.id] ?? ''}
            memberNames={memberNames}
            busy={busy}
            onClose={() => setSelectedTaskId(null)}
            onSaveSpecification={updateTaskSpecification}
            onLoadDocuments={onLoadDocuments}
            onDocumentDraftChange={(value) => setDocumentDrafts((current) => ({ ...current, [selectedTask.id]: value }))}
            onDocument={() => void documentTask(selectedTask)}
          />}
        </> : <div className="empty project-empty"><strong>No hay proyecto activo.</strong><p>Crea uno desde Ajustes; será privado por defecto hasta que añadas acceso.</p><button type="button" onClick={() => setProjectPanel('settings')}>Crear proyecto</button></div>}
      </section>}
    </div>
  </section>;
}

function TaskDetailModal({ task, projectId, documents, documentDraft, memberNames, busy, onClose, onSaveSpecification, onLoadDocuments, onDocumentDraftChange, onDocument }: {
  task: AgoraTask;
  projectId: string;
  documents: TaskDocument[];
  documentDraft: string;
  memberNames: Map<string, string>;
  busy: boolean;
  onClose: () => void;
  onSaveSpecification: (task: AgoraTask, title: string, description: string) => Promise<void>;
  onLoadDocuments: (projectId: string, taskId: string) => Promise<void>;
  onDocumentDraftChange: (value: string) => void;
  onDocument: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [markdownDraft, setMarkdownDraft] = useState(task.description);

  useEffect(() => {
    setTitleDraft(task.title);
    setMarkdownDraft(task.description);
  }, [task.id, task.title, task.description]);

  useEffect(() => {
    void onLoadDocuments(projectId, task.id);
  }, [projectId, task.id]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function saveSpecification(event: FormEvent) {
    event.preventDefault();
    await onSaveSpecification(task, titleDraft, markdownDraft);
  }

  const assignees = task.assigneeProfileIds.length
    ? task.assigneeProfileIds.map((profileId) => memberNames.get(profileId) ?? profileId).join(', ')
    : 'sin asignar';

  return <div className="task-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <header className="task-modal-header">
        <div>
          <span className="task-modal-kicker">Especificación Markdown</span>
          <h2 id="task-modal-title">{task.title}</h2>
          <p>{assignees} · {KANBAN_COLUMNS.find((column) => column.status === task.status)?.label ?? task.status}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Cerrar especificación" onClick={onClose}>×</button>
      </header>

      <form className="task-spec-form" onSubmit={saveSpecification}>
        <label>Título
          <input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} placeholder="Título de tarea" />
        </label>
        <label>Especificación
          <textarea className="markdown-editor" value={markdownDraft} onChange={(event) => setMarkdownDraft(event.target.value)} placeholder="# Objetivo\n\n## Contexto\n\n## Criterio de cierre" rows={12} />
        </label>
        <div className="markdown-preview" aria-label="Vista previa Markdown">
          <span>Vista previa</span>
          <pre>{markdownDraft || 'Sin especificación todavía.'}</pre>
        </div>
        <div className="form-actions">
          <button disabled={busy || !titleDraft.trim()}>{busy ? 'Guardando…' : 'Guardar especificación'}</button>
          <button className="secondary-action" type="button" onClick={onClose}>Cerrar</button>
        </div>
      </form>

      <section className="task-modal-docs" aria-label="Documentación de tarea">
        <div className="section-heading compact">
          <span>Documentación</span>
          <h2>Notas, bloqueos, resultados y QA</h2>
        </div>
        <ol className="task-documents">
          {documents.map((document) => <li key={document.id}><strong>{document.kind}</strong><p>{document.body}</p><small>{document.author.displayName} · {formatDate(document.createdAt)}</small></li>)}
          {documents.length === 0 && <li className="empty-column">Sin documentación todavía.</li>}
        </ol>
        <textarea value={documentDraft} onChange={(event) => onDocumentDraftChange(event.target.value)} placeholder="Añadir nota, resultado, bloqueo o QA…" rows={3} />
        <button type="button" disabled={busy || !documentDraft.trim()} onClick={onDocument}>Documentar</button>
      </section>
    </section>
  </div>;
}

function GroupAdminPanel({ groups, profiles, activeGroupId, isOpen, onOpenChange, onSave, onDelete }: { groups: AgoraGroup[]; profiles: ProfileStatus[]; activeGroupId: string | null; isOpen: boolean; onOpenChange: (open: boolean) => void; onSave: (name: string, memberProfileIds: string[], groupId?: string) => Promise<void>; onDelete: (groupId: string) => Promise<void> }) {
  const [selectedGroupId, setSelectedGroupId] = useState('new');
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (activeGroupId && groups.some((group) => group.id === activeGroupId)) setSelectedGroupId(activeGroupId);
  }, [activeGroupId, groups]);

  useEffect(() => {
    setName(selectedGroup?.name ?? '');
    setMembers(selectedGroup?.memberProfileIds ?? []);
  }, [selectedGroup]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave(name, members, selectedGroup?.id);
      if (!selectedGroup) {
        setSelectedGroupId('new');
        setName('');
        setMembers([]);
      } else {
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedGroup) return;
    setBusy(true);
    try {
      await onDelete(selectedGroup.id);
      setSelectedGroupId('new');
      setName('');
      setMembers([]);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return <aside className={`group-admin ${isOpen ? 'open' : 'collapsed'}`}>
    <div className="panel-heading">
      <div>
        <h2>{selectedGroup ? 'Editar grupo' : 'Crear grupo'}</h2>
        <p>{selectedGroup ? 'Añade o quita perfiles de un grupo existente.' : 'Crea salas privadas y asigna perfiles Hermes.'}</p>
      </div>
      <button className="icon-button" type="button" onClick={() => onOpenChange(false)} aria-label="Cerrar gestión de grupos">×</button>
    </div>
    <label>Editar
      <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
        <option value="new">Nuevo grupo</option>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
    </label>
    <form onSubmit={save}>
      <label>Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Equipo legal" />
      </label>
      <fieldset>
        <legend>Perfiles asignados</legend>
        {profiles.map((profile) => <label key={profile.profileId} className="checkbox-row">
          <input type="checkbox" checked={members.includes(profile.profileId)} onChange={(event) => setMembers((current) => toggleMemberSelection(current, profile.profileId, event.target.checked))} />
          <span>{profile.displayName}</span><code>{profile.profileId}</code>
        </label>)}
      </fieldset>
      <button disabled={busy || !name.trim() || members.length === 0}>{busy ? 'Guardando…' : selectedGroup ? 'Actualizar grupo' : 'Crear grupo'}</button>
      {selectedGroup && <button className="danger" type="button" disabled={busy} onClick={removeSelected}>Eliminar grupo</button>}
    </form>
  </aside>;
}

function MonitorScreen({ profiles }: { profiles: ProfileStatus[] }) {
  const counts = profiles.reduce<Record<string, number>>((acc, profile) => {
    acc[profile.status] = (acc[profile.status] ?? 0) + 1;
    return acc;
  }, {});
  return <section className="monitor">
    <header className="chat-header">
      <h1>Monitor de agentes</h1>
      <p>Estado operativo de perfiles Hermes. Se actualiza automáticamente cada 15 segundos y con cada mensaje nuevo.</p>
      <div className="status-summary">
        <span><strong>{counts.online ?? 0}</strong> online</span>
        <span><strong>{counts.idle ?? 0}</strong> idle</span>
        <span><strong>{counts.blocked ?? 0}</strong> bloqueado</span>
        <span><strong>{counts.unknown ?? 0}</strong> unknown</span>
      </div>
    </header>
    <div className="profile-grid">
      {profiles.map((profile) => <article key={profile.profileId} className={`profile-card ${profile.status}`}>
        <div className="profile-topline"><strong>{profile.displayName}</strong><span className="status-pill">{profile.status}</span></div>
        <code>{profile.profileId}</code>
        <p>{profile.note ?? 'Sin nota operativa.'}</p>
        <dl>
          <div><dt>Última señal</dt><dd>{formatDate(profile.lastSeenAt)}</dd></div>
          <div><dt>Último mensaje</dt><dd>{formatDate(profile.lastMessageAt)}</dd></div>
          <div><dt>Canales</dt><dd>{profile.channels.join(', ')}</dd></div>
        </dl>
      </article>)}
    </div>
  </section>;
}

function appendUnique(messages: AgoraMessage[], message: AgoraMessage) {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

function appendUniqueDocument(documents: TaskDocument[], document: TaskDocument) {
  return documents.some((item) => item.id === document.id) ? documents : [...documents, document];
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const exists = items.some((item) => item.id === nextItem.id);
  const next = exists ? items.map((item) => item.id === nextItem.id ? nextItem : item) : [...items, nextItem];
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function formatMessageTargets(message: AgoraMessage, profiles: ProfileStatus[]): string | null {
  const targets = message.metadata?.targetProfileIds;
  if (!Array.isArray(targets) || targets.length === 0) return null;
  const profileNames = new Map(profiles.map((profile) => [profile.profileId, profile.displayName]));
  return targets
    .filter((target): target is string => typeof target === 'string')
    .map((target) => profileNames.get(target) ?? target)
    .join(', ');
}

function composerPlaceholder(action: ComposerAction, groupName?: string): string {
  const target = groupName ? ` para ${groupName}` : '';
  if (action === 'TASK') return `Describe objetivo, contexto y criterio de cierre${target}…`;
  if (action === 'DONE') return `Resume resultado y evidencia${target}…`;
  if (action === 'BLOCKED') return `Indica bloqueo, dependencia y responsable${target}…`;
  if (action === 'QA') return `Criterio revisado y hallazgos${target}…`;
  return 'Mensaje operativo…';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return <main className="center-card"><h1>Hermes Agora</h1><p>Hub privado para perfiles Hermes de Black Tower Consulting.</p><button onClick={onLogin}>Entrar con Keycloak</button></main>;
}
