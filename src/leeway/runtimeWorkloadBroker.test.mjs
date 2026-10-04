import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkloadPlan,
  chooseWorkloadLane,
  discoverRuntimeCapabilities,
} from './runtimeWorkloadBroker.js';

test('map rendering stays in browser graphics lane', () => {
  assert.equal(chooseWorkloadLane('map-render', { webgpu:true }).lane, 'browser-graphics');
  assert.equal(chooseWorkloadLane('map-render', { webgpu:false }).lane, 'browser-graphics');
});

test('native inference is preferred over webgpu when explicitly available', () => {
  assert.equal(chooseWorkloadLane('model-inference', {
    nativeGpuCompute:true, webgpu:true, webWorkers:true
  }).lane, 'native-gpu-compute');
});

test('webgpu is compute fallback before CPU worker for inference', () => {
  assert.equal(chooseWorkloadLane('visual-inference', {
    webgpu:true, webWorkers:true
  }).lane, 'webgpu-compute');
});

test('background work avoids duplicate GPU placement', () => {
  const plan = buildWorkloadPlan(
    { nativeGpuCompute:true, webgpu:true, webWorkers:true, nativeCpuWorkers:true },
    [
      { id:'map', kind:'map-render' },
      { id:'vision', kind:'visual-inference' },
      { id:'index', kind:'background-index' },
    ],
  );
  assert.deepEqual(plan.map((x) => x.placement.lane), [
    'browser-graphics',
    'native-gpu-compute',
    'native-cpu-worker',
  ]);
});

test('capability discovery does not invent a native bridge', () => {
  const caps = discoverRuntimeCapabilities({
    navigatorRef: { hardwareConcurrency:8, maxTouchPoints:5 },
    globalRef: { Worker: function Worker(){}, WebAssembly:{} },
  });
  assert.equal(caps.nativeAvailable, false);
  assert.equal(caps.nativeGpuCompute, false);
});
