import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextCctvHealth } from './cctv.js';

test('CCTV circuit applies bounded backoff, quarantine, and success reset', () => {
  const first = nextCctvHealth(
    'camera-a',
    {},
    { status: 'unavailable', sourceKind: 'snapshot' },
    1_000,
  );
  assert.equal(first.failureCount, 1);
  assert.equal(first.circuitState, 'backoff');
  assert.equal(first.retryAt, 301_000);

  const second = nextCctvHealth(
    'camera-a',
    first,
    { status: 'unavailable' },
    2_000,
  );
  const third = nextCctvHealth(
    'camera-a',
    second,
    { status: 'unavailable' },
    3_000,
  );
  assert.equal(third.failureCount, 3);
  assert.equal(third.circuitState, 'quarantined');
  assert.equal(third.retryAt, 1_203_000);

  const recovered = nextCctvHealth(
    'camera-a',
    third,
    { status: 'ok', message: 'Upstream snapshot active' },
    4_000,
  );
  assert.equal(recovered.failureCount, 0);
  assert.equal(recovered.circuitState, 'closed');
  assert.equal(recovered.retryAt, 0);
});
