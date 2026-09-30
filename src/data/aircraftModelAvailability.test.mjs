import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAircraftModelGate } from './aircraftModelAvailability.js';
import { aircraftModelInventory } from '../../build/aircraft-model-inventory.js';

test('missing mesh inventory never calls loader and explains billboard fallback', async () => {
  const gate = createAircraftModelGate({ assets: [] });
  assert.equal(gate.canAttempt('/models/airplane.glb'), false);
  await assert.rejects(
    gate.load('/models/airplane.glb', () =>
      assert.fail('missing file requested'),
    ),
    /unavailable/,
  );
  assert.match(gate.warning(), /map icons/);
  assert.equal(gate.warning(false), null);
});
test('one unresolved first load gates all contacts using the same URL', async () => {
  const gate = createAircraftModelGate({ assets: ['/models/a.glb'] });
  let resolve;
  const loading = gate.load(
    '/models/a.glb',
    () => new Promise((done) => (resolve = done)),
  );
  assert.equal(gate.canAttempt('/models/a.glb'), false);
  resolve({ id: 'model' });
  await loading;
  assert.equal(gate.canAttempt('/models/a.glb'), true);
});
test('failed asset cools down globally for one minute then can recover', async () => {
  let now = 0,
    calls = 0;
  const gate = createAircraftModelGate({
    assets: ['/models/a.glb'],
    now: () => now,
  });
  await assert.rejects(
    gate.load('/models/a.glb', async () => {
      calls++;
      throw new Error('decode');
    }),
  );
  for (let contact = 0; contact < 1000; contact++)
    assert.equal(gate.canAttempt('/models/a.glb'), false);
  assert.equal(calls, 1);
  assert.match(gate.warning(), /failed/);
  now = 60000;
  await gate.load('/models/a.glb', async () => ({}));
  assert.equal(gate.warning(), null);
});
test('build inventory follows explicit public root and ignores absent or empty assets', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'leeway-models-'));
  try {
    assert.deepEqual(aircraftModelInventory(root), []);
    mkdirSync(path.join(root, 'models'));
    writeFileSync(path.join(root, 'models', 'airplane.glb'), Buffer.alloc(24));
    writeFileSync(path.join(root, 'models', 'empty.glb'), '');
    writeFileSync(path.join(root, 'models', 'README.md'), 'not an asset');
    assert.deepEqual(aircraftModelInventory(root), ['/models/airplane.glb']);
    assert.deepEqual(aircraftModelInventory(false), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
