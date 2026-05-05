import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_OPTIONS, applyComposerAction, toggleMemberSelection } from '../src/client/uiState';
import { buildAuthHeaders, buildSocketAuth } from '../src/client/api';

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

  it('adds mock profile identity to REST and socket auth only for the local mock token', () => {
    expect(buildAuthHeaders('change-me-dev-token')).toMatchObject({ Authorization: 'Bearer change-me-dev-token', 'X-Hermes-Profile': 'seldon-ceo' });
    expect(buildSocketAuth('change-me-dev-token')).toEqual({ token: 'change-me-dev-token', profileId: 'seldon-ceo' });
    expect(buildAuthHeaders('real-keycloak-token')).toEqual({ Authorization: 'Bearer real-keycloak-token' });
    expect(buildSocketAuth('real-keycloak-token')).toEqual({ token: 'real-keycloak-token' });
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
    expect(css).toContain('.composer { grid-template-columns: 1fr;');
    expect(css).toContain('.sidebar { position: sticky; top: 0; z-index: 20;');
  });
});
