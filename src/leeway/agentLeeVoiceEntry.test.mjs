import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initAgentLeeVoiceEntry } from './agentLeeVoiceEntry.js';

function fixture() {
  const listeners = new Map();
  const fields = new Map();
  const node = () => ({ textContent: '', removed: false, remove() { this.removed = true; } });
  const ui = Object.fromEntries(['status', 'buttonLabel', 'detail', 'helpDetail'].map(key => [key, node()]));
  ui.root = { ...node(), dataset: {}, querySelector(selector) {
    if (!fields.has(selector)) fields.set(selector, node());
    return fields.get(selector);
  } };
  ui.button = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, fn) { listeners.set(key, fn); }, removeEventListener(key) { listeners.delete(key); } };
  const opened = [];
  const events = [];
  const panel = { classList: { add: name => opened.push(name) }, dispatchEvent: event => events.push(event.type) };
  let available = true;
  const abort = new AbortController();
  const windowRef = { CustomEvent: class { constructor(type) { this.type = type; } } };
  const commands = initAgentLeeVoiceEntry({ signal: abort.signal, createControl: () => ui,
    documentRef: { getElementById: () => available ? panel : null }, windowRef });
  return { ui, fields, opened, events, listeners, commands, abort, windowRef, unavailable: () => { available = false; } };
}

test('original dock opens the existing Agent Lee without a separate voice session or cost controls', () => {
  const f = fixture();
  assert.deepEqual(f.events, []);
  assert.equal(f.fields.get('.gev-voice-cost').removed, true);
  assert.equal(f.ui.button.attributes['aria-controls'], 'leeway-agent-lee');
  f.listeners.get('click')();
  assert.deepEqual(f.opened, ['leeway-open']);
  assert.deepEqual(f.events, ['leeway:agent-open']);
  assert.equal(f.ui.root.dataset.voiceAdapter, 'agent-lee-voice-fabric');
  f.abort.abort();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.ui.root.removed, true);
  assert.equal(f.commands.start(), false);
  assert.equal(f.windowRef.__gevVoiceCommands, undefined);
});

test('early clicks report initialization instead of falling back to another voice provider', () => {
  const f = fixture();
  f.unavailable();
  assert.equal(f.commands.start(), false);
  assert.match(f.ui.detail.textContent, /STILL STARTING/);
  assert.deepEqual(f.events, []);
});

test('app explicitly substitutes Agent Lee and original presentation permits its opened panel', () => {
  const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
  assert.match(source('../main.js'), /voice:\s*\{\s*initialize:\s*initAgentLeeVoiceEntry\s*\}/);
  assert.match(source('../app/tools.js'), /const voiceCommands = initializeVoice\(/);
  assert.doesNotMatch(source('./mapViewControls.js'), /#leeway-agent-lee[^\n]*display:none/);
  assert.doesNotMatch(source('./agentLeeVoiceEntry.js'), /realtimeSession|createRealtime|fetch\(/);
});
