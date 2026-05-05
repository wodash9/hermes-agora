import Keycloak from 'keycloak-js';

export type AuthMode = 'mock' | 'keycloak';

export interface ClientAuthConfig {
  mode: AuthMode;
  url?: string;
  realm?: string;
  clientId?: string;
}

export function isMockAllowed(hostname = window.location.hostname): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function createClientAuthConfig(env: Record<string, string | undefined>): ClientAuthConfig {
  const mode = (env.VITE_AUTH_MODE ?? 'keycloak') as AuthMode;
  if (mode === 'mock') return { mode };
  const url = env.VITE_KEYCLOAK_URL;
  const realm = env.VITE_KEYCLOAK_REALM;
  const clientId = env.VITE_KEYCLOAK_CLIENT_ID;
  if (!url || !realm || !clientId) throw new Error('Missing Keycloak configuration');
  return { mode, url, realm, clientId };
}

let keycloak: Keycloak | null = null;
let initPromise: Promise<Keycloak> | null = null;

export async function initKeycloak(config: ClientAuthConfig): Promise<Keycloak | null> {
  if (config.mode === 'mock') return null;
  if (!config.url || !config.realm || !config.clientId) throw new Error('Invalid Keycloak configuration');
  if (initPromise) return initPromise;
  keycloak = new Keycloak({ url: config.url, realm: config.realm, clientId: config.clientId });
  initPromise = keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false }).then(() => keycloak!);
  return initPromise;
}

export function resetKeycloakForRetry(): void {
  keycloak = null;
  initPromise = null;
}
