import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonMessageStore } from '../src/server/store';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('JsonMessageStore', () => {
  it('persists posted messages and returns newest history last', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agora-'));
    const file = join(dir, 'store.json');
    const store = await JsonMessageStore.open(file);
    const msg = await store.createMessage({ channel: 'general', text: 'hola', author: { type: 'agent', profileId: 'seldon-ceo', displayName: 'Seldon' }, metadata: { task: 'demo' } });
    const reopened = await JsonMessageStore.open(file);
    const history = await reopened.listMessages({ channel: 'general', limit: 10 });
    expect(history.messages).toHaveLength(1);
    expect(history.messages[0].id).toBe(msg.id);
    expect(history.messages[0].text).toBe('hola');
  });
});
