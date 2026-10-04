import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('personal transit controls expose canonical layers and route modes', async () => {
  const source = await readFile(new URL('./personalTransitControls.js', import.meta.url), 'utf8');
  for (const id of ['transit','transit-routes','transit-stops','transit-vehicles'])
    assert.match(source, new RegExp(id));
  for (const mode of ['bus','rail','subway','tram','ferry'])
    assert.match(source, new RegExp("data-mode=\\\\?\"" + mode));
  assert.match(source, /allowedModes/);
  assert.match(source, /Show nearby network/);
  assert.match(source, /Regional live fallback/);
});
