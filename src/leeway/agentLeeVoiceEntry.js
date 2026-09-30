import { createVoiceControl } from '../voice/control.js';

/** The original map dock opens the same Agent Lee used by the workspace.
 * It owns no microphone, model session, credentials or speech provider.
 */
export function initAgentLeeVoiceEntry({
  signal,
  createControl = createVoiceControl,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  windowRef.__gevVoiceCommands?.stop?.({ removeUi: true });
  const ui = createControl({ reset: true });
  ui.root.dataset.voiceAdapter = 'agent-lee-voice-fabric';
  ui.root.querySelector('.gev-voice-kicker').textContent = 'AGENT LEE';
  ui.root.querySelector('.gev-voice-cost')?.remove();
  ui.status.textContent = 'OPEN';
  ui.buttonLabel.textContent = 'TALK';
  ui.detail.textContent = 'EXTERNAL VOICE FABRIC';
  ui.helpDetail.textContent = 'Open Agent Lee. Voice connection and optional model settings stay in Agent Lee.';
  ui.button.setAttribute('aria-label', 'Open Agent Lee voice controls');
  ui.button.setAttribute('aria-controls', 'leeway-agent-lee');
  let disposed = false;
  const start = () => {
    if (disposed) return false;
    const panel = documentRef.getElementById('leeway-agent-lee');
    if (!panel) {
      ui.detail.textContent = 'AGENT LEE IS STILL STARTING';
      return false;
    }
    ui.detail.textContent = 'EXTERNAL VOICE FABRIC';
    panel.classList.add('leeway-open');
    panel.dispatchEvent(new windowRef.CustomEvent('leeway:agent-open'));
    return true;
  };
  const stop = ({ removeUi = false } = {}) => {
    if (!removeUi) return;
    disposed = true;
    ui.button.removeEventListener('click', start);
    signal?.removeEventListener('abort', dispose);
    ui.root.remove();
    if (windowRef.__gevVoiceCommands === commands) delete windowRef.__gevVoiceCommands;
  };
  const dispose = () => stop({ removeUi: true });
  const commands = { start, stop };
  ui.button.addEventListener('click', start);
  windowRef.__gevVoiceCommands = commands;
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  return commands;
}
