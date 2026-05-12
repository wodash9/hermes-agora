import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AgentScope, Identity } from '../shared/types.js';
import type { ServerConfig } from './config.js';

export interface AuthenticatedRequest extends Request {
  identity?: Identity;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hasRequiredAudience(payload: JWTPayload, clientId: string): boolean {
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : aud ? [aud] : [];
  return audiences.includes(clientId) || payload.azp === clientId;
}

function hasRole(payload: JWTPayload, clientId: string, role: string): boolean {
  if (!role) return true;
  const realmRoles = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
  const clientRoles = (payload.resource_access as Record<string, { roles?: string[] }> | undefined)?.[clientId]?.roles ?? [];
  return realmRoles.includes(role) || clientRoles.includes(role);
}

async function verifyKeycloakToken(token: string, config: ServerConfig): Promise<Identity> {
  jwks ??= createRemoteJWKSet(new URL(`${config.keycloakIssuer}/protocol/openid-connect/certs`));
  const { payload } = await jwtVerify(token, jwks, { issuer: config.keycloakIssuer });
  if (!hasRequiredAudience(payload, config.keycloakClientId)) throw new Error('Invalid token audience');
  if (!hasRole(payload, config.keycloakClientId, config.keycloakRequiredRole)) throw new Error('Missing required role');
  const profileId = String(payload.preferred_username ?? payload.email ?? payload.sub ?? 'human');
  return {
    type: 'human',
    profileId,
    displayName: String(payload.name ?? payload.preferred_username ?? 'Keycloak user'),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    scopes: ['messages:read', 'messages:write', 'projects:read', 'projects:write'],
    channels: ['general']
  };
}

function authenticateAgentToken(token: string, profileIdRaw: string | undefined, config: ServerConfig): Identity | null {
  if (!safeEquals(token, config.hubAgentToken)) return null;
  const profileId = profileIdRaw?.trim().toLowerCase();
  if (!profileId) throw Object.assign(new Error('Missing X-Hermes-Profile'), { statusCode: 400 });
  const profile = config.agentProfiles[profileId];
  if (!profile) throw Object.assign(new Error('Unknown Hermes profile'), { statusCode: 403 });
  return { type: 'agent', profileId, displayName: profile.displayName, scopes: profile.scopes, channels: profile.channels };
}

export async function authenticateToken(config: ServerConfig, token: string | undefined | null, profileId?: string): Promise<Identity> {
  if (!token) throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });
  const agent = authenticateAgentToken(token, profileId, config);
  if (agent) return agent;
  return verifyKeycloakToken(token, config);
}

export function canAccessChannel(identity: Identity, channel: string): boolean {
  return identity.scopes.includes('admin') || identity.channels.includes(channel);
}

export function requireIdentity(config: ServerConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      req.identity = await authenticateToken(config, bearerToken(req), req.header('x-hermes-profile') ?? undefined);
      return next();
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 401;
      return res.status(statusCode).json({ error: (error as Error).message });
    }
  };
}

export function requireScope(scope: AgentScope) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.identity) return res.status(401).json({ error: 'Unauthenticated' });
    if (!req.identity.scopes.includes(scope) && !req.identity.scopes.includes('admin')) {
      return res.status(403).json({ error: `Missing scope ${scope}` });
    }
    return next();
  };
}
