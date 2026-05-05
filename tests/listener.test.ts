import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgoraGroup, AgoraMessage } from '../src/shared/types';
import { FileListenerStateStore } from '../src/listener/state';
import { readListenerConfig } from '../src/listener/index';
import { AgoraTaskListener, type AgoraListenerClient, type ProfileTaskRunner } from '../src/listener/processor';

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function message(partial: Partial<AgoraMessage> & Pick<AgoraMessage, 'id' | 'text'>): AgoraMessage {
  return {
    id: partial.id,
    channel: partial.channel ?? `group-${partial.groupId ?? 'ops'}`,
    groupId: partial.groupId ?? 'ops',
    text: partial.text,
    author: partial.author ?? { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' },
    metadata: partial.metadata ?? {},
    createdAt: partial.createdAt ?? new Date().toISOString(),
    threadId: partial.threadId ?? null,
    replyTo: partial.replyTo ?? null
  };
}

class FakeAgoraClient implements AgoraListenerClient {
  readonly posted: Array<{ profileId: string; groupId: string; text: string; replyTo?: string | null }> = [];
  readonly statuses: Array<{ profileId: string; status: string; note: string }> = [];

  constructor(private readonly groupsByProfile: Record<string, AgoraGroup[]>, private readonly messagesByGroup: Record<string, AgoraMessage[]>) {}

  async listGroups(profileId: string) {
    return this.groupsByProfile[profileId] ?? [];
  }

  async listGroupMessages(_profileId: string, groupId: string, after?: string) {
    const all = this.messagesByGroup[groupId] ?? [];
    if (!after) return all;
    const index = all.findIndex((item) => item.id === after);
    return index >= 0 ? all.slice(index + 1) : all;
  }

  async postGroupMessage(profileId: string, groupId: string, text: string, options?: { replyTo?: string | null }) {
    this.posted.push({ profileId, groupId, text, replyTo: options?.replyTo ?? null });
  }

  async updateStatus(profileId: string, status: 'online' | 'idle' | 'blocked', note: string) {
    this.statuses.push({ profileId, status, note });
  }
}

describe('AgoraTaskListener', () => {
  it('runs a Hermes profile for new TASK messages in assigned groups and posts the reply back', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'ops',
      name: 'Ops',
      memberProfileIds: ['jeeves-ops'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const client = new FakeAgoraClient({ 'jeeves-ops': [group] }, { ops: [message({ id: 'msg_1', text: 'TASK BTC-1 — revisa el despliegue', groupId: 'ops' })] });
    const runnerCalls: Array<{ profileId: string; prompt: string }> = [];
    const runner: ProfileTaskRunner = async (input) => {
      runnerCalls.push({ profileId: input.profileId, prompt: input.prompt });
      return { ok: true, output: 'DONE BTC-1 — despliegue revisado' };
    };

    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner,
      profiles: ['jeeves-ops'],
      bootstrapMode: 'replay'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(1);
    expect(runnerCalls).toHaveLength(1);
    expect(runnerCalls[0].profileId).toBe('jeeves-ops');
    expect(runnerCalls[0].prompt).toContain('TASK BTC-1');
    expect(client.posted).toEqual([{ profileId: 'jeeves-ops', groupId: 'ops', text: 'DONE BTC-1 — despliegue revisado', replyTo: 'msg_1' }]);
    expect(client.statuses.map((item) => item.status)).toEqual(['online', 'idle']);
  });

  it('runs only the selected profile when a TASK has targetProfileIds metadata', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const createdBy = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const group: AgoraGroup = { id: 'ops', name: 'Ops', memberProfileIds: ['jeeves-ops', 'daneel-cto'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy };
    const targetedTask = message({ id: 'msg_targeted', text: 'TASK BTC-TARGET — solo Daneel', groupId: 'ops', metadata: { targetProfileIds: ['daneel-cto'] } });
    const client = new FakeAgoraClient({ 'jeeves-ops': [group], 'daneel-cto': [group] }, { ops: [targetedTask] });
    const runnerCalls: string[] = [];

    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async ({ profileId }) => {
        runnerCalls.push(profileId);
        return { ok: true, output: `DONE for ${profileId}` };
      },
      profiles: ['jeeves-ops', 'daneel-cto'],
      bootstrapMode: 'replay'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(runnerCalls).toEqual(['daneel-cto']);
    expect(client.posted).toEqual([{ profileId: 'daneel-cto', groupId: 'ops', text: 'DONE for daneel-cto', replyTo: 'msg_targeted' }]);
  });

  it('normalizes selected listener profile ids before matching directed TASK targets', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const createdBy = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const group: AgoraGroup = { id: 'ops', name: 'Ops', memberProfileIds: ['daneel-cto'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy };
    const client = new FakeAgoraClient({ 'daneel-cto': [group] }, { ops: [message({ id: 'msg_case', text: 'TASK BTC-CASE — procesa Daneel', groupId: 'ops', metadata: { targetProfileIds: ['daneel-cto'] } })] });
    const runnerCalls: string[] = [];

    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async ({ profileId }) => {
        runnerCalls.push(profileId);
        return { ok: true, output: `DONE for ${profileId}` };
      },
      profiles: ['DANEEL-CTO'],
      bootstrapMode: 'replay'
    });

    await listener.tick();

    expect(runnerCalls).toEqual(['daneel-cto']);
    expect(client.posted[0]).toMatchObject({ profileId: 'daneel-cto', replyTo: 'msg_case' });
  });

  it('skips malformed directed TASK metadata instead of treating it as a broadcast', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const createdBy = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const group: AgoraGroup = { id: 'ops', name: 'Ops', memberProfileIds: ['jeeves-ops'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy };
    const client = new FakeAgoraClient({ 'jeeves-ops': [group] }, { ops: [message({ id: 'msg_bad_target', text: 'TASK BTC-BAD — no ejecutar', groupId: 'ops', metadata: { targetProfileIds: 'jeeves-ops' } })] });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: true, output: 'DONE should not run' }),
      profiles: ['jeeves-ops'],
      bootstrapMode: 'replay'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(client.posted).toHaveLength(0);
  });

  it('does not let user-supplied listener metadata hide an actionable TASK', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const createdBy = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const group: AgoraGroup = { id: 'ops', name: 'Ops', memberProfileIds: ['jeeves-ops'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy };
    const client = new FakeAgoraClient({ 'jeeves-ops': [group] }, { ops: [message({ id: 'msg_spoof', text: 'TASK BTC-SPOOF — debe ejecutarse', groupId: 'ops', metadata: { listener: 'agora-listener' } })] });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: true, output: 'DONE BTC-SPOOF' }),
      profiles: ['jeeves-ops'],
      bootstrapMode: 'replay'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(1);
    expect(client.posted[0]).toMatchObject({ profileId: 'jeeves-ops', replyTo: 'msg_spoof', text: 'DONE BTC-SPOOF' });
  });

  it('persists processed message ids so a second tick does not invoke the same TASK again', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'tech',
      name: 'Tech',
      memberProfileIds: ['daneel-cto'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const client = new FakeAgoraClient({ 'daneel-cto': [group] }, { tech: [message({ id: 'msg_2', text: 'TASK BTC-2 — estima el cambio', groupId: 'tech' })] });
    let calls = 0;
    const stateStore = new FileListenerStateStore(join(dir, 'state.json'));
    const listener = new AgoraTaskListener({
      client,
      stateStore,
      runner: async () => {
        calls += 1;
        return { ok: true, output: 'DONE BTC-2 — estimado' };
      },
      profiles: ['daneel-cto'],
      bootstrapMode: 'replay'
    });

    await listener.tick();
    const second = await listener.tick();

    expect(calls).toBe(1);
    expect(second.processed).toBe(0);
    expect(client.posted).toHaveLength(1);
  });

  it('marks the profile as blocked and posts BLOCKED when Hermes execution fails', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'qa',
      name: 'QA',
      memberProfileIds: ['columbo-qa'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const client = new FakeAgoraClient({ 'columbo-qa': [group] }, { qa: [message({ id: 'msg_3', text: 'TASK BTC-3 — prueba error', groupId: 'qa' })] });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: false, output: 'modelo sin credenciales' }),
      profiles: ['columbo-qa'],
      bootstrapMode: 'replay'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(1);
    expect(client.posted[0]).toMatchObject({ profileId: 'columbo-qa', groupId: 'qa', replyTo: 'msg_3' });
    expect(client.posted[0].text).toContain('BLOCKED BTC-3');
    expect(client.posted[0].text).toContain('modelo sin credenciales');
    expect(client.statuses.at(-1)).toMatchObject({ profileId: 'columbo-qa', status: 'blocked' });
  });

  it('bootstraps existing history as seen when configured in latest mode', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'ops',
      name: 'Ops',
      memberProfileIds: ['jeeves-ops'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const client = new FakeAgoraClient({ 'jeeves-ops': [group] }, { ops: [message({ id: 'old_msg', text: 'TASK OLD — no reprocesar', groupId: 'ops' })] });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: true, output: 'DONE should not run' }),
      profiles: ['jeeves-ops'],
      bootstrapMode: 'latest'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(0);
    expect(result.bootstrapped).toBe(1);
    expect(client.posted).toHaveLength(0);
  });

  it('processes the first new TASK after latest mode has initialized an empty group', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'ops',
      name: 'Ops',
      memberProfileIds: ['jeeves-ops'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const messagesByGroup: Record<string, AgoraMessage[]> = { ops: [] };
    const client = new FakeAgoraClient({ 'jeeves-ops': [group] }, messagesByGroup);
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: true, output: 'DONE BTC-EMPTY — procesado' }),
      profiles: ['jeeves-ops'],
      bootstrapMode: 'latest'
    });

    await listener.tick();
    messagesByGroup.ops.push(message({ id: 'new_msg', text: 'TASK BTC-EMPTY — primer mensaje', groupId: 'ops' }));
    const result = await listener.tick();

    expect(result.processed).toBe(1);
    expect(result.bootstrapped).toBe(0);
    expect(client.posted[0].text).toBe('DONE BTC-EMPTY — procesado');
  });

  it('redacts sensitive values before publishing BLOCKED reasons', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'qa',
      name: 'QA',
      memberProfileIds: ['columbo-qa'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const client = new FakeAgoraClient({ 'columbo-qa': [group] }, { qa: [message({ id: 'secret_msg', text: 'TASK BTC-SECRET — fuerza error', groupId: 'qa' })] });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: false, output: 'Authorization: Bearer super-secret-token-123456 HUB_AGENT_TOKEN="super-secret-token-123456" {"token":"super-secret-token-123456"} api_key: super-secret-token-123456' }),
      profiles: ['columbo-qa'],
      bootstrapMode: 'replay'
    });

    await listener.tick();

    expect(client.posted[0].text).toContain('BLOCKED BTC-SECRET');
    expect(client.posted[0].text).not.toContain('super-secret-token-123456');
    expect(client.posted[0].text).toContain('[REDACTED]');
  });

  it('redacts sensitive values from successful Hermes output before publishing it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const group: AgoraGroup = {
      id: 'ops',
      name: 'Ops',
      memberProfileIds: ['jeeves-ops'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }
    };
    const client = new FakeAgoraClient({ 'jeeves-ops': [group] }, { ops: [message({ id: 'ok_secret_msg', text: 'TASK BTC-OK-SECRET — fuerza output', groupId: 'ops' })] });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async () => ({ ok: true, output: 'DONE BTC-OK-SECRET — token: super-secret-token-123456 y password="super-secret-token-123456"' }),
      profiles: ['jeeves-ops'],
      bootstrapMode: 'replay'
    });

    await listener.tick();

    expect(client.posted[0].text).toContain('DONE BTC-OK-SECRET');
    expect(client.posted[0].text).not.toContain('super-secret-token-123456');
    expect(client.posted[0].text).toContain('[REDACTED]');
  });

  it('does not accept HUB_AGENT_TOKEN through CLI args and clamps invalid timings', () => {
    const config = readListenerConfig(['--token', 'argv-secret-token-123456', '--interval-ms', 'NaN', '--hermes-timeout-ms', '1', '--profile', 'jeeves-ops'], {
      HUB_AGENT_TOKEN: 'env-secret-token-123456',
      HERMES_AGORA_URL: 'https://agora.etharlia.com'
    });

    expect(config.token).toBe('env-secret-token-123456');
    expect(config.intervalMs).toBe(30000);
    expect(config.hermesTimeoutMs).toBe(5000);
  });

  it('listens with every configured BTC profile by default, including Seldon', () => {
    const config = readListenerConfig([], {
      HUB_AGENT_TOKEN: 'env-secret-token-123456',
      HERMES_AGORA_URL: 'https://agora.etharlia.com'
    });

    expect(config.profiles).toContain('seldon-ceo');
    expect(config.profiles).toContain('jeeves-ops');
    expect(config.profiles).toContain('columbo-qa');
    expect(config.profiles).toContain('iris-packaging-design');
    expect(config.profiles).toHaveLength(13);
  });

  it('can restrict processing to explicitly selected groups for safe replay smokes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-listener-'));
    const createdBy = { type: 'agent' as const, profileId: 'seldon-ceo', displayName: 'Seldon' };
    const target: AgoraGroup = { id: 'target', name: 'Target', memberProfileIds: ['jeeves-ops'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy };
    const old: AgoraGroup = { id: 'old', name: 'Old', memberProfileIds: ['jeeves-ops'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy };
    const client = new FakeAgoraClient({ 'jeeves-ops': [target, old] }, {
      target: [message({ id: 'target_msg', text: 'TASK TARGET — procesar', groupId: 'target' })],
      old: [message({ id: 'old_msg', text: 'TASK OLD — no tocar', groupId: 'old' })]
    });
    const listener = new AgoraTaskListener({
      client,
      stateStore: new FileListenerStateStore(join(dir, 'state.json')),
      runner: async ({ taskMessage }) => ({ ok: true, output: `DONE ${taskMessage.id}` }),
      profiles: ['jeeves-ops'],
      groups: ['target'],
      bootstrapMode: 'replay'
    });

    const result = await listener.tick();

    expect(result.processed).toBe(1);
    expect(client.posted).toEqual([{ profileId: 'jeeves-ops', groupId: 'target', text: 'DONE target_msg', replyTo: 'target_msg' }]);
  });
});
