import { FormEvent, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { AgoraMessage, Identity, ProfileStatus } from '../shared/types';
import { createClientAuthConfig, initKeycloak, isMockAllowed } from './auth';
import { fetchIdentity, fetchMessages, fetchProfileStatuses, postMessage } from './api';
import './styles.css';

type View = 'chat' | 'monitor';

export function App() {
  const authConfig = useMemo(() => createClientAuthConfig(import.meta.env), []);
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [messages, setMessages] = useState<AgoraMessage[]>([]);
  const [profiles, setProfiles] = useState<ProfileStatus[]>([]);
  const [activeView, setActiveView] = useState<View>('chat');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (authConfig.mode === 'mock') {
          if (!isMockAllowed()) throw new Error('Mock auth is local-only');
          setToken('change-me-dev-token');
          setIdentity({ type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon', scopes: ['messages:read', 'messages:write'], channels: ['general'] });
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
        const [me, history, statusResponse] = await Promise.all([fetchIdentity(token!), fetchMessages(token!), fetchProfileStatuses(token!)]);
        if (!active) return;
        setIdentity(me);
        setMessages(history.messages);
        setProfiles(statusResponse.profiles);
        setIsLoading(false);
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    }
    load();
    const refreshStatuses = () => void fetchProfileStatuses(token).then((response) => active && setProfiles(response.profiles)).catch(() => undefined);
    const interval = window.setInterval(refreshStatuses, 15_000);
    const socket = io({ auth: { token } });
    socket.on('message:new', (message: AgoraMessage) => {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      refreshStatuses();
    });
    return () => { active = false; window.clearInterval(interval); socket.close(); };
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !draft.trim()) return;
    const text = draft;
    setDraft('');
    try {
      const message = await postMessage(token, text);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      const statusResponse = await fetchProfileStatuses(token);
      setProfiles(statusResponse.profiles);
    } catch (err) {
      setError((err as Error).message);
      setDraft(text);
    }
  }

  if (isLoading) return <main className="center-card"><h1>Hermes Agora</h1><p>Inicializando hub interno…</p></main>;
  if (error) return <main className="center-card error"><h1>Hermes Agora</h1><p>{error}</p></main>;
  if (!token) return <LoginScreen onLogin={() => void initKeycloak(authConfig).then((kc) => kc?.login())} />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>Ἀγορά</span><strong>Hermes Agora</strong></div>
        <button className={`channel ${activeView === 'chat' ? 'active' : ''}`} onClick={() => setActiveView('chat')}># general</button>
        <button className={`channel ${activeView === 'monitor' ? 'active' : ''}`} onClick={() => setActiveView('monitor')}>◉ monitor agentes</button>
        <section className="identity">
          <small>Conectado como</small>
          <strong>{identity?.displayName ?? 'Operador'}</strong>
          <span>{identity?.type ?? 'human'}</span>
        </section>
      </aside>
      {activeView === 'chat' ? (
        <section className="chat">
          <header className="chat-header"><h1># general</h1><p>Bus interno para perfiles Hermes. Protocolo: TASK / DONE / BLOCKED / QA.</p></header>
          <ol className="messages">
            {messages.map((message) => <li key={message.id} className={`message ${message.author.type}`}>
              <div className="message-meta"><strong>{message.author.displayName}</strong><span>{message.author.type}</span><time>{new Date(message.createdAt).toLocaleString()}</time></div>
              <p>{message.text}</p>
            </li>)}
            {messages.length === 0 && <li className="empty">Todavía no hay mensajes. Envía el primer TASK.</li>}
          </ol>
          <form className="composer" onSubmit={handleSubmit}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe un TASK, DONE, BLOCKED o QA…" />
            <button>Enviar</button>
          </form>
        </section>
      ) : <MonitorScreen profiles={profiles} />}
    </main>
  );
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

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return <main className="center-card"><h1>Hermes Agora</h1><p>Hub privado para perfiles Hermes de Black Tower Consulting.</p><button onClick={onLogin}>Entrar con Keycloak</button></main>;
}
