const SENSITIVE_KEY = '(?:[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*|token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)';
const KEY_VALUE = new RegExp(`((?:["']?${SENSITIVE_KEY}["']?)\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,}]+)`, 'gi');
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

export function redactSensitive(input: string): string {
  return input
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(KEY_VALUE, '$1[REDACTED]')
    .replace(JWT_LIKE, '[REDACTED]');
}
