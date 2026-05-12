import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/server/config';

describe('server config', () => {
  it('rejects production without a real agent token', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'production', HUB_AGENT_TOKEN: 'change-me-dev-token' })).toThrow(/HUB_AGENT_TOKEN/);
  });

  it('loads default BTC agent profiles', () => {
    const config = loadServerConfig({ HUB_AGENT_TOKEN: 'dev-secret' });
    expect(config.agentProfiles['seldon-ceo'].displayName).toBe('Seldon');
    expect(config.agentProfiles['daneel-cto'].displayName).toBe('Daneel');
    expect(config.agentProfiles['cordelia-success'].displayName).toBe('Cordelia');
    expect(config.agentProfiles['columbo-qa'].scopes).toContain('messages:write');
  });

  it('uses SQLite storage and derives an import path from legacy JSON DATA_FILE', () => {
    const config = loadServerConfig({ HUB_AGENT_TOKEN: 'dev-secret', DATA_FILE: '/data/hermes-agora.json' });
    expect(config.dataFile).toBe('/data/hermes-agora.sqlite');
    expect(config.legacyJsonDataFile).toBe('/data/hermes-agora.json');
  });
});
