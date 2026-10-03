/** Adapt only raster resolution, never map content or tracking cadence. */
export function createRenderBudget({ onScale, initialScale = 1 } = {}) {
  const steps = [1, 0.85, 0.7];
  let level = 0, previous = null, samples = [], slow = 0, fast = 0, mode = 'auto';
  function reset() { previous = null; samples = []; slow = 0; fast = 0; }
  function apply(next) {
    if (next === level) return;
    level = next; onScale?.(initialScale * steps[level]);
  }
  return {
    sample(now, visible = true) {
      if (!visible || mode !== 'auto') { reset(); return; }
      const dt = previous === null ? null : now - previous;
      previous = now;
      // Idle request-render intervals and background suspension are not slow frames.
      if (dt === null) return;
      if (dt <= 0 || dt > 250) { samples = []; slow = 0; fast = 0; return; }
      samples.push(dt);
      if (samples.length < 90) return;
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      samples = [];
      slow = mean > 28 ? slow + 1 : 0;
      fast = mean < 19 ? fast + 1 : 0;
      // Two sustained slow windows; eight fast windows before increasing load.
      if (slow >= 2 && level < steps.length - 1) { apply(level + 1); slow = 0; fast = 0; }
      else if (fast >= 8 && level > 0) { apply(level - 1); slow = 0; fast = 0; }
    },
    setMode(next) { mode = next === 'full' ? 'full' : 'auto'; reset(); if (mode === 'full') apply(0); },
    getState: () => ({ mode, scale: initialScale * steps[level] }),
  };
}

export function installRenderBudget(viewer, { documentRef = document, now = () => performance.now() } = {}) {
  const initialScale = viewer.resolutionScale;
  const budget = createRenderBudget({ initialScale, onScale: scale => {
    viewer.resolutionScale = scale;
    viewer.scene.requestRender();
  } });
  const remove = viewer.scene.postRender.addEventListener(() => budget.sample(now(), !documentRef.hidden));
  const change = event => budget.setMode(event.detail?.mode);
  documentRef.addEventListener('leeway:render-quality', change);
  return () => {
    remove(); documentRef.removeEventListener('leeway:render-quality', change);
    viewer.resolutionScale = initialScale;
  };
}
