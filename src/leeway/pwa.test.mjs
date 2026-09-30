import test from 'node:test';
import assert from 'node:assert/strict';
import { installHelp } from './pwa.js';
test('install instructions cover iPhone, desktop-mode iPad, Android and desktop browsers', () => {
  assert.match(
    installHelp({ userAgent: 'iPhone' }),
    /Safari.*Add to Home Screen/,
  );
  assert.match(
    installHelp({ userAgent: 'Macintosh', maxTouchPoints: 5 }),
    /iPad/,
  );
  assert.match(installHelp({ userAgent: 'Android' }), /Chrome or Edge/);
  assert.match(installHelp({ userAgent: 'Windows' }), /Add to Dock/);
});
