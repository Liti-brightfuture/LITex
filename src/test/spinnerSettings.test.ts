import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { bytesToVerbs, readSettings, writeSpinnerVerbs, SpinnerVerbsManager } from '../spinnerVerbs';

/** Minimal in-memory vscode.Memento stand-in for manager tests. */
function fakeMemento() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, dflt?: T): T => (store.has(key) ? (store.get(key) as T) : (dflt as T)),
    update: async (key: string, value: unknown): Promise<void> => {
      if (value === undefined) store.delete(key);
      else store.set(key, value);
    },
    keys: (): readonly string[] => [...store.keys()],
  };
}

function tempSettingsPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lit-bytes-test-'));
  return path.join(dir, 'settings.json');
}

test('bytesToVerbs extracts byte texts', () => {
  assert.deepStrictEqual(
    bytesToVerbs([{ text: 'a' }, { text: 'b', url: 'https://x' }]),
    ['a', 'b']
  );
});

test('readSettings returns {} for a missing file', () => {
  assert.deepStrictEqual(readSettings(tempSettingsPath()), {});
});

test('readSettings returns undefined for invalid JSON', () => {
  const p = tempSettingsPath();
  fs.writeFileSync(p, '{ not json', 'utf8');
  assert.strictEqual(readSettings(p), undefined);
});

test('readSettings returns undefined for non-object JSON', () => {
  const p = tempSettingsPath();
  fs.writeFileSync(p, '[1, 2]', 'utf8');
  assert.strictEqual(readSettings(p), undefined);
});

test('writeSpinnerVerbs creates file and directory when missing', () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lit-bytes-test-')), 'deep', 'settings.json');
  assert.strictEqual(writeSpinnerVerbs(p, { mode: 'replace', verbs: ['x'] }), true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(p, 'utf8')), {
    spinnerVerbs: { mode: 'replace', verbs: ['x'] },
  });
});

test('writeSpinnerVerbs preserves unrelated keys', () => {
  const p = tempSettingsPath();
  fs.writeFileSync(p, JSON.stringify({ env: { FOO: '1' }, permissions: { allow: ['Bash'] } }), 'utf8');
  writeSpinnerVerbs(p, { mode: 'replace', verbs: ['x'] });
  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepStrictEqual(after.env, { FOO: '1' });
  assert.deepStrictEqual(after.permissions, { allow: ['Bash'] });
  assert.deepStrictEqual(after.spinnerVerbs, { mode: 'replace', verbs: ['x'] });
});

test('writeSpinnerVerbs refuses to touch an invalid settings file', () => {
  const p = tempSettingsPath();
  fs.writeFileSync(p, '{ broken', 'utf8');
  assert.strictEqual(writeSpinnerVerbs(p, { mode: 'replace', verbs: ['x'] }), false);
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '{ broken');
});

test('backup/restore round-trip: pre-existing value comes back exactly', () => {
  const p = tempSettingsPath();
  const original = { mode: 'append', verbs: ['Vibing'] };
  fs.writeFileSync(p, JSON.stringify({ spinnerVerbs: original, other: true }), 'utf8');

  writeSpinnerVerbs(p, { mode: 'replace', verbs: ['LIT byte'] });
  writeSpinnerVerbs(p, original);

  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepStrictEqual(after.spinnerVerbs, original);
  assert.strictEqual(after.other, true);
});

test('restore() is a no-op when never enabled, even if the user has a real spinnerVerbs value', async () => {
  const p = tempSettingsPath();
  const usersOwnVerbs = { mode: 'append', verbs: ['NotOurs'] };
  fs.writeFileSync(p, JSON.stringify({ spinnerVerbs: usersOwnVerbs }), 'utf8');

  const manager = new SpinnerVerbsManager(fakeMemento(), () => {}, p);
  assert.strictEqual(manager.isEnabled(), false);
  await manager.restore();

  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepStrictEqual(after.spinnerVerbs, usersOwnVerbs);
});

test('SpinnerVerbsManager enable/restore round-trip preserves the users original value', async () => {
  const p = tempSettingsPath();
  const usersOwnVerbs = { mode: 'append', verbs: ['Vibing'] };
  fs.writeFileSync(p, JSON.stringify({ spinnerVerbs: usersOwnVerbs, other: 1 }), 'utf8');

  const manager = new SpinnerVerbsManager(fakeMemento(), () => {}, p);
  await manager.enable(['LIT byte one']);
  assert.strictEqual(manager.isEnabled(), true);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(p, 'utf8')).spinnerVerbs,
    { mode: 'replace', verbs: ['LIT byte one'] }
  );

  await manager.restore();
  assert.strictEqual(manager.isEnabled(), false);
  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepStrictEqual(after.spinnerVerbs, usersOwnVerbs);
  assert.strictEqual(after.other, 1);
});

test('restore of an absent key removes it entirely', () => {
  const p = tempSettingsPath();
  fs.writeFileSync(p, JSON.stringify({ other: 1 }), 'utf8');

  writeSpinnerVerbs(p, { mode: 'replace', verbs: ['LIT byte'] });
  writeSpinnerVerbs(p, undefined);

  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.ok(!('spinnerVerbs' in after));
  assert.strictEqual(after.other, 1);
});
