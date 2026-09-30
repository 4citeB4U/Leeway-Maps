import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWorldApiUrl, installWorldApiBridge} from './worldApiBridge.js';
test('Pages does not redirect API requests to an unconfigured phone localhost', () => {
  const previous = globalThis.location;
  globalThis.location = new URL('https://4citeb4u.github.io/LEEWAY-LOGISTICS-/');
  try {
    assert.equal(resolveWorldApiUrl('/api/cctv/sources'), '/api/cctv/sources');
    assert.equal(resolveWorldApiUrl('https://example.com/api/test'),'https://example.com/api/test');
    let called=false;
    const bridge=installWorldApiBridge({fetchImpl:()=>{called=true;}});
    assert.deepEqual(bridge,{installed:false,base:''});
    assert.equal(called,false);
  } finally {if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
