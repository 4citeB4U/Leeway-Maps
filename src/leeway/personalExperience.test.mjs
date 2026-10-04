import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../../', import.meta.url)));
const shell = fs.readFileSync(path.join(ROOT, 'src/leeway/mapsShell.js'), 'utf8');
const theme = fs.readFileSync(path.join(ROOT, 'src/leeway/personalTheme.css'), 'utf8');

test('Personal Maps no longer uses the business blue approved-logo asset', () => {
  assert.doesNotMatch(shell, /leeway-approved-logo\.jpg/);
  assert.match(shell, /lm-brand-mark/);
  assert.match(shell, /Go anywhere\. Know what's around you\./);
});

test('Personal Maps pins the green yellow red white consumer palette', () => {
  assert.match(theme, /--lm-green:#18b866/);
  assert.match(theme, /--lm-yellow:#ffd64a/);
  assert.match(theme, /--lm-red:#e84b55/);
  assert.match(theme, /--lm-white:#ffffff/);
  assert.match(theme, /background:rgba\(255,255,255/);
});

test('Personal Maps presents everyday navigation before specialist controls', () => {
  const dock = shell.indexOf('aria-label="Quick map tools"');
  assert.ok(dock > 0);
  const section = shell.slice(dock, dock + 3500);
  for (const label of ['My location', 'Directions', 'Transit', 'Traffic', 'Weather', 'Cameras', 'Help', 'More'])
    assert.match(section, new RegExp('>' + label + '<'));
  assert.doesNotMatch(section, />Military</);
});
