import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderBudget, installRenderBudget } from './renderBudget.js';
function harness() {
  let now = 0; const changes = [];
  const budget = createRenderBudget({ onScale: value => changes.push(value) });
  budget.sample(now);
  return { budget, changes, frames(count, interval) { for (let i = 0; i < count; i++) budget.sample(now += interval); } };
}
test('sustained slow rendering reduces pixel work with a bounded floor', () => {
  const h = harness(); h.frames(179, 40); assert.deepEqual(h.changes, []);
  h.frames(1, 40); assert.deepEqual(h.changes, [.85]);
  h.frames(1800, 40); assert.deepEqual(h.changes, [.85, .7]);
  assert.ok(Math.abs(h.budget.getState().scale ** 2 - .49) < 1e-12);
});
test('brief good frames do not oscillate quality, sustained headroom restores it', () => {
  const h = harness(); h.frames(360, 40); h.frames(719, 16);
  assert.equal(h.budget.getState().scale, .7);
  h.frames(1, 16); assert.equal(h.budget.getState().scale, .85);
  h.frames(720, 16); assert.equal(h.budget.getState().scale, 1);
});
test('idle intervals and hidden-tab samples cannot degrade quality', () => {
  const h = harness(); h.frames(1000, 1000);
  for (let i = 0; i < 1000; i++) h.budget.sample(i * 40, false);
  assert.deepEqual(h.changes, []);
});
test('full quality opt out restores original scale and ignores slow frames', () => {
  const h = harness(); h.frames(360, 40); h.budget.setMode('full');
  h.frames(1000, 40); assert.equal(h.budget.getState().scale, 1);
  h.budget.setMode('auto'); h.frames(181, 40); assert.equal(h.budget.getState().scale, .85);
});
test('viewer adapter removes listeners and restores caller resolution', () => {
  let render, removed = false; const doc = new EventTarget(); doc.hidden = false;
  const viewer = { resolutionScale: 1.25, scene: { requestRender() {}, postRender: { addEventListener(fn) { render = fn; return () => { removed = true; }; } } } };
  let now = 0; const dispose = installRenderBudget(viewer, { documentRef: doc, now: () => now += 40 });
  for (let i = 0; i < 181; i++) render();
  assert.equal(viewer.resolutionScale, 1.25 * .85);
  const change = new Event('leeway:render-quality'); change.detail = { mode: 'full' }; doc.dispatchEvent(change);
  assert.equal(viewer.resolutionScale, 1.25); dispose(); assert.equal(removed, true);
});
