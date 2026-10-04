import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceCapabilityProfile, mobileRenderPolicy, applyMobileRenderPolicy } from './devicePerformanceProfile.js';

test('mobile constrained profile reduces render cost without inventing hardware', () => {
  const profile = deviceCapabilityProfile({
    navigatorRef: { hardwareConcurrency: 4, deviceMemory: 4, maxTouchPoints: 5 },
    windowRef: { innerWidth: 430, innerHeight: 900, devicePixelRatio: 3 },
  });
  assert.equal(profile.mobileViewport, true);
  assert.equal(profile.constrained, true);
  assert.equal(profile.webgpu, false);
  assert.equal(mobileRenderPolicy(profile).aircraft3d, false);
});

test('desktop policy keeps proximity 3D', () => {
  const policy = mobileRenderPolicy({ mobileViewport: false });
  assert.equal(policy.id, 'desktop-balanced');
  assert.equal(policy.aircraft3d, true);
});

test('policy applies viewer scale and flight parameters', () => {
  const calls = [];
  const viewer = { resolutionScale: 1, scene: { requestRender() { calls.push('render'); } } };
  const dataManager = { layers: new Map([['flights', { module: { setParams(v, o) { calls.push([v,o]); } } }]]) };
  const result = applyMobileRenderPolicy({
    viewer,
    dataManager,
    profile: { mobileViewport:true, constrained:true },
    policy: { id:'mobile-constrained', resolutionScale:.72, aircraft3d:false, aircraft3dMode:'proximity' },
  });
  assert.equal(viewer.resolutionScale, .72);
  assert.equal(result.policy.id, 'mobile-constrained');
  assert.equal(calls[1][0].models3d, false);
});
