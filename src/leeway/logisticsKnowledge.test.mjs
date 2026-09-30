import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGISTICS_KNOWLEDGE_TOPICS,
  logisticsKnowledge,
} from './logisticsKnowledge.js';

test('Agent Lee logistics memory bank covers enterprise transportation domains', () => {
  for (const topic of [
    'trucking',
    'dispatch',
    'load_board',
    'hos',
    'driver_qualification',
    'employment_onboarding',
    'crm',
    'fleet_maintenance',
    'municipal_transit',
    'rail',
    'marine_intermodal',
    'facilities',
    'routing',
    'evidence',
    'world_intelligence',
  ]) {
    assert.ok(LOGISTICS_KNOWLEDGE_TOPICS.includes(topic), topic);
    assert.equal(typeof logisticsKnowledge(topic)?.summary, 'string', topic);
  }
});

test('driver qualification memory retains authoritative reference provenance', () => {
  const entry = logisticsKnowledge('driver_qualification');
  assert.ok(entry.sources.some((source) => source.authority === 'FMCSA'));
  assert.match(entry.caution, /employer remains responsible/i);
});
