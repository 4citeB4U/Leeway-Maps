import * as Cesium from 'cesium';
import { discoverModels, prepareModel, runtimeBase } from './agentRuntime.js';
import { PhoneRelay } from './phoneRelay.js';
import { createVoiceFabricAdapter } from './voiceFabric.js';
import { createAgentLeeToolRuntime } from './agentLeeTools.js';
import { BrowserCopilotMedia } from './browserCopilotMedia.js';
import { executeCopilotCommand } from './copilotCommands.js';
import { mapIcon } from './mapIcons.js';
import { getLanguage, translate } from './experienceLocale.js';

const DEFAULT_MODEL = 'gemma4:e4b';
const DEFAULT_ENDPOINT = '';
const MAX_SPOKEN_RESPONSE_CHARS = 1200;

function loadSetting(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function sceneContext(application) {
  try {
    const viewer = application?.getComponents?.()?.scene?.viewer;
    if (!viewer?.camera) return null;
    const carto = viewer.camera.positionCartographic;
    return {
      latitude: Cesium.Math.toDegrees(carto.latitude),
      longitude: Cesium.Math.toDegrees(carto.longitude),
      altitudeMeters: carto.height,
      headingDegrees: Cesium.Math.toDegrees(viewer.camera.heading || 0),
      pitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch || 0),
    };
  } catch {
    return null;
  }
}

function systemPrompt(context) {
  return [
    'You are Agent Lee, the personal travel copilot in LeeWay Maps.',
    `Reply in ${getLanguage().name}. Preserve addresses, timestamps and numerical facts.`,
    'Help with directions, commuting, passenger flights, public transit, places, weather and public cameras. This product has no commercial dispatch or company records.',
    'Use available map tools before claiming an action completed. Read current entity context before describing a selected object.',
    'The deterministic map controls work without an LLM. Language reasoning is optional for complex questions.',
    'Never turn stale, mapped-only or unavailable information into live telemetry. Formula health does not prove task evaluation.',
    context ? `Current map camera context: ${JSON.stringify(context)}` : '',
  ].filter(Boolean).join('\n');
}

function phonePrompt(content, shell, history) {
  const state = shell?.routePlanner?.getState?.();
  const summary = state
    ? {
        stops: state.stops?.slice(0, 12).map((stop) => ({
          label: String(
            stop.text || stop.label || stop.point?.label || '',
          ).slice(0, 120),
          point: stop.point
            ? { lat: stop.point.lat, lon: stop.point.lon }
            : null,
        })),
        distanceMeters: state.route?.distanceM,
        durationSeconds: state.route?.durationS,
        authority: state.route?.authority,
      }
    : null;
  return [
    'You are Agent Lee, the personal travel copilot in LeeWay Maps. Be clear, calm and concise. Give advice only; you cannot execute map tools through this phone adapter.',
    `Reply in ${getLanguage().name} (${getLanguage().code}); preserve route addresses and numbers.`,
    'Never claim current hazards, live transit arrivals, voice playback or Formula execution without verified evidence. Passenger road routes are previews. The Optimize stops button uses road distance, not live traffic. Help with everyday trips and public transportation; you have no company records or commercial dispatch tools.',
    `Current route summary: ${JSON.stringify(summary)}`,
    ...history
      .slice(-4)
      .map((row) => `${row.role}: ${row.content.slice(0, 500)}`),
    `User: ${content.slice(0, 4000)}`,
  ].join('\n');
}

const probeOllama = discoverModels;

async function callOllama({
  endpoint,
  model,
  messages,
  context,
  toolRuntime,
  signal,
}) {
  const base = runtimeBase(endpoint);
  const conversation = [
    { role: 'system', content: systemPrompt(context) },
    ...messages,
  ];
  const toolResults = [];

  for (let round = 0; round < 6; round += 1) {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: conversation,
        tools: toolRuntime?.tools || [],
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const body = await response.json();
    const message = body?.message || {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    conversation.push(message);

    if (!calls.length) {
      const content = String(message.content || '').trim();
      if (!content) throw new Error('Gemma returned no message content');
      return { content, toolResults };
    }

    for (const call of calls) {
      signal?.throwIfAborted();
      const name = call?.function?.name;
      const args =
        call?.function?.arguments && typeof call.function.arguments === 'object'
          ? call.function.arguments
          : {};
      if (!name || !toolRuntime) {
        throw new Error(
          'Gemma requested a tool but no LeeWay tool runtime is available',
        );
      }

      let result;
      try {
        result = await toolRuntime.execute(name, args);
      } catch (error) {
        result = {
          ok: false,
          action: name,
          error: String(error?.message || error),
        };
      }
      toolResults.push({ name, arguments: args, result });
      conversation.push({
        role: 'tool',
        tool_name: name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error('Agent Lee tool loop exceeded the six-round safety limit');
}

function ensureStyles(documentRef) {
  if (documentRef.getElementById('leeway-agent-lee-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'leeway-agent-lee-styles';
  style.textContent = `
    #leeway-agent-lee {
      position: fixed;
      left: 18px;
      bottom: 18px;
      z-index: 10030;
      width: min(420px, calc(100vw - 36px));
      max-height: calc(100dvh - 130px);
      overflow-y: auto;
      background: rgba(2, 10, 17, .94);
      border: 1px solid rgba(98, 231, 255, .48);
      box-shadow: 0 18px 70px rgba(0,0,0,.52);
      backdrop-filter: blur(14px);
      color: #edffff;
      font: 18px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
      border-radius: 16px;
    }
    #leeway-agent-lee * { box-sizing: border-box; }
    #leeway-agent-lee:not(.lal-expanded) .lal-body,
    #leeway-agent-lee:not(.lal-expanded) .lal-status,
    #leeway-agent-lee:not(.lal-expanded) .lal-kicker { display:none; }
    .lal-voice-surface { padding:16px; text-align:center; }
    .lal-voice-mic { display:inline-grid; place-items:center; width:72px; height:72px; border-radius:50%; border:2px solid #8ef9e4; color:#fff; background:linear-gradient(145deg,#35c9bc,#12556b); box-shadow:inset 0 2px 1px #d2fff550,0 5px 16px #0008; cursor:pointer; }
    .lal-voice-mic svg { width:32px; height:32px; }
    .lal-wave { display:flex; align-items:center; justify-content:center; gap:5px; height:38px; margin:10px 0; }
    .lal-wave span { width:5px; height:8px; border-radius:5px; background:#79e9db; }
    #leeway-agent-lee[data-phase="listening"] .lal-wave span,
    #leeway-agent-lee[data-phase="speaking"] .lal-wave span { animation:lal-voice-pulse .8s ease-in-out infinite alternate; }
    .lal-wave span:nth-child(2n) { animation-delay:-.3s !important; }
    .lal-wave span:nth-child(3n) { animation-delay:-.6s !important; }
    @keyframes lal-voice-pulse { to { height:30px; } }
    @media (prefers-reduced-motion:reduce) { .lal-wave span { animation:none !important; } }
    .lal-conversation-status { font:600 18px/1.45 system-ui,sans-serif; margin:4px 0; overflow-wrap:anywhere; }
    .lal-head-actions { display:flex; gap:6px; align-items:center; }
    #leeway-agent-lee.lal-expanded .lal-voice-surface { display:none; }
    .lal-head { padding: 12px 14px; border-bottom: 1px solid rgba(98,231,255,.18); display:grid; grid-template-columns:1fr auto; gap:4px 12px; position:sticky; top:0; z-index:1; background:#06131d; }
    .lal-kicker { font-size: 13px; letter-spacing: .06em; color:#c6e1e8; grid-column:1/-1; }
    .lal-title { font-size: 22px; font-weight: 750; align-self:center; }
    .lal-status { margin-top: 6px; font-size: 14px; line-height:1.45; grid-column:1/-1; }
    .lal-status[data-state="connected"] { color: #86ffa8; }
    .lal-status[data-state="disconnected"] { color: #ffd877; }
    .lal-body { padding: 12px 14px; }
    .lal-log {
      position: relative;
      max-height: 300px;
      overflow: auto;
      padding: 12px;
      background: rgba(255,255,255,.025);
      border: 1px solid rgba(255,255,255,.07);
      overflow-wrap: anywhere;
    }
    .lal-entry { margin: 0 0 16px; white-space:pre-wrap; }
    .lal-entry strong { color: #91edff; }
    .lal-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .lal-row > .lal-input { flex-basis:100%; }
    .lal-quick { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .lal-quick button { padding:10px 12px; font-size:16px; }
    .lal-input {
      flex:1; min-width:0; padding:10px; min-height:48px; border-radius:10px;
      background:#07121b; color:#efffff;
      border:1px solid rgba(98,231,255,.28);
      font:inherit;
    }
    .lal-btn {
      padding:10px 14px; min-height:48px; border-radius:10px; cursor:pointer;
      background:rgba(98,231,255,.08); color:#efffff;
      border:1px solid rgba(98,231,255,.28);
      font:600 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .lal-btn[data-action="voice"][aria-pressed="true"] {
      color:#86ffa8;
      border-color:rgba(134,255,168,.42);
      background:rgba(134,255,168,.08);
    }
    .lal-btn[data-action="talk"][aria-pressed="true"] {
      color:#07131b;
      border-color:#a7ffbf;
      background:#86ffa8;
    }
    .lal-settings { margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .lal-settings input { width:100%; padding:7px; background:#07121b; color:#efffff; border:1px solid rgba(255,255,255,.12); font:inherit; }
    .lal-note { margin-top:10px; color:#d0e2e8; font-size:14px; line-height:1.5; }
    #leeway-agent-lee summary { min-height:44px; padding:8px 0; font-size:16px; cursor:pointer; }
    #leeway-agent-lee a { color:#91edff; text-decoration:underline; }
    #leeway-agent-lee :focus-visible { outline:3px solid #91edff; outline-offset:2px; }
    @media (max-width:720px) {
      #leeway-agent-lee { left:12px; bottom:calc(48vh + 24px); width:calc(100vw - 24px); }
      .lal-log { max-height:240px; }
      .lal-settings { grid-template-columns:1fr; }
    }
  `;
  documentRef.head.appendChild(style);
}

function appendEntry(log, role, content) {
  const entry = document.createElement('div');
  entry.className = 'lal-entry';
  const label = role === 'user' ? 'YOU' : 'AGENT LEE';
  entry.innerHTML = `<strong>${label}</strong>\n`;
  const text = document.createTextNode(content);
  entry.appendChild(text);
  log.appendChild(entry);
  while (log.children.length > 30) log.firstElementChild.remove();
  // Start at the answer's beginning, not its final disclaimer or last line.
  log.scrollTop = entry.offsetTop;
}

export function mountAgentLeeGemma(application, shell = null) {
  if (document.getElementById('leeway-agent-lee')) return null;
  ensureStyles(document);
  const toolRuntime = shell
    ? createAgentLeeToolRuntime(application, shell)
    : null;

  const root = document.createElement('section');
  root.id = 'leeway-agent-lee';
  root.innerHTML = `
    <div class="lal-head">
      <div class="lal-kicker">LEEWAY MAPS · PERSONAL COPILOT</div>
      <div class="lal-title">Agent Lee · Copilot</div>
      <div class="lal-head-actions"><button class="lal-btn" type="button" data-action="conversation-menu" aria-label="Conversation and settings" aria-expanded="false">☰</button><button class="lal-btn" type="button" data-action="close" aria-label="Close Agent Lee">×</button></div>
      <div class="lal-status" data-state="disconnected">LOCAL RUNTIME: DISCONNECTED</div>
    </div>
    <div class="lal-voice-surface">
      <button class="lal-voice-mic" type="button" data-action="voice-talk" aria-label="Talk to Agent Lee" aria-pressed="false">${mapIcon('mic')}</button>
      <div class="lal-wave" aria-hidden="true">${'<span></span>'.repeat(11)}</div>
      <p class="lal-conversation-status" role="status" aria-live="polite">Tap the microphone to talk.</p>
    </div>
    <div class="lal-body">
      <div class="lal-log">
        <div class="lal-entry"><strong>AGENT LEE · COPILOT</strong>\nWelcome. I help with everyday travel, directions, public transit, flights, places, cameras and weather. Basic map commands work without a model. A compatible model is optional for complex questions.</div>
      </div>
      <div class="lal-row">
        <input class="lal-input" aria-label="Ask Agent Lee" placeholder="Ask about a route, bus, train, flight, place, camera, or weather..." />
        <button class="lal-btn" type="button" data-action="send">ASK</button>
        <button class="lal-btn" type="button" data-action="talk" aria-pressed="false">TALK</button>
        <button class="lal-btn" type="button" data-action="voice" aria-pressed="true">VOICE ON</button>
      </div>
      <div class="lal-row"><button class="lal-btn" data-action="route-review">Review route</button><button class="lal-btn" data-action="route-optimize">Optimize stops</button></div>
      <div class="lal-quick" aria-label="System copilot controls"><button class="lal-btn" data-command="Open directions">Directions</button><button class="lal-btn" data-command="Show weather radar">Weather</button><button class="lal-btn" data-command="Show CCTV cameras">CCTV</button></div>
      <button class="lal-btn" type="button" data-action="stop">Stop reply</button><button class="lal-btn" type="button" data-action="setup-toggle" aria-expanded="false" aria-controls="lal-model-voice-setup">Model and voice setup</button><div id="lal-model-voice-setup" hidden>
      <label>Reasoning connection <select class="lal-input" data-setting="provider"><option value="phone">LeeWay Device Bridge phone</option><option value="ollama">Ollama runtime</option></select></label>
      <p class="lal-note">Reuse the model already verified inside your LeeWay Android runtime. Pairing permits requests through the LeeWay relay; credentials stay in this tab.</p>
      <div class="lal-settings"><input data-setting="device" aria-label="Device Bridge device ID" placeholder="Device ID" autocomplete="off"/><input type="password" data-setting="token" aria-label="Device Bridge pairing token" placeholder="Pairing token" autocomplete="off"/></div>
      <div class="lal-row"><button class="lal-btn" data-action="pair">Connect / recheck phone</button><button class="lal-btn" data-action="unpair">Disconnect</button></div>
      <p class="lal-note" data-phone-status>Phone: not paired.</p>
      <details><summary>Pair your Android phone</summary><ol class="lal-note"><li><a href="https://4citeb4u.github.io/LEEWAY-DEVICE-BRIDGE/" target="_blank" rel="noopener">Open the canonical Device Bridge installer</a> on your phone. If already installed, open your existing app first.</li><li>In LeeWay Device Bridge, tap ENABLE LOCAL AGENT SESSION, then ENABLE ALWAYS-ON REMOTE BRIDGE.</li><li>Tap SHOW PAIRING TOKEN. Enter that token and the LeeWay Device ID in the fields above, then tap Connect / recheck phone. Keep the token private; enter it only here.</li><li>Keep the foreground-service notification enabled. If the model reports verified, it is reused. Download a model in Device Bridge only if it is missing or unverified.</li></ol><p class="lal-note">If Android reports a package signature conflict, keep the installed app and its model. Do not uninstall it to force an update. Reconnect here after the phone comes online. <a href="https://4citeb4u.github.io/Leeway-live/" target="_blank" rel="noopener">LeeWay Live</a> uses this same bridge protocol.</p></details>
      <p class="lal-note">Optional Ollama connection — these controls apply to the configured Ollama runtime, not the paired phone.</p>
      <div class="lal-settings">
        <input data-setting="model" aria-label="Reasoning model" list="lal-models" />
        <input data-setting="endpoint" aria-label="Ollama endpoint" placeholder="https://your-runtime.example" />
      </div>
      <datalist id="lal-models"></datalist>
      <div class="lal-row"><button class="lal-btn" data-action="discover">Check models</button><button class="lal-btn" data-action="download">Download selected model</button><button class="lal-btn" data-action="cancel-download" hidden>Cancel download</button></div>
      <p class="lal-note" data-runtime-note>Only models exposed by your configured runtime can be detected and reused. This website cannot scan models in other phone apps. Download uses storage on that runtime. Browser-local Gemma is not configured.</p>
      <p class="lal-note">Agent Lee Voice One is provided by the external LeeWay Voice Fabric. Voice preparation is optional; directions and map controls work without it.</p>
      <div class="lal-row"><button class="lal-btn" data-action="voice-load">Connect Voice Fabric</button><button class="lal-btn" data-action="voice-test">Play voice sample</button><button class="lal-btn" data-action="voice-unload">Disconnect voice</button></div>
      </div><div class="lal-note" data-voice-status>Voice Fabric is not prepared. No voice engine is embedded in this map.</div>
      <p class="lal-note" data-talk-status>Talk is push-to-talk. It requests this browser’s microphone only when pressed, puts the transcript in the text field, and then asks Agent Lee. Recognition availability depends on the browser and its permission.</p>
    </div>
  `;
  const agentSlot =
    shell?.root?.querySelector?.('[data-agent-slot]') ||
    document.querySelector?.('#leeway-world-shell [data-agent-slot]');
  (agentSlot || document.body).appendChild(root);

  const setupToggle = root.querySelector('[data-action="setup-toggle"]');
  const setupPanel = root.querySelector('#lal-model-voice-setup');
  setupToggle.addEventListener('click', () => {
    const expanded = setupToggle.getAttribute('aria-expanded') !== 'true';
    setupToggle.setAttribute('aria-expanded', String(expanded));
    setupPanel.hidden = !expanded;
  });

  const status = root.querySelector('.lal-status');
  const log = root.querySelector('.lal-log');
  const input = root.querySelector('.lal-input');
  const modelInput = root.querySelector('[data-setting="model"]');
  const endpointInput = root.querySelector('[data-setting="endpoint"]');
  const sendButton = root.querySelector('[data-action="send"]');
  const voiceButton = root.querySelector('[data-action="voice"]');
  const talkButton = root.querySelector('[data-action="talk"]');
  const talkStatus = root.querySelector('[data-talk-status]');
  const voiceStatus = root.querySelector('[data-voice-status]');
  const runtimeNote = root.querySelector('[data-runtime-note]');
  const provider = root.querySelector('[data-setting="provider"]');
  const phoneStatus = root.querySelector('[data-phone-status]');
  const phone = new PhoneRelay();
  const history = [];
  let generation = 0;
  let replyController = null;
  let downloadController = null;
  let probeEpoch = 0;
  let voiceEnabled = loadSetting('leeway.agentLee.voice', 'on') !== 'off';
  const copilotMedia = new BrowserCopilotMedia((event) =>
    console.info('Agent Lee media:', event),
  );
  let talking = false;
  let talkEpoch = 0;
  const conversationStatus = root.querySelector('.lal-conversation-status');
  function conversationState(phase, message) {
    root.dataset.phase = phase;
    if (message) conversationStatus.textContent = translate(message);
  }
  // The wave is a conversation-state animation, not a measured audio waveform.
  const statusObserver = new MutationObserver(() => {
    if (!talking && voiceStatus.textContent)
      conversationStatus.textContent = voiceStatus.textContent;
  });
  statusObserver.observe(voiceStatus, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  function syncTalkButton(state = '') {
    talkButton.setAttribute('aria-pressed', String(talking));
    talkButton.textContent = state || (talking ? 'LISTENING…' : 'TALK');
    root
      .querySelector('[data-action="voice-talk"]')
      .setAttribute('aria-pressed', String(talking));
  }

  function syncVoiceButton(state = '') {
    voiceButton.setAttribute('aria-pressed', String(voiceEnabled));
    voiceButton.textContent =
      state || (voiceEnabled ? 'VOICE ON' : 'VOICE OFF');
  }

  const fabricVoice = createVoiceFabricAdapter({ onState(state) {
    voiceStatus.textContent = state.message || `Voice Fabric: ${state.status}`;
  } });
  let voiceReady = false;
  let speechEpoch = 0;
  function stopVoicePlayback() {
    speechEpoch++;
    conversationState('idle');
    void fabricVoice.stop({ mute: !voiceEnabled }).catch(() => {});
  }
  async function speakAgentLee(content) {
    if (!voiceEnabled) return false;
    if (!voiceReady) {
      voiceStatus.textContent = 'Connect Voice Fabric to hear Agent Lee. Your text reply is ready.';
      return false;
    }
    const text = String(content || '').slice(0, MAX_SPOKEN_RESPONSE_CHARS);
    stopVoicePlayback();
    const epoch = speechEpoch;
    try {
      fabricVoice.resume();
      syncVoiceButton('SPEAKING');
      await fabricVoice.speak(text);
      if (epoch === speechEpoch) syncVoiceButton();
      return true;
    } catch (error) {
      if (epoch === speechEpoch) {
        voiceStatus.textContent = `Voice Fabric unavailable: ${error.message}. Text and map controls remain available.`;
        syncVoiceButton();
      }
      return false;
    }
  }

  syncVoiceButton();
  syncTalkButton();

  modelInput.value = loadSetting('leeway.agentLee.model', DEFAULT_MODEL);
  endpointInput.value = loadSetting(
    'leeway.agentLee.endpoint',
    DEFAULT_ENDPOINT,
  );

  function persist() {
    saveSetting(
      'leeway.agentLee.model',
      modelInput.value.trim() || DEFAULT_MODEL,
    );
    saveSetting(
      'leeway.agentLee.endpoint',
      endpointInput.value.trim() || DEFAULT_ENDPOINT,
    );
  }

  async function probe() {
    const epoch = ++probeEpoch;
    persist();
    const model = modelInput.value.trim() || DEFAULT_MODEL;
    const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;
    try {
      if (!endpoint)
        throw new Error('Set a model runtime URL to connect Agent Lee.');
      const state = await probeOllama({ endpoint, model });
      if (epoch !== probeEpoch) return state;
      root.querySelector('#lal-models').replaceChildren(
        ...state.models.map((name) => {
          const option = document.createElement('option');
          option.value = name;
          return option;
        }),
      );
      if (state.modelInstalled) {
        status.dataset.state = 'connected';
        status.textContent = `READY · ${model}${toolRuntime ? ` · ${toolRuntime.tools.length} TOOLS` : ''}`;
      } else {
        status.dataset.state = 'disconnected';
        status.textContent = `MODEL MISSING · ${model}`;
      }
      return state;
    } catch (error) {
      if (epoch !== probeEpoch)
        return { reachable: false, modelInstalled: false, models: [] };
      runtimeNote.textContent = `${error.message} Inventory is limited to your configured runtime; other phone apps are inaccessible.`;
      status.dataset.state = 'disconnected';
      status.textContent = 'LOCAL RUNTIME: DISCONNECTED';
      return { reachable: false, modelInstalled: false, models: [] };
    }
  }

  async function ask() {
    const content = input.value.trim();
    if (!content || sendButton.disabled) return;
    const epoch = ++generation;
    stopVoicePlayback();
    replyController = new AbortController();
    persist();
    appendEntry(log, 'user', content);
    input.value = '';
    sendButton.disabled = true;
    status.dataset.state = 'disconnected';
    status.textContent = 'CONNECTING TO SELECTED MODEL…';
    conversationState('thinking', 'Working on your request…');

    const model = modelInput.value.trim() || DEFAULT_MODEL;
    const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;
    const context = sceneContext(application);

    try {
      const systemAction = await executeCopilotCommand(content, shell);
      if (systemAction.handled) {
        if (epoch !== generation) return;
        history.push(
          { role: 'user', content },
          { role: 'assistant', content: systemAction.message },
        );
        if (history.length > 24) history.splice(0, history.length - 24);
        appendEntry(log, 'assistant', systemAction.message);
        status.dataset.state =
          systemAction.ok === false ? 'disconnected' : 'connected';
        status.textContent =
          systemAction.ok === false
            ? 'SYSTEM COPILOT · ACTION INCOMPLETE'
            : 'SYSTEM COPILOT · RESPONSE READY';
        void speakAgentLee(systemAction.message);
        return;
      }
      const phoneResult =
        provider.value === 'phone'
          ? await phone.infer(phonePrompt(content, shell, history))
          : null;
      const response = phoneResult
        ? { content: phoneResult.response, toolResults: [] }
        : await callOllama({
            endpoint,
            model,
            messages: [...history, { role: 'user', content }],
            context,
            toolRuntime,
            signal: AbortSignal.any([
              replyController.signal,
              AbortSignal.timeout(120000),
            ]),
          });
      if (epoch !== generation) return;
      history.push(
        { role: 'user', content },
        { role: 'assistant', content: response.content },
      );
      if (history.length > 24) history.splice(0, history.length - 24);
      appendEntry(log, 'assistant', response.content);
      status.dataset.state = 'connected';
      status.textContent = 'MODEL CONNECTED · VOICE STATUS BELOW';
      void speakAgentLee(response.content);
    } catch (error) {
      if (epoch !== generation) return;
      const message = `Agent Lee could not complete this request: ${error.message}. Check the runtime URL, model inventory, and permission for this app origin. Mapping remains available without AI.`;
      appendEntry(log, 'assistant', message);
      status.dataset.state = 'disconnected';
      status.textContent = 'LOCAL RUNTIME: DISCONNECTED';
      conversationState(
        'error',
        'The selected model is unavailable. Open the menu to connect it; your map still works.',
      );
      console.warn('Agent Lee local Gemma connection failed:', error);
    } finally {
      if (epoch === generation) {
        sendButton.disabled = false;
        if (
          root.classList.contains('lal-expanded') &&
          !document.body.classList.contains('leeway-drive-mode')
        )
          input.focus();
      }
    }
  }

  function stopTalking(message = '') {
    talkEpoch++;
    talking = false;
    copilotMedia.stopRecognition();
    syncTalkButton();
    conversationState('idle', message || 'Tap the microphone to talk.');
    if (message) talkStatus.textContent = message;
  }

  function beginTalking() {
    if (talking) {
      stopTalking('Talk stopped. You can type or press TALK again.');
      return;
    }
    stopVoicePlayback();
    const epoch = ++talkEpoch;
    talking = true;
    syncTalkButton();
    talkStatus.textContent = 'Listening… Speak your travel request.';
    conversationState('listening', 'Listening…');
    try {
      copilotMedia.startRecognition({
        language: getLanguage().speech,
        onInterim: (transcript) => {
          if (epoch !== talkEpoch) return;
          input.value = transcript;
          talkStatus.textContent = `Listening: ${transcript}`;
          conversationStatus.textContent = transcript;
        },
        onFinal: (transcript) => {
          if (epoch !== talkEpoch || !transcript) return;
          input.value = transcript;
          stopTalking('Voice request captured. Agent Lee is responding.');
          void ask();
        },
        onError: (error) => {
          if (epoch === talkEpoch)
            stopTalking(
              `Microphone transcription: ${error.message}. Type your request instead.`,
            );
        },
        onEnd: () => {
          if (epoch !== talkEpoch || !talking) return;
          talking = false;
          syncTalkButton();
          conversationState('idle', 'Tap the microphone to talk again.');
          talkStatus.textContent = input.value.trim()
            ? 'Transcript ready. Press ASK to send.'
            : 'No speech captured. Type your request or try TALK again.';
        },
      });
    } catch (error) {
      stopTalking(error.message);
    }
  }

  root.querySelector('[data-action="stop"]').addEventListener('click', () => {
    generation++;
    replyController?.abort();
    stopTalking();
    stopVoicePlayback();
    syncVoiceButton();
    sendButton.disabled = false;
    status.textContent =
      'REPLY STOPPED · any phone computation may finish remotely';
  });
  root
    .querySelector('[data-action="route-review"]')
    .addEventListener('click', () => {
      input.value =
        'Review my current route, explain its limits, and suggest how I could reduce fuel use.';
      void ask();
    });
  root
    .querySelector('[data-action="route-optimize"]')
    .addEventListener('click', async () => {
      try {
        if (!shell?.routePlanner) throw new Error('Open route planning first.');
        const result = await shell.routePlanner.optimize();
        if (!result)
          throw new Error(
            'The planner needs your input or could not calculate this route. Check the route panel.',
          );
        appendEntry(
          log,
          'assistant',
          'The route planner completed the optimization request. Review the route panel for the resulting order, distance, and any restriction warnings.',
        );
      } catch (error) {
        appendEntry(
          log,
          'assistant',
          `Optimization unavailable: ${error.message}`,
        );
      }
    });
  root
    .querySelector('[data-action="pair"]')
    .addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const device = root.querySelector('[data-setting="device"]').value;
        const token = root.querySelector('[data-setting="token"]').value;
        phoneStatus.textContent = 'Connecting to LeeWay phone relay…';
        const connection = await phone.connect(device, token);
        if (!connection.phoneOnline)
          throw new Error(
            'Relay authenticated, but the phone is offline. Open Device Bridge and reconnect.',
          );
        const inventory = await phone.modelStatus();
        const state = inventory?.status || inventory;
        phoneStatus.textContent = `Phone model: ${state?.modelId || 'reported by bridge'} · ${state?.verified === true ? 'verified; reused without download' : 'not verified; prepare model in Device Bridge'}`;
        status.textContent =
          state?.verified === true
            ? 'PHONE MODEL READY'
            : 'PHONE MODEL NEEDS PREPARATION';
        status.dataset.state =
          state?.verified === true ? 'connected' : 'disconnected';
      } catch (error) {
        phoneStatus.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  root.querySelector('[data-action="unpair"]').addEventListener('click', () => {
    generation++;
    phone.disconnect();
    root.querySelector('[data-setting="token"]').value = '';
    phoneStatus.textContent = 'Phone disconnected; pairing token cleared.';
  });
  root
    .querySelector('[data-action="discover"]')
    .addEventListener('click', probe);
  root.querySelector('[data-action="voice-load"]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const epoch = speechEpoch;
    try {
      await fabricVoice.prepare();
      if (epoch === speechEpoch) voiceReady = true;
    } catch (error) {
      voiceStatus.textContent = `Voice Fabric unavailable: ${error.message}. Text remains available.`;
    } finally { button.disabled = false; }
  });
  root.querySelector('[data-action="voice-unload"]').addEventListener('click', () => {
    stopVoicePlayback();
    fabricVoice.destroy();
    voiceReady = false;
    voiceStatus.textContent = 'Voice Fabric disconnected.';
  });
  root
    .querySelector('[data-action="voice-test"]')
    .addEventListener('click', () => {
      if (!voiceEnabled) {
        voiceStatus.textContent = 'Turn Voice on to play the selected sample.';
        return;
      }
      const samples = {
        en: 'I am Agent Lee, your LeeWay copilot. Your map remains available.',
        es: 'Soy Agent Lee, tu copiloto de LeeWay. Tu mapa sigue disponible.',
        fr: 'Je suis Agent Lee, votre copilote LeeWay. Votre carte reste disponible.',
        zh: '我是 LeeWay 的副驾驶 Agent Lee。您的地图仍然可用。',
        ru: 'Я Agent Lee, ваш помощник LeeWay. Карта остаётся доступной.',
        mn: 'Би таны LeeWay туслах Agent Lee. Газрын зураг нээлттэй хэвээр байна.',
      };
      void speakAgentLee(samples[getLanguage().code] || samples.en);
    });
  root
    .querySelector('[data-action="cancel-download"]')
    .addEventListener('click', () => downloadController?.abort());
  root
    .querySelector('[data-action="download"]')
    .addEventListener('click', async (event) => {
      if (downloadController) return;
      const button = event.currentTarget;
      const cancel = root.querySelector('[data-action="cancel-download"]');
      downloadController = new AbortController();
      button.disabled = true;
      cancel.hidden = false;
      try {
        await prepareModel({
          endpoint: endpointInput.value.trim(),
          model: modelInput.value.trim() || DEFAULT_MODEL,
          signal: downloadController.signal,
          onProgress: (row) => {
            runtimeNote.textContent =
              row.status +
              (row.total
                ? ' · ' + Math.round((row.completed / row.total) * 100) + '%'
                : '') +
              ' · configured runtime storage';
          },
        });
        runtimeNote.textContent =
          'Model verified in the configured runtime. Existing complete models are reused.';
        await probe();
      } catch (error) {
        runtimeNote.textContent = downloadController.signal.aborted
          ? 'Download request cancelled. Recheck the runtime before retry.'
          : 'Model preparation failed: ' + error.message;
      } finally {
        downloadController = null;
        button.disabled = false;
        cancel.hidden = true;
      }
    });
  sendButton.addEventListener('click', ask);
  root.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.command || '';
      void ask();
    });
  });
  talkButton.addEventListener('click', beginTalking);
  root
    .querySelector('[data-action="voice-talk"]')
    .addEventListener('click', beginTalking);
  root
    .querySelector('[data-action="conversation-menu"]')
    .addEventListener('click', (event) => {
      const expanded = root.classList.toggle('lal-expanded');
      event.currentTarget.setAttribute('aria-expanded', String(expanded));
    });
  root.addEventListener('leeway:agent-open', () => {
    root.classList.remove('lal-expanded');
    root
      .querySelector('[data-action="conversation-menu"]')
      .setAttribute('aria-expanded', 'false');
    if (!talking) beginTalking();
  });
  root.addEventListener('leeway:agent-close', () => {
    stopTalking();
    stopVoicePlayback();
  });
  root.querySelector('[data-action="close"]').addEventListener('click', () => {
    stopTalking();
    if (shell?.closeAgent) shell.closeAgent();
    else root.classList.remove('leeway-open');
  });
  voiceButton.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    saveSetting('leeway.agentLee.voice', voiceEnabled ? 'on' : 'off');
    if (!voiceEnabled) stopVoicePlayback();
    syncVoiceButton();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') ask();
  });
  modelInput.addEventListener('change', () => {
    persist();
    void probe();
  });
  endpointInput.addEventListener('change', () => {
    persist();
    void probe();
  });

  status.textContent = 'MAP READY · OPTIONAL ADVANCED MODEL NOT CONNECTED';
  provider.addEventListener('change', () => {
    generation++;
    replyController?.abort();
    stopVoicePlayback();
    sendButton.disabled = false;
    if (provider.value === 'ollama') void probe();
    else
      status.textContent = phone.connected
        ? 'PHONE RELAY CONNECTED · CHECK MODEL STATUS'
        : 'PHONE NOT PAIRED';
  });

  return {
    root,
    ask,
    probe,
    destroy() {
      generation++;
      replyController?.abort();
      downloadController?.abort();
      phone.disconnect();
      stopTalking();
      stopVoicePlayback();
      fabricVoice.destroy();
      statusObserver.disconnect();
      root.remove();
    },
  };
}
