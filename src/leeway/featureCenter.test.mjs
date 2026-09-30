import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./featureCenter.js', import.meta.url), 'utf8');

test('feature center exposes searchable domain launch controls', () => {
  assert.match(source, /Search every feature/);
  assert.match(source, /data-launch/);
  assert.match(source, /onAction\(row\.action, row\)/);
  assert.match(source, /CONNECTOR READY/);
  assert.match(source, /TRANSIT HUB/);
});

test('feature center supports open close toggle and teardown', () => {
  assert.match(source, /open\(\)/);
  assert.match(source, /close\(\)/);
  assert.match(source, /toggle\(\)/);
  assert.match(source, /destroy\(\)/);
});
