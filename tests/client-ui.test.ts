import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_OPTIONS, DIRECTED_TARGET_ALL, applyComposerAction, buildRecipientOptions, buildTargetMetadata, toggleMemberSelection } from '../src/client/uiState';
import { appendTaskDocument, buildAuthHeaders, buildSocketAuth, createProject, createProjectTask, deleteProject, postGroupMessage, updateProjectTask } from '../src/client/api';
import { scrollMessagesToLatest } from '../src/client/scroll';
import { defaultPostLogoutRedirectUri } from '../src/client/auth';

afterEach(() => vi.restoreAllMocks());

describe('client UI helpers', () => {
  it('offers explicit Agora action protocol options for the composer', () => {
    expect(ACTION_OPTIONS.map((option) => option.value)).toEqual(['NONE', 'TASK', 'DONE', 'BLOCKED', 'QA']);
  });

  it('prefixes selected action exactly once before sending chat text', () => {
    expect(applyComposerAction('TASK', 'BTC-123 — revisar deploy')).toBe('TASK BTC-123 — revisar deploy');
    expect(applyComposerAction('TASK', 'TASK BTC-123 — revisar deploy')).toBe('TASK BTC-123 — revisar deploy');
    expect(applyComposerAction('DONE', 'BTC-123 — revisado')).toBe('DONE BTC-123 — revisado');
    expect(applyComposerAction('NONE', 'mensaje libre')).toBe('mensaje libre');
  });

  it('adds and removes members from an existing group selection without duplicates', () => {
    expect(toggleMemberSelection(['jeeves-ops'], 'daneel-cto', true)).toEqual(['jeeves-ops', 'daneel-cto']);
    expect(toggleMemberSelection(['jeeves-ops'], 'jeeves-ops', true)).toEqual(['jeeves-ops']);
    expect(toggleMemberSelection(['jeeves-ops', 'daneel-cto'], 'jeeves-ops', false)).toEqual(['daneel-cto']);
  });

  it('offers a directed recipient selector with all group participants plus a broadcast option', () => {
    const options = buildRecipientOptions(
      { id: 'ops', name: 'Ops', memberProfileIds: ['jeeves-ops', 'daneel-cto'], createdAt: '', updatedAt: '', createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' } },
      [
        { profileId: 'daneel-cto', displayName: 'Daneel', status: 'online', channels: ['general'], scopes: ['messages:read'], lastSeenAt: null, lastMessageAt: null, note: null },
        { profileId: 'jeeves-ops', displayName: 'Jeeves', status: 'idle', channels: ['general'], scopes: ['messages:read'], lastSeenAt: null, lastMessageAt: null, note: null },
        { profileId: 'columbo-qa', displayName: 'Columbo', status: 'unknown', channels: ['general'], scopes: ['messages:read'], lastSeenAt: null, lastMessageAt: null, note: null }
      ]
    );

    expect(options).toEqual([
      { value: DIRECTED_TARGET_ALL, label: 'Todos los participantes' },
      { value: 'daneel-cto', label: 'Daneel' },
      { value: 'jeeves-ops', label: 'Jeeves' }
    ]);
  });

  it('builds compact target metadata only when a specific group participant is selected', () => {
    expect(buildTargetMetadata(DIRECTED_TARGET_ALL)).toEqual({});
    expect(buildTargetMetadata('jeeves-ops')).toEqual({ targetProfileIds: ['jeeves-ops'] });
  });

  it('posts directed group messages with targetProfileIds metadata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'msg_1', text: 'TASK BTC-1', metadata: { targetProfileIds: ['jeeves-ops'] } }) } as Response);

    await postGroupMessage('change-me-dev-token', 'ops', 'TASK BTC-1', { targetProfileIds: ['jeeves-ops'] });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/groups/ops/messages', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'TASK BTC-1', metadata: { targetProfileIds: ['jeeves-ops'] } })
    }));
  });

  it('serializes project and task kanban API calls for agents and operators', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'ok' }) } as Response);

    await createProject('change-me-dev-token', 'Agora', 'Kanban interno', ['daneel-cto']);
    await createProjectTask('change-me-dev-token', 'agora', { title: 'Crear tablero', status: 'backlog', assigneeProfileIds: ['daneel-cto'] });
    await updateProjectTask('change-me-dev-token', 'agora', 'task_1', { status: 'review' });
    await appendTaskDocument('change-me-dev-token', 'agora', 'task_1', 'QA listo', 'qa');
    await deleteProject('change-me-dev-token', 'agora');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/projects', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Agora', description: 'Kanban interno', memberProfileIds: ['daneel-cto'], sharedGroupIds: [] }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/projects/agora/tasks', expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Crear tablero', status: 'backlog', assigneeProfileIds: ['daneel-cto'] }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/projects/agora/tasks/task_1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'review' }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/projects/agora/tasks/task_1/documents', expect.objectContaining({ method: 'POST', body: JSON.stringify({ body: 'QA listo', kind: 'qa' }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/v1/projects/agora', expect.objectContaining({ method: 'DELETE' }));
  });

  it('adds mock profile identity to REST and socket auth only for the local mock token', () => {
    expect(buildAuthHeaders('change-me-dev-token')).toMatchObject({ Authorization: 'Bearer change-me-dev-token', 'X-Hermes-Profile': 'seldon-ceo' });
    expect(buildSocketAuth('change-me-dev-token')).toEqual({ token: 'change-me-dev-token', profileId: 'seldon-ceo' });
    expect(buildAuthHeaders('real-keycloak-token')).toEqual({ Authorization: 'Bearer real-keycloak-token' });
    expect(buildSocketAuth('real-keycloak-token')).toEqual({ token: 'real-keycloak-token' });
  });

  it('builds a safe post-logout redirect back to the Agora origin root', () => {
    expect(defaultPostLogoutRedirectUri('https://agora.etharlia.com/projects')).toBe('https://agora.etharlia.com/');
    expect(defaultPostLogoutRedirectUri('http://127.0.0.1:5179/projects?tab=access')).toBe('http://127.0.0.1:5179/');
  });

  it('scrolls the chat viewport to the latest message after message changes', () => {
    const calls: unknown[] = [];
    const messagesViewport = {
      scrollHeight: 1842,
      scrollTop: 0,
      scrollTo(options: unknown) { calls.push(options); }
    };

    scrollMessagesToLatest(messagesViewport);

    expect(messagesViewport.scrollTop).toBe(1842);
    expect(calls).toEqual([{ top: 1842, behavior: 'auto' }]);
  });
});

describe('mobile-responsive Agora layout CSS', () => {
  const css = readFileSync(join(process.cwd(), 'src/client/styles.css'), 'utf8');

  it('keeps navigation and group management accessible on mobile instead of hiding them', () => {
    expect(css).toContain('.mobile-admin-toggle');
    expect(css).toContain('.group-admin.collapsed');
    expect(css).not.toContain('@media (max-width: 760px) { .shell { grid-template-columns: 1fr; } .sidebar { display: none; }');
    expect(css).not.toContain('.group-admin { display: none; }');
  });

  it('defines mobile breakpoints for composer and side panels', () => {
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('.composer { grid-template-columns: minmax(72px, 82px) minmax(0, 1fr) 44px;');
    expect(css).toContain('.sidebar { flex-direction: row; align-items: center; overflow-x: auto; position: sticky; top: 0; z-index: 20;');
  });

  it('keeps the chat composer pinned to the viewport bottom and scrolls only messages', () => {
    expect(css).toContain('html, body, #root { min-height: 100%; height: 100%; }');
    expect(css).toContain('body { margin: 0; min-height: 100vh; height: 100vh; overflow: hidden;');
    expect(css).toContain('.shell { height: 100vh; max-height: 100vh; overflow: hidden;');
    expect(css).toContain('.chat, .monitor, .projects-screen { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; overflow: hidden;');
    expect(css).toContain('.chat { grid-template-rows: auto minmax(0, 1fr) auto;');
    expect(css).toContain('.messages { min-height: 0;');
    expect(css).toContain('.composer { position: sticky; bottom: 0;');
    expect(css).toContain('.shell { height: 100dvh; max-height: 100dvh;');
  });

  it('uses sober mobile operational patterns: horizontal channel rail, log cards and compact send control', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(css).toContain('.sidebar { flex-direction: row; align-items: center; overflow-x: auto;');
    expect(css).toContain('.sidebar > .channel, .group-list { display: none; }');
    expect(css).toContain('.message { width: 100%; max-width: 100%;');
    expect(css).toContain('.message.human { border-left-color: var(--ok); background: var(--panel);');
    expect(css).toContain('.message.agent { border-left-color: var(--accent);');
    expect(css).toContain('.composer { grid-template-columns: minmax(72px, 82px) minmax(0, 1fr) 44px;');
    expect(appSource).toContain('<span className="send-icon" aria-hidden="true">↵</span>');
  });

  it('keeps the active mobile channel visible inside the horizontal rail', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(appSource).toContain("document.querySelector('.sidebar .channel.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });");
    expect(appSource).toContain('}, [activeView, activeGroupId]);');
  });

  it('uses a compact mobile channel selector instead of overflowing navigation buttons', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(appSource).toContain('className="mobile-channel-select"');
    expect(appSource).toContain("value={`group:${group.id}`}");
    expect(css).toContain('.mobile-channel-select { display: none; }');
    expect(css).toContain('.sidebar > .channel, .group-list { display: none; }');
    expect(css).toContain('.mobile-channel-select { display: grid; flex: 1 1 auto;');
    expect(css).not.toContain('.group-list { display: contents; }');
  });

  it('allows local mobile QA to point the Vite proxy at a non-default API port', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('process.env.VITE_DEV_API_PROXY_TARGET');
    expect(viteConfig).toContain("const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';");
  });

  it('wires the messages list to auto-scroll when the active chat receives or loads messages', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(appSource).toContain('const messagesRef = useRef<HTMLOListElement | null>(null);');
    expect(appSource).toContain('useLayoutEffect(() => {');
    expect(appSource).toContain('scrollMessagesToLatest(messagesRef.current);');
    expect(appSource).toContain('}, [activeMessages.length, activeGroupId, activeView]);');
    expect(appSource).toContain('<ol ref={messagesRef} className="messages">');
  });

  it('keeps the group admin panel out of document flow on tablet and mobile widths', () => {
    expect(css).toContain('.group-admin { position: fixed; right: 0; top: 0; bottom: 0; z-index: 30;');
    expect(css).toContain('.group-admin.collapsed { display: none; }');
    expect(css).toContain('.group-admin { position: fixed; left: 0; right: 0; top: auto; bottom: 0;');
  });

  it('uses progressive disclosure for project UX instead of showing all project forms beside the kanban', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(appSource).toContain("type ProjectPanel = 'board' | 'access' | 'settings'");
    expect(appSource).toContain('project-tabs');
    expect(appSource).toContain('project-workspace');
    expect(appSource).toContain('Resumen de acceso');
    expect(css).toContain('.project-tabs');
    expect(css).toContain('.projects-screen { display: grid; grid-template-rows: auto auto auto minmax(0, 1fr);');
  });

  it('opens Trello-style task cards in a Markdown editor modal instead of exposing descriptions on the board', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(appSource).toContain('TaskDetailModal');
    expect(appSource).toContain('selectedTaskId');
    expect(appSource).toContain('role="dialog"');
    expect(appSource).toContain('markdown-editor');
    expect(appSource).toContain('Guardar especificación');
    expect(appSource).toContain('onUpdateTask');
    expect(appSource).not.toContain('{task.description && <p>{task.description}</p>}');
    expect(css).toContain('.task-modal-backdrop');
    expect(css).toContain('.task-card { width: 100%; text-align: left;');
  });

  it('shows an explicit logout action in the signed-in identity panel', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(appSource).toContain('handleLogout');
    expect(appSource).toContain('logoutKeycloak(authConfig');
    expect(appSource).toContain('aria-label="Cerrar sesión"');
    expect(appSource).toContain('Cerrar sesión');
    expect(css).toContain('.logout-button');
  });
});
