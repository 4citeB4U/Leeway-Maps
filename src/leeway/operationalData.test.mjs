import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalCockpit, operationalFleet } from './operationalData.js';
test('production operations reject training, missing and unverified data without fabricating load or HOS', () => {
  for (const mode of [undefined,'TRAINING_DEMO','UNVERIFIED','DEMO']) {
    const result=operationalCockpit({mode,activeLoad:{loadNumber:'fake'},hos:{driveRemainingMinutes:999}});
    assert.equal(result.activeLoad,null);assert.equal(result.hos,null);assert.equal(result.mode,'NOT CONNECTED');
    assert.deepEqual(operationalFleet({leeway:{telemetryMode:mode},vehicles:[{id:'fake'}]}).vehicles,[]);
  }
});
test('verified operation payloads pass through, fixture provenance does not', () => {
  const cockpit={mode:'LIVE',activeLoad:{loadNumber:'real'}};
  assert.equal(operationalCockpit(cockpit),cockpit);
  assert.equal(operationalCockpit({...cockpit,provenance:{source:'bundled-training-fixture'}}).activeLoad,null);
  const fleet={leeway:{telemetryMode:'LIVE'},vehicles:[{id:'real'}]};
  assert.equal(operationalFleet(fleet),fleet);
});
