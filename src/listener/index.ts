import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadServerConfig } from '../server/config.js';
import { HttpAgoraClient } from './client.js';
import { AgoraTaskListener, type BootstrapMode } from './processor.js';
import { createHermesCliRunner } from './hermesRunner.js';
import { FileListenerStateStore } from './state.js';

interface ListenerCliConfig {
  once: boolean;
  intervalMs: number;
  profiles: string[];
  stateFile: string;
  bootstrapMode: BootstrapMode;
  apiUrl: string;
  token: string;
  hermesBin: string;
  hermesTimeoutMs: number;
}

async function main() {
  const config = readListenerConfig(process.argv.slice(2), process.env);
  const listener = new AgoraTaskListener({
    client: new HttpAgoraClient({ baseUrl: config.apiUrl, agentToken: config.token }),
    stateStore: new FileListenerStateStore(config.stateFile),
    runner: createHermesCliRunner({ hermesBin: config.hermesBin, timeoutMs: config.hermesTimeoutMs }),
    profiles: config.profiles,
    bootstrapMode: config.bootstrapMode
  });

  console.log(`agora-listener starting profiles=${config.profiles.join(',')} mode=${config.once ? 'once' : 'daemon'} bootstrap=${config.bootstrapMode}`);
  do {
    const tick = await listener.tick();
    console.log(`agora-listener tick processed=${tick.processed} skipped=${tick.skipped} bootstrapped=${tick.bootstrapped} errors=${tick.errors.length}`);
    for (const error of tick.errors) console.warn(`agora-listener error profile=${error.profileId} group=${error.groupId ?? '-'} ${error.error}`);
    if (config.once) break;
    await sleep(config.intervalMs);
  } while (true);
}

export function readListenerConfig(args: string[], env: NodeJS.ProcessEnv): ListenerCliConfig {
  const serverConfig = loadServerConfig({ ...env, NODE_ENV: env.NODE_ENV ?? 'development' });
  const arg = readArgs(args);
  const rawProfiles = arg.profile ?? env.HERMES_AGORA_LISTENER_PROFILES ?? env.HERMES_AGORA_LISTENER_PROFILE;
  const profiles = rawProfiles
    ? rawProfiles.split(',').map((profile) => profile.trim()).filter(Boolean)
    : Object.keys(serverConfig.agentProfiles).filter((profileId) => !serverConfig.agentProfiles[profileId].scopes.includes('admin'));

  const bootstrapModeRaw = (arg.bootstrap ?? env.HERMES_AGORA_LISTENER_BOOTSTRAP ?? 'latest').toLowerCase();
  if (bootstrapModeRaw !== 'latest' && bootstrapModeRaw !== 'replay') throw new Error('HERMES_AGORA_LISTENER_BOOTSTRAP must be latest or replay');

  return {
    once: arg.once === 'true' || env.HERMES_AGORA_LISTENER_ONCE === 'true',
    intervalMs: clampNumber(arg.intervalMs ?? env.HERMES_AGORA_LISTENER_INTERVAL_MS, 30000, 1000, 300000),
    profiles,
    stateFile: arg.stateFile ?? env.HERMES_AGORA_LISTENER_STATE_FILE ?? join(process.cwd(), 'data', 'agora-listener-state.json'),
    bootstrapMode: bootstrapModeRaw,
    apiUrl: arg.apiUrl ?? env.HERMES_AGORA_URL ?? serverConfig.publicAppUrl,
    token: env.HUB_AGENT_TOKEN ?? serverConfig.hubAgentToken,
    hermesBin: arg.hermesBin ?? env.HERMES_BIN ?? 'hermes',
    hermesTimeoutMs: clampNumber(arg.hermesTimeoutMs ?? env.HERMES_AGORA_LISTENER_HERMES_TIMEOUT_MS, 180000, 5000, 900000)
  };
}

function readArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--once') {
      parsed.once = 'true';
      continue;
    }
    if (!current.startsWith('--')) continue;
    const key = current.slice(2).replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = 'true';
    }
  }
  return parsed;
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`agora-listener fatal: ${(error as Error).message}`);
    process.exit(1);
  });
}
