import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPipelineQuery,
  createPipelineSource,
  normalizePipelineWay,
} from './source.js';

test('pipeline query is bounded and asks only for mapped pipelines', () => {
  const query = buildPipelineQuery({
    south: 41.7,
    west: -88.0,
    north: 42.0,
    east: -87.5,
  });
  assert.match(query, /man_made/);
  assert.match(query, /pipeline/);
  assert.match(query, /41\.7,-88,42,-87\.5/);
  assert.match(query, /out geom/);
});

test('pipeline normalization preserves logistics-relevant OSM tags', () => {
  const row = normalizePipelineWay({
    type: 'way',
    id: 42,
    tags: {
      name: 'Example Line',
      operator: 'Example Utility',
      substance: 'gas',
      usage: 'transmission',
      location: 'underground',
    },
    geometry: [
      { lat: 41.8, lon: -87.7 },
      { lat: 41.81, lon: -87.69 },
    ],
  });
  assert.equal(row.id, 'osm-pipeline-42');
  assert.equal(row.substance, 'gas');
  assert.equal(row.operator, 'Example Utility');
  assert.equal(row.location, 'underground');
});

test('pipeline source refuses oversized viewports before network use', async () => {
  let calls = 0;
  const source = createPipelineSource({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('should not fetch');
    },
  });
  const result = await source.fetch({
    south: 0,
    west: 0,
    north: 10,
    east: 10,
  });
  assert.equal(result.status, 'zoom-in');
  assert.equal(calls, 0);
});
