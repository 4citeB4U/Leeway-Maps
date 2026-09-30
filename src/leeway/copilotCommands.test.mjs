import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCopilotCommand,
  executeCopilotCommand,
} from './copilotCommands.js';

test('classifies only unambiguous system copilot actions', () => {
  assert.equal(classifyCopilotCommand('Open personal map'), null);
  assert.equal(
    classifyCopilotCommand('Show me the weather radar').action,
    'weather',
  );
  assert.equal(
    classifyCopilotCommand('Open my dispatch load triangle').action,
    'load-planning',
  );
  assert.equal(
    classifyCopilotCommand('Tell me whether this bridge is safe'),
    null,
  );
});

test('opens load planning without a model or external write', async () => {
  let calls = 0;
  const result = await executeCopilotCommand('Open load planning', {
    openLoadPlanning() {
      calls++;
    },
  });
  assert.equal(result.handled, true);
  assert.equal(calls, 1);
  assert.match(result.message, /does not book freight/);
});

test('does not manufacture a model action for ordinary questions', async () => {
  const result = await executeCopilotCommand(
    'What is the history of Milwaukee?',
    {},
  );
  assert.deepEqual(result, { handled: false });
});

test('classifies deterministic voice navigation and CCTV selection', () => {
  assert.deepEqual(
    classifyCopilotCommand('Take me to 400 W Wisconsin Ave, Milwaukee, WI'),
    {
      action: 'navigate',
      origin: 'current',
      destination: '400 W Wisconsin Ave, Milwaukee, WI',
    },
  );
  assert.deepEqual(
    classifyCopilotCommand('Route from Chicago, IL to Milwaukee, WI'),
    {
      action: 'navigate',
      origin: 'Chicago, IL',
      destination: 'Milwaukee, WI',
    },
  );
  assert.deepEqual(classifyCopilotCommand('Show camera CC10'), {
    action: 'camera-select',
    query: 'CC10',
  });
  assert.deepEqual(classifyCopilotCommand('choose option second'), {
    action: 'choose-address',
    choice: 2,
  });
});

test('executes deterministic road routing without a model', async () => {
  const calls = [];
  const result = await executeCopilotCommand('Take me to Milwaukee, WI', {
    routePlanner: {
      async routeFromVoice(value) {
        calls.push(value);
        return { ok: true };
      },
    },
  });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { origin: 'current', destination: 'Milwaukee, WI' },
  ]);
});

test('executes named CCTV selection without a model', async () => {
  const calls = [];
  const result = await executeCopilotCommand('Show camera ca-d11-x1241', {
    async selectCctv(query) {
      calls.push(query);
      return {
        ok: true,
        name: 'I-5 First Avenue',
        provider: 'Caltrans',
      };
    },
  });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['ca-d11-x1241']);
  assert.match(result.message, /Caltrans/);
});
