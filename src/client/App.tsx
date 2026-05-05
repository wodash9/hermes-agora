import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { AgoraGroup, AgoraMessage, Identity, ProfileStatus } from '../shared/types';
import { createClientAuthConfig, initKeycloak, isMockAllowed } from './auth';
import { createGroup, deleteGroup, fetchGroupMessages, fetchGroups, fetchIdentity, fetchMessages, fetchProfileStatuses, postGroupMessage, postMessage, updateGroup, buildSocketAuth } from './api';
import { ACTION_OPTIONS, DIRECTED_TARGET_ALL, applyComposerAction, buildRecipientOptions, buildTargetMetadata, toggleMemberSelection, type ComposerAction } from './uiState';
import { scrollMessagesToLatest } from './scroll';
import './styles.css';

type View = 'chat' | 'monitor' | 'group';

export function App() {
  const authConfig = useMemo(() => createClientAuthConfig(import.meta.env), []);
  const messagesRef = useRef<HTMLOListElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [messages, setMessages] = useState<AgoraMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<Record<string, AgoraMessage[]>>({});
  const [profiles, setProfiles] = useState<ProfileStatus[]>([]);
  const [groups, setGroups] = useState<AgoraGroup[]>([]);
  const [activeView, setActiveView] = useState<View>('chat');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [composerAction, setComposerAction] = useState<ComposerAction>('NONE');
  const [composerTargetProfileId, setComposerTargetProfileId] = useState(DIRECTED_TARGET_ALL);
  const [isGroupAdminOpen, setIsGroupAdminOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (authConfig.mode === 'mock') {
          if (!isMockAllowed()) throw new Error('Mock auth is local-only');
          setToken('change-me-dev-token');
          setIdentity({ type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon', scopes: ['messages:read', 'messages:write', 'admin'], channels: ['general'] });
          setIsLoading(false);
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
  }, [authConfig]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function load() {
      try {
        const [me, history, statusResponse, groupResponse] = await Promise.all([fetchIdentity(token!), fetchMessages(token!), fetchProfileStatuses(token!), fetchGroups(token!)]);
        if (!active) return;
        setIdentity(me);
        setMessages(history.messages);
        setProfiles(statusResponse.profiles);
        setGroups(groupResponse.groups);
        setIsLoading(false);
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    }
    load();
    const refreshStatuses = () => void fetchProfileStatuses(token).then((response) => active && setProfiles(response.profiles)).catch(() => undefined);
    const refreshGroups = () => void fetchGroups(token).then((response) => active && setGroups(response.groups)).catch(() => undefined);
    const interval = window.setInterval(() => { refreshStatuses(); refreshGroups(); }, 15_000);
    const socket = io({ auth: buildSocketAuth(token) });
    socket.on('message:new', (message: AgoraMessage) => {
      if (message.groupId) {
        setGroupMessages((current) => ({ ...current, [message.groupId!]: appendUnique(current[message.groupId!] ?? [], message) }));
      } else {
        setMessages((current) => appendUnique(current, message));
      }
      refreshStatuses();
    });
    return () => { active = false; window.clearInterval(interval); socket.close(); };
  }, [token]);

  useEffect(() => {
    if (!token || !activeGroupId || groupMessages[activeGroupId]) return;
    void fetchGroupMessages(token, activeGroupId).then((history) => setGroupMessages((current) => ({ ...current, [activeGroupId]: history.messages }))).catch((err) => setError((err as Error).message));
  }, [token, activeGroupId, groupMessages]);

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

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const activeMessages = activeView === 'group' && activeGroupId ? groupMessages[activeGroupId] ?? [] : messages;
  const recipientOptions = useMemo(() => buildRecipientOptions(activeGroup, profiles), [activeGroup, profiles]);
  const activeChannelValue = activeView === 'group' && activeGroupId ? `group:${activeGroupId}` : activeView;

  function handleChannelSelect(value: string) {
    if (value.startsWith('group:')) {
      setActiveGroupId(value.slice('group:'.length));
      setActiveView('group');
      return;
    }
    setActiveGroupId(null);
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
  if (!token) return <LoginScreen onLogin={() => void initKeycloak(authConfig).then((kc) => kc?.login())} />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span aria-label="Hermes Agora">Ἀ</span><strong>Hermes Agora</strong></div>
        <label className="mobile-channel-select"><span>Chat</span>
          <select value={activeChannelValue} onChange={(event) => handleChannelSelect(event.target.value)} aria-label="Seleccionar conversación">
            <option value="chat"># general</option>
            <option value="monitor">Monitor</option>
            {groups.map((group) => <option key={group.id} value={`group:${group.id}`}>@ {group.name}</option>)}
          </select>
        </label>
        <button className={`channel ${activeView === 'chat' ? 'active' : ''}`} onClick={() => { setActiveView('chat'); setActiveGroupId(null); }}># general</button>
        <button className={`channel ${activeView === 'monitor' ? 'active' : ''}`} onClick={() => setActiveView('monitor')}>◉ monitor agentes</button>
        <section className="group-list">
          <small>Grupos</small>
          {groups.map((group) => <button key={group.id} className={`channel group-channel ${activeGroupId === group.id ? 'active' : ''}`} onClick={() => { setActiveView('group'); setActiveGroupId(group.id); }}>@ {group.name}</button>)}
          {groups.length === 0 && <p>No hay grupos todavía.</p>}
        </section>
        <button className="mobile-admin-toggle" onClick={() => setIsGroupAdminOpen((current) => !current)}>{isGroupAdminOpen ? 'Cerrar' : 'Grupos'}</button>
        <section className="identity">
          <small>Conectado como</small>
          <strong>{identity?.displayName ?? 'Operador'}</strong>
          <span>{identity?.type ?? 'human'}</span>
        </section>
      </aside>
      {activeView === 'monitor' ? <MonitorScreen profiles={profiles} /> : (
        <section className="chat">
          <header className="chat-header">
            <div className="chat-title-row">
              <div>
                <h1>{activeGroup ? `@ ${activeGroup.name}` : '# general'}</h1>
                <p>{activeGroup ? `Grupo privado: ${activeGroup.memberProfileIds.length} perfiles · ${activeGroup.memberProfileIds.join(', ')}` : 'Bus interno para perfiles Hermes. Protocolo: TASK / DONE / BLOCKED / QA.'}</p>
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
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={composerPlaceholder(composerAction, activeGroup?.name)} />
            <button aria-label="Enviar mensaje"><span className="send-text">Enviar</span><span className="send-icon" aria-hidden="true">➤</span></button>
          </form>
        </section>
      )}
      <GroupAdminPanel groups={groups} profiles={profiles} activeGroupId={activeGroupId} isOpen={isGroupAdminOpen} onOpenChange={setIsGroupAdminOpen} onSave={handleSaveGroup} onDelete={handleDeleteGroup} />
    </main>
  );
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
  if (action === 'TASK') return `ID y tarea${target}: BTC-001 — revisar…`;
  if (action === 'DONE') return `ID y resultado${target}: BTC-001 — completado…`;
  if (action === 'BLOCKED') return `ID y bloqueo${target}: BTC-001 — falta contexto…`;
  if (action === 'QA') return `Revisión QA${target}: criterios, hallazgos…`;
  return 'Mensaje…';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return <main className="center-card"><h1>Hermes Agora</h1><p>Hub privado para perfiles Hermes de Black Tower Consulting.</p><button onClick={onLogin}>Entrar con Keycloak</button></main>;
}
