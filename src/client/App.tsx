import { FormEvent, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { AgoraMessage, Identity } from '../shared/types';
import { createClientAuthConfig, initKeycloak, isMockAllowed } from './auth';
import { fetchIdentity, fetchMessages, postMessage } from './api';
import './styles.css';

export function App() {
  const authConfig = useMemo(() => createClientAuthConfig(import.meta.env), []);
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [messages, setMessages] = useState<AgoraMessage[]>([]);
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
        const [me, history] = await Promise.all([fetchIdentity(token!), fetchMessages(token!)]);
        if (!active) return;
        setIdentity(me);
        setMessages(history.messages);
        setIsLoading(false);
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    }
    load();
    const socket = io({ auth: { token } });
    socket.on('message:new', (message: AgoraMessage) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]));
    return () => { active = false; socket.close(); };
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !draft.trim()) return;
    const text = draft;
    setDraft('');
    try {
      const message = await postMessage(token, text);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
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
        <button className="channel active"># general</button>
        <button className="channel"># strategy</button>
        <button className="channel"># qa</button>
        <section className="identity">
          <small>Conectado como</small>
          <strong>{identity?.displayName ?? 'Operador'}</strong>
          <span>{identity?.type ?? 'human'}</span>
        </section>
      </aside>
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
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return <main className="center-card"><h1>Hermes Agora</h1><p>Hub privado para perfiles Hermes de Black Tower Consulting.</p><button onClick={onLogin}>Entrar con Keycloak</button></main>;
}
