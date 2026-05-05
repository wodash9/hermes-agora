import { spawn } from 'node:child_process';
import type { ProfileTaskRunner, ProfileTaskRunnerResult } from './processor.js';

export interface HermesCliRunnerOptions {
  hermesBin?: string;
  timeoutMs?: number;
  extraArgs?: string[];
}

export function createHermesCliRunner(options: HermesCliRunnerOptions = {}): ProfileTaskRunner {
  const hermesBin = options.hermesBin ?? 'hermes';
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 180000, 5000), 900000);
  const extraArgs = options.extraArgs ?? [];

  return async ({ profileId, prompt }): Promise<ProfileTaskRunnerResult> => {
    const args = ['--profile', profileId, 'chat', '-Q', '-q', prompt, ...extraArgs];
    return runProcess(hermesBin, args, timeoutMs);
  };
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<ProfileTaskRunnerResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HERMES_AGORA_LISTENER_CHILD: '1' }
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({ ok: false, output: `Hermes timeout after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 20000) stdout = stdout.slice(-20000);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: error.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = stripCliNoise(stdout).trim() || stripCliNoise(stderr).trim();
      resolve({ ok: code === 0, output: output || `Hermes exited with code ${code ?? 'unknown'}` });
    });
  });
}

function stripCliNoise(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.includes('Welcome to Hermes') && !line.match(/^\s*$/))
    .join('\n')
    .trim();
}
