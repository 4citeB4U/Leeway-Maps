import test from 'node:test';
import assert from 'node:assert/strict';
import { routeBriefing } from './routeBriefing.js';
import { executeCopilotCommand, classifyCopilotCommand } from './copilotCommands.js';

const route = {
  stops: [{ label: '210 S Canal St, Chicago, IL' }, { label: '600 E Grand Ave, Chicago, IL' }],
  distanceM: 100 * 1609.344,
  durationS: 7200,
  vehicle: { type: 'car', mpg: 25, fuelPrice: 4 },
  source: 'OSRM',
  authority: 'Passenger-car road route · no live traffic',
};

test('local briefing derives miles, gallons and cost only from selected route', async () => {
  const result = await executeCopilotCommand('Review my current route, explain its limits, and suggest how I could reduce fuel use.', {
    routePlanner: { getState: () => ({ route }) },
  });
  assert.equal(result.handled, true);
  assert.match(result.message, /210 S Canal St/);
  assert.match(result.message, /100.0 miles/);
  assert.match(result.message, /2 h/);
  assert.match(result.message, /4.0 US gallons/);
  assert.match(result.message, /\$16.00 USD/);
  assert.match(result.message, /Manual price; no station quote supplied/);
  assert.match(result.message, /not a live-traffic arrival time/);
});

test('missing route, price or MPG cannot produce invented totals', () => {
  assert.match(routeBriefing({ stops: route.stops }), /no calculated route/);
  const missingPrice = routeBriefing({ route: { ...route, vehicle: { mpg: 25 } } });
  assert.match(missingPrice, /Fuel cost is unavailable/);
  assert.doesNotMatch(missingPrice, /\$0/);
  assert.match(routeBriefing({ route: { ...route, vehicle: { mpg: 0 } } }), /Fuel estimate unavailable/);
});

test('regional fuel provenance and truck preview limitations survive briefing', () => {
  const result = routeBriefing({ route: { ...route, vehicle: { ...route.vehicle, type: 'semi' }, fuelPriceProvenance: 'EIA Midwest weekly average · 2026-09-21' } });
  assert.match(result, /Passenger-road preview only/);
  assert.match(result, /Truck clearance, hazmat access and oversize permits are unverified/);
  assert.match(result, /Regional benchmark, not a station quote/);
});

test('negated and hypothetical requests never run local route mutations', () => {
  for (const text of ["Don't optimize my route", 'Do not open personal map', 'Show weather instead of cameras', 'If I optimize stops what happens?'])
    assert.equal(classifyCopilotCommand(text), null);
});

test('missing controls and rejected GPS cannot be reported as completed actions', async () => {
  const missing = await executeCopilotCommand('Open directions', {});
  assert.equal(missing.ok, false);
  assert.match(missing.message, /No action was performed/);
  const denied = await executeCopilotCommand('Use my location', { routePlanner: { useMyLocation: async () => null } });
  assert.equal(denied.ok, false);
  assert.match(denied.message, /origin was not set/);
  const optimization = await executeCopilotCommand('Optimize stops', { routePlanner: { optimize: async () => null } });
  assert.equal(optimization.ok, false);
  assert.match(optimization.message, /did not complete/);
});
