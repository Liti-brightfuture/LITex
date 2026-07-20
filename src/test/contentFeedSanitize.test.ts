import * as assert from 'assert';
import { test } from 'node:test';
import { sanitizeText } from '../contentFeed';

test('sanitizeText strips ANSI/control escape sequences', () => {
  const withEscape = '\x1b[2J\x1b]0;evil title\x07Bun 2.0 ships built-in SQLite';
  assert.strictEqual(sanitizeText(withEscape), '[2J]0;evil titleBun 2.0 ships built-in SQLite');
});

test('sanitizeText strips OSC 52 clipboard-hijack style sequences', () => {
  const osc52 = 'hi\x1b]52;c;ZXZpbA==\x07bye';
  assert.strictEqual(sanitizeText(osc52), 'hi]52;c;ZXZpbA==bye');
});

test('sanitizeText caps length at 120 chars', () => {
  const long = 'a'.repeat(500);
  assert.strictEqual(sanitizeText(long).length, 120);
});

test('sanitizeText trims surrounding whitespace', () => {
  assert.strictEqual(sanitizeText('  hello  '), 'hello');
});

test('sanitizeText leaves normal text untouched', () => {
  assert.strictEqual(sanitizeText('Bun 2.0 ships built-in SQLite'), 'Bun 2.0 ships built-in SQLite');
});
