import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
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

test('Personal Maps uses one left operations rail and one center Agent Lee control', () => {
  const rail = shell.indexOf('aria-label="LeeWay Maps navigation"');
  const dock = shell.indexOf('aria-label="Agent Lee"');
  assert.ok(rail > 0);
  assert.ok(dock > rail);
  const railSection = shell.slice(rail, dock);
  for (const label of ['Home', 'My location', 'Transit', 'Explore', 'Traffic', 'Cameras', 'Weather', 'Cockpit', 'More'])
    assert.match(railSection, new RegExp('>' + label + '<'));
  const dockSection = shell.slice(dock, dock + 1000);
  assert.match(dockSection, /lm-agent-mic/);
  assert.match(dockSection, />Agent Lee</);
  assert.doesNotMatch(dockSection, />Transit<|>Traffic<|>Weather<|>Cameras<|>More</);
  assert.doesNotMatch(shell, /class="lws-right-tabs/);
  assert.doesNotMatch(railSection, />Military</);
});
