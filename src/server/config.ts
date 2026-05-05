import type { AgentProfileConfig } from '../shared/types.js';

export interface ServerConfig {
  nodeEnv: string;
  port: number;
  publicAppUrl: string;
  dataFile: string;
  corsOrigins: string[];
  hubAgentToken: string;
  keycloakIssuer: string;
  keycloakClientId: string;
  keycloakRequiredRole: string;
  agentProfiles: Record<string, AgentProfileConfig>;
}

const defaultProfiles: Record<string, AgentProfileConfig> = {
  'seldon-ceo': { displayName: 'Seldon', scopes: ['messages:read', 'messages:write', 'admin'], channels: ['general', 'strategy', 'qa'] },
  'jeeves-ops': { displayName: 'Jeeves', scopes: ['messages:read', 'messages:write'], channels: ['general', 'ops'] },
  'daneel-tech': { displayName: 'Daneel', scopes: ['messages:read', 'messages:write'], channels: ['general', 'tech'] },
  'valentine-product': { displayName: 'Valentine', scopes: ['messages:read', 'messages:write'], channels: ['general', 'product'] },
  'lyra-research': { displayName: 'Lyra', scopes: ['messages:read', 'messages:write'], channels: ['general', 'research'] },
  'kvothe-marketing': { displayName: 'Kvothe', scopes: ['messages:read', 'messages:write'], channels: ['general', 'marketing'] },
  'locke-sales': { displayName: 'Locke', scopes: ['messages:read', 'messages:write'], channels: ['general', 'sales'] },
  'columbo-qa': { displayName: 'Columbo', scopes: ['messages:read', 'messages:write'], channels: ['general', 'qa'] },
  'lipwig-finance': { displayName: 'Lipwig', scopes: ['messages:read', 'messages:write'], channels: ['general', 'finance'] },
  'cordelia-cs': { displayName: 'Cordelia', scopes: ['messages:read', 'messages:write'], channels: ['general', 'customer-success'] },
  'portia-legal': { displayName: 'Portia', scopes: ['messages:read', 'messages:write'], channels: ['general', 'legal'] },
  'atticus-suplan-legal': { displayName: 'Atticus', scopes: ['messages:read', 'messages:write'], channels: ['general', 'suplan', 'legal'] },
  'iris-packaging-design': { displayName: 'Iris', scopes: ['messages:read', 'messages:write'], channels: ['general', 'suplan', 'design'] }
};

function parseProfiles(value: string | undefined): Record<string, AgentProfileConfig> {
  if (!value) return defaultProfiles;
  const parsed = JSON.parse(value) as Record<string, AgentProfileConfig>;
  for (const [profileId, profile] of Object.entries(parsed)) {
    if (!profileId.match(/^[a-z0-9][a-z0-9-]{1,63}$/)) throw new Error(`Invalid profile id: ${profileId}`);
    if (!profile.displayName || !Array.isArray(profile.scopes) || !Array.isArray(profile.channels)) {
      throw new Error(`Invalid profile config for ${profileId}`);
    }
  }
  return parsed;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const hubAgentToken = env.HUB_AGENT_TOKEN ?? 'change-me-dev-token';
  if (nodeEnv === 'production' && (!env.HUB_AGENT_TOKEN || hubAgentToken === 'change-me-dev-token' || hubAgentToken.length < 24)) {
    throw new Error('HUB_AGENT_TOKEN must be a strong secret in production');
  }

  const publicAppUrl = env.PUBLIC_APP_URL ?? 'http://localhost:3000';
  const corsOrigins = (env.CORS_ORIGIN ?? publicAppUrl)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    port: Number(env.PORT ?? 3000),
    publicAppUrl,
    dataFile: env.DATA_FILE ?? './data/hermes-agora.json',
    corsOrigins,
    hubAgentToken,
    keycloakIssuer: (env.KEYCLOAK_ISSUER ?? 'https://auth.etharlia.com/realms/etharlia').replace(/\/$/, ''),
    keycloakClientId: env.KEYCLOAK_CLIENT_ID ?? 'hermes-agora',
    keycloakRequiredRole: env.KEYCLOAK_REQUIRED_ROLE ?? 'agora-user',
    agentProfiles: parseProfiles(env.HERMES_AGORA_PROFILES_JSON)
  };
}
