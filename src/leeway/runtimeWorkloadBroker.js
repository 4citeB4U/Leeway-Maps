/*
REGION: LeeWay Maps / Runtime Fabric
TAG: LEEWAY.RUNTIME.WORKLOAD_BROKER
WHAT = Deterministic cross-platform workload placement between browser graphics, optional native accelerator, WebGPU compute, workers and CPU.
WHY = Downloaded and browser editions need one system-agnostic policy without pretending WebGPU and native GPU are separate physical GPUs.
WHO = LeeWay Industries under Creator authority.
WHERE = Shared map runtime; native hosts may expose window.LeewayNativeRuntime.
WHEN = A renderer, inference, compression or geospatial compute workload is requested.
HOW = Classify workload, inspect proven capabilities, choose one execution lane, preserve fallback order and evidence.
LICENSE = MIT, matching the host repository.
*/

export const WORKLOAD_KINDS = Object.freeze([
  'map-render',
  'visual-inference',
  'model-inference',
  'geospatial-compute',
  'compression',
  'background-index',
]);

export function discoverRuntimeCapabilities({
  navigatorRef = globalThis.navigator,
  globalRef = globalThis,
} = {}) {
  const native = globalRef?.LeewayNativeRuntime || null;
  return Object.freeze({
    nativeAvailable: Boolean(native),
    nativeGpuCompute: Boolean(native?.capabilities?.gpuCompute),
    nativeCpuWorkers: Boolean(native?.capabilities?.cpuWorkers),
    nativeNeural: Boolean(native?.capabilities?.neural),
    webgpu: Boolean(navigatorRef?.gpu),
    webWorkers: typeof globalRef?.Worker === 'function',
    wasm: typeof globalRef?.WebAssembly === 'object',
    hardwareConcurrency: Number(navigatorRef?.hardwareConcurrency || 0) || null,
    deviceMemoryGiB: Number(navigatorRef?.deviceMemory || 0) || null,
  });
}

export function chooseWorkloadLane(kind, capabilities, { latencyCritical = false } = {}) {
  if (!WORKLOAD_KINDS.includes(kind))
    return Object.freeze({ lane: 'cpu-main', reason: 'unknown-workload-fails-safe' });
  const c = capabilities || {};

  if (kind === 'map-render') {
    return Object.freeze({
      lane: 'browser-graphics',
      reason: c.webgpu ? 'browser-graphics-webgpu-capable' : 'browser-graphics-webgl-compatible',
    });
  }

  if (kind === 'visual-inference' || kind === 'model-inference') {
    if (c.nativeNeural)
      return Object.freeze({ lane: 'native-neural', reason: 'native-neural-accelerator-authorized' });
    if (c.nativeGpuCompute)
      return Object.freeze({ lane: 'native-gpu-compute', reason: 'native-gpu-compute-authorized' });
    if (c.webgpu)
      return Object.freeze({ lane: 'webgpu-compute', reason: 'webgpu-compute-available' });
    if (c.webWorkers)
      return Object.freeze({ lane: 'cpu-worker', reason: 'worker-fallback' });
    return Object.freeze({ lane: 'cpu-main', reason: 'cpu-fallback' });
  }

  if (kind === 'geospatial-compute' || kind === 'compression' || kind === 'background-index') {
    if (c.nativeCpuWorkers)
      return Object.freeze({ lane: 'native-cpu-worker', reason: 'native-background-worker-authorized' });
    if (c.webWorkers)
      return Object.freeze({ lane: 'cpu-worker', reason: 'web-worker-background-lane' });
    if (c.webgpu && latencyCritical && kind === 'geospatial-compute')
      return Object.freeze({ lane: 'webgpu-compute', reason: 'latency-critical-parallel-compute' });
    return Object.freeze({ lane: 'cpu-main', reason: 'cpu-fallback' });
  }

  return Object.freeze({ lane: 'cpu-main', reason: 'fallback' });
}

export function buildWorkloadPlan(capabilities, workloads = []) {
  return workloads.map((workload) => ({
    ...workload,
    placement: chooseWorkloadLane(workload.kind, capabilities, workload),
  }));
}
