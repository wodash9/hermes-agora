import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_OPTIONS, DIRECTED_TARGET_ALL, applyComposerAction, buildRecipientOptions, buildTargetMetadata, toggleMemberSelection } from '../src/client/uiState';
import { buildAuthHeaders, buildSocketAuth, postGroupMessage } from '../src/client/api';
import { scrollMessagesToLatest } from '../src/client/scroll';

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

  it('adds mock profile identity to REST and socket auth only for the local mock token', () => {
    expect(buildAuthHeaders('change-me-dev-token')).toMatchObject({ Authorization: 'Bearer change-me-dev-token', 'X-Hermes-Profile': 'seldon-ceo' });
    expect(buildSocketAuth('change-me-dev-token')).toEqual({ token: 'change-me-dev-token', profileId: 'seldon-ceo' });
    expect(buildAuthHeaders('real-keycloak-token')).toEqual({ Authorization: 'Bearer real-keycloak-token' });
    expect(buildSocketAuth('real-keycloak-token')).toEqual({ token: 'real-keycloak-token' });
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
    expect(css).toContain('.chat, .monitor { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; overflow: hidden;');
    expect(css).toContain('.messages { min-height: 0;');
    expect(css).toContain('.composer { position: sticky; bottom: 0;');
    expect(css).toContain('.shell { height: 100dvh; max-height: 100dvh;');
  });

  it('uses mobile chat-app patterns: horizontal channel rail, bubbles and compact send control', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/client/App.tsx'), 'utf8');
    expect(css).toContain('.sidebar { flex-direction: row; align-items: center; overflow-x: auto;');
    expect(css).toContain('.sidebar > .channel, .group-list { display: none; }');
    expect(css).toContain('.message.human { align-self: flex-end;');
    expect(css).toContain('.message.agent { align-self: flex-start;');
    expect(css).toContain('.composer { grid-template-columns: minmax(72px, 82px) minmax(0, 1fr) 44px;');
    expect(appSource).toContain('<span className="send-icon" aria-hidden="true">➤</span>');
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
    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('.group-admin { position: fixed; right: 0; top: 0; bottom: 0;');
    expect(css).toContain('.group-admin.collapsed { display: none; }');
    expect(css).toContain('.mobile-admin-toggle { display: block; }');
  });
});
