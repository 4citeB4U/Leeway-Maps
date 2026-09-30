import * as Cesium from 'cesium';
import { discoverModels, prepareModel, runtimeBase } from './agentRuntime.js';
import { PhoneRelay } from './phoneRelay.js';
import { loadBrowserVoiceLibrary, voiceStorageStatus } from './browserVoice.js';
import { createAgentLeeToolRuntime } from './agentLeeTools.js';
import { BrowserCopilotMedia } from './browserCopilotMedia.js';
import { executeCopilotCommand } from './copilotCommands.js';
import { requestCloneSpeech } from './cloneVoice.js';
import { mapIcon } from './mapIcons.js';
import { getLanguage, translate } from './experienceLocale.js';

const DEFAULT_MODEL = 'gemma4:e4b';
const DEFAULT_ENDPOINT = '';
const AGENT_LEE_TTS_ENDPOINT = '';
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
  const isPersonal = document.body?.dataset?.leewayEdition === 'personal';
  return [
    `You are Agent Lee, the explicit copilot inside ${isPersonal ? 'LeeWay Maps' : 'LeeWay Logistics — Transit World'}.`,
    `Reply in the user's selected language: ${getLanguage().name} (${getLanguage().code}). Preserve addresses, proper names, source timestamps and numerical facts.`,
    'You work beside the driver, dispatcher, fleet manager and traveler. The deterministic LeeWay map and operations system owns route geometry, records, source timestamps and hard restrictions. You translate intent, request approved capabilities, explain evidence, and never pretend to replace human dispatch authority.',
    'LeeWay principle: AI should increase human capability, not replace human responsibility.',
    'LeeWay context funnel: HUMAN, DEVICE/SYSTEM, AGENT, INTENT, ENVIRONMENT, PLATFORM, CAPABILITY, AUTHORITY, PERMISSION, STATE, HISTORY, RISK, CONNECTIVITY, EVIDENCE, RECOVERY, ADAPTATION.',
    'LeeWay execution discipline: Investigate → Diagnose → Plan → Implement → Test → Validate → Repair → Retest → Verify → Evidence. First success is not completion.',
    'Do not claim the canonical LeeWay Formula executed unless a verified Formula receipt is present.',
    'Your role is to act as a logistics super-expert for drivers, dispatchers, fleet managers, transportation agencies, brokers, shippers, HR teams, maintenance teams, terminals, warehouses, rail, marine/intermodal operations, and executive operators.',
    'For action requests, use the available LeeWay tools before answering. Never claim a map, layer, CRM workspace, onboarding flow, tracking action, camera movement, route, or record opened unless the tool result says ok=true.',
    'For questions about what the operator is looking at, use get_entity_context or get_current_view_state before explaining the scene. For analytical counts or nearest/fastest/highest questions over loaded world data, use analyst_query.',
    'For domain-specific logistics, HR/onboarding, fleet, routing, municipal transit, rail, marine/intermodal, facilities, CRM, or evidence questions, call get_logistics_knowledge for the relevant topic before giving detailed operational guidance.',
    isPersonal
      ? 'This is the separate personal mapping product. Help with routes, trip planning, weather, cameras, traffic, roadside places and travel context. Do not expose or claim access to business CRM, employee, fleet, load-board, onboarding or dispatch records.'
      : 'Use open_enterprise_workspace and start_onboarding for CRM, HR, employee, equipment, document, integration, and company onboarding requests. Use locate_enterprise_record when the operator names an employee, unit, customer, broker, terminal, or facility.',
    isPersonal
      ? ''
      : 'Use open_dispatch_load_planning when a dispatcher needs to compare loads or build a home-base triangle. This product is the business logistics application; do not claim that its former personal map mode still exists.',
    'Preserve source/provenance state when discussing live layers. Never turn stale, fallback, training, or unavailable data into a live-data claim.',
    'Never claim a route is truck-safe unless verified truck restriction evidence is present.',
    'Treat OSRM car routes as visual/base routes only.',
    'Treat TRAINING_DEMO data as demonstration data, never live GPS or production records.',
    'Keep answers operational, concise, and evidence-aware.',
    context ? `Current map camera context: ${JSON.stringify(context)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
    'You are Agent Lee in LeeWay Logistics. Be clear, calm and concise. Give advice only; you cannot execute map tools through this phone adapter.',
    `Reply in ${getLanguage().name} (${getLanguage().code}); preserve route addresses and numbers.`,
    'Never claim truck clearance, current hazards, minimum fuel cost, Chatterbox speech or Formula execution without verified evidence. Passenger road routes are previews. The Optimize stops button uses road distance, not truck restrictions or live traffic.',
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
      <div class="lal-kicker">LEEWAY LOGISTICS · COPILOT</div>
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
        <div class="lal-entry"><strong>AGENT LEE · COPILOT</strong>\nWelcome. I work beside you while the map and dispatch systems keep the route, source, and restriction facts. Connect a compatible model runtime to ask for help. Truck routes require verified restriction data.</div>
      </div>
      <div class="lal-row">
        <input class="lal-input" aria-label="Ask Agent Lee" placeholder="Ask about a load, route, driver, facility, maintenance, CRM, or fleet..." />
        <button class="lal-btn" type="button" data-action="send">ASK</button>
        <button class="lal-btn" type="button" data-action="talk" aria-pressed="false">TALK</button>
        <button class="lal-btn" type="button" data-action="voice" aria-pressed="true">VOICE ON</button>
      </div>
      <div class="lal-row"><button class="lal-btn" data-action="route-review">Review route</button><button class="lal-btn" data-action="route-optimize">Optimize stops</button></div>
      <div class="lal-quick" aria-label="System copilot controls"><button class="lal-btn" data-command="Open directions">Directions</button><button class="lal-btn" data-command="Open dispatch load planning">Load triangle</button><button class="lal-btn" data-command="Show weather radar">Weather</button><button class="lal-btn" data-command="Show CCTV cameras">CCTV</button></div>
      <button class="lal-btn" type="button" data-action="stop">Stop reply</button><details><summary>Model and voice setup</summary>
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
      <label>Voice provider<select class="lal-input" data-setting="voice-provider"><option value="browser">Chatterbox · on this device</option><option value="kernel">LeeWay verified clone service</option><option value="http">External audio adapter</option></select></label>
      <button class="lal-btn" type="button" data-action="voice-test">Play voice sample</button>
      <div class="lal-row"><button class="lal-btn" data-action="voice-check">Check voice storage</button><button class="lal-btn" data-action="voice-load">Prepare Chatterbox (~1.5 GB)</button><button class="lal-btn" data-action="voice-unload">Unload / cancel</button></div>
      <p class="lal-note">Optional Chatterbox download uses this browser's storage and network. Complete cached model files are reused. Voice One · calm delivery · 1.1× pace. Phone speed and voice quality require an audition. Mapping never requires this download.</p>
      <details><summary>Voice service address</summary><label>Audio endpoint<input class="lal-input" data-setting="tts" aria-label="External speech adapter URL" placeholder="https://your-voice-service.example/tts" /></label><p class="lal-note">LeeWay clone mode verifies the service's voice identity, then loads its returned audio file. The generic external adapter must return audio directly. Configure an address reachable from this device; localhost on a phone means that phone. No different voice is substituted when a service fails.</p></details>
      </details><div class="lal-note" data-voice-status>Browser Chatterbox is available to prepare. No voice model has been downloaded by this page.</div>
      <p class="lal-note" data-talk-status>Talk is push-to-talk. It requests this browser’s microphone only when pressed, puts the transcript in the text field, and then asks Agent Lee. Recognition availability depends on the browser and its permission.</p>
    </div>
  `;
  document.body.appendChild(root);

  const status = root.querySelector('.lal-status');
  const log = root.querySelector('.lal-log');
  const input = root.querySelector('.lal-input');
  const modelInput = root.querySelector('[data-setting="model"]');
  const endpointInput = root.querySelector('[data-setting="endpoint"]');
  const sendButton = root.querySelector('[data-action="send"]');
  const voiceButton = root.querySelector('[data-action="voice"]');
  const talkButton = root.querySelector('[data-action="talk"]');
  const talkStatus = root.querySelector('[data-talk-status]');
  const ttsInput = root.querySelector('[data-setting="tts"]');
  const voiceStatus = root.querySelector('[data-voice-status]');
  const runtimeNote = root.querySelector('[data-runtime-note]');
  const provider = root.querySelector('[data-setting="provider"]');
  const phoneStatus = root.querySelector('[data-phone-status]');
  const voiceProvider = root.querySelector('[data-setting="voice-provider"]');
  let browserVoice = null;
  let voicePreparationEpoch = 0;
  const phone = new PhoneRelay();
  const history = [];
  let generation = 0;
  let replyController = null;
  let voiceController = null;
  let downloadController = null;
  let probeEpoch = 0;
  let voiceEnabled = loadSetting('leeway.agentLee.voice', 'on') !== 'off';
  let activeAudio = null;
  let activeAudioUrl = null;
  let queuedAudio = null;
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

  function stopVoicePlayback() {
    conversationState('idle');
    browserVoice?.stop();
    voiceController?.abort();
    voiceController = null;
    if (activeAudio) {
      try {
        activeAudio.pause();
      } catch {}
      activeAudio = null;
    }
    if (activeAudioUrl) {
      URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrl = null;
    }
    queuedAudio = null;
  }

  async function speakAgentLee(content) {
    if (!voiceEnabled) return false;
    const text = String(content || '')
      .trim()
      .slice(0, MAX_SPOKEN_RESPONSE_CHARS);
    if (!text) return false;
    conversationState('thinking', 'Preparing your voice reply…');
    if (voiceProvider.value === 'browser') {
      if (getLanguage().code !== 'en') {
        voiceStatus.textContent =
          'This Chatterbox adapter is qualified for English only. Choose a voice service that supports your selected language. No substitute was used.';
        conversationState('idle');
        return false;
      }
      if (!browserVoice?.ready) {
        voiceStatus.textContent =
          'Prepare Chatterbox in Model and voice setup to speak locally. Your text reply is ready.';
        return false;
      }
      stopVoicePlayback();
      const epoch = generation;
      const controller = new AbortController();
      voiceController = controller;
      try {
        await browserVoice.speak(text, {
          signal: controller.signal,
          onState: (message) => {
            if (epoch === generation && !controller.signal.aborted)
              voiceStatus.textContent = message;
          },
        });
        conversationState('idle');
        if (epoch === generation) syncVoiceButton();
        return true;
      } catch (error) {
        if (!controller.signal.aborted && epoch === generation)
          voiceStatus.textContent = `Browser voice unavailable: ${error.message}. Text remains available.`;
        return false;
      }
    }
    if (
      voiceProvider.value === 'http' &&
      provider.value === 'phone' &&
      !ttsInput.value.trim()
    ) {
      voiceStatus.textContent = 'Checking native phone speech capability…';
      try {
        const sensory = await phone.command('sensory.status');
        voiceStatus.textContent = `Native Android speech status: ${JSON.stringify(sensory).slice(0, 200)}. This is not Chatterbox. Remote playback is off until cancellation is available; configure the Chatterbox audio adapter for browser playback.`;
      } catch (error) {
        voiceStatus.textContent = `Phone voice unavailable: ${error.message}`;
      }
      return false;
    }
    if (!ttsInput.value.trim()) {
      voiceStatus.textContent =
        'Set your voice service address in Model and voice setup. Your text reply is ready.';
      return false;
    }
    stopVoicePlayback();
    const epoch = generation;
    const controller = new AbortController();
    voiceController = controller;
    syncVoiceButton('VOICE …');
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120000),
      ]);
      let blob;
      let verifiedVoice = false;
      if (voiceProvider.value === 'kernel') {
        voiceStatus.textContent =
          'Verifying LeeWay clone and preparing speech…';
        const speech = await requestCloneSpeech({
          endpoint: ttsInput.value.trim(),
          text,
          language: getLanguage().voice,
          signal,
        });
        blob = speech.blob;
        verifiedVoice = true;
      } else {
        const response = await fetch(runtimeBase(ttsInput.value.trim()), {
          signal,
          method: 'POST',
          headers: {
            Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, language: getLanguage().voice }),
        });
        if (!response.ok)
          throw new Error(`Agent Lee voice HTTP ${response.status}`);
        blob = await response.blob();
      }
      if (controller.signal.aborted || epoch !== generation || !voiceEnabled)
        return false;
      if (!blob.type.startsWith('audio/'))
        throw new Error('Speech adapter did not return audio');
      if (!blob.size) throw new Error('Agent Lee voice returned empty audio');
      voiceController = null;
      activeAudioUrl = URL.createObjectURL(blob);
      activeAudio = new Audio(activeAudioUrl);
      activeAudio.preload = 'auto';
      activeAudio.addEventListener(
        'ended',
        () => {
          stopVoicePlayback();
          syncVoiceButton();
        },
        { once: true },
      );
      try {
        await activeAudio.play();
        conversationState(
          'speaking',
          'Agent Lee is speaking. Tap the microphone to interrupt.',
        );
        syncVoiceButton('SPEAKING');
        voiceStatus.textContent = verifiedVoice
          ? 'Verified LeeWay clone audio playing. Audibility and microphone interruption still require device testing.'
          : 'Adapter audio playing. Voice identity and acoustic quality require device testing.';
      } catch (error) {
        queuedAudio = activeAudio;
        syncVoiceButton('PLAY VOICE');
        console.warn(
          'Agent Lee voice is ready but browser playback needs a click:',
          error,
        );
      }
      return true;
    } catch (error) {
      if (controller.signal.aborted || epoch !== generation) return false;
      voiceStatus.textContent = `Speech unavailable: ${error.message}. Text remains available.`;
      syncVoiceButton('VOICE !');
      console.warn('Agent Lee local clone voice failed:', error);
      setTimeout(() => syncVoiceButton(), 1800);
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

  ttsInput.value = loadSetting('leeway.agentLee.tts', AGENT_LEE_TTS_ENDPOINT);
  ttsInput.addEventListener('change', () => {
    stopVoicePlayback();
    saveSetting('leeway.agentLee.tts', ttsInput.value.trim());
    voiceStatus.textContent =
      'Speech adapter changed; unverified until a reply plays.';
  });
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
    talkStatus.textContent = 'Listening… Speak your logistics request.';
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
  const showVoiceStorage = async () => {
    const storage = await voiceStorageStatus();
    voiceStatus.textContent = `${storage.cachedFiles} Chatterbox files found in this browser's cache. ${storage.available === null ? 'Storage quota unavailable.' : `${(storage.available / 1e9).toFixed(1)} GB free; approximately ${(storage.required / 1e9).toFixed(1)} GB additional capacity required.`} Cache files are not proof of a loaded runtime.`;
    return storage;
  };
  root
    .querySelector('[data-action="voice-check"]')
    .addEventListener('click', () => {
      void showVoiceStorage().catch((error) => {
        voiceStatus.textContent = error.message;
      });
    });
  root
    .querySelector('[data-action="voice-load"]')
    .addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      const epoch = ++voicePreparationEpoch;
      try {
        const storage = await showVoiceStorage();
        if (!storage.enough)
          throw new Error(
            'Insufficient or unreported browser storage. Free space and retry. No model download started.',
          );
        const Voice = await loadBrowserVoiceLibrary();
        if (epoch !== voicePreparationEpoch) return;
        browserVoice ||= new Voice();
        await browserVoice.load((progress) => {
          if (epoch === voicePreparationEpoch)
            voiceStatus.textContent =
              progress.message ||
              `${progress.status || 'Preparing'} ${progress.file || ''}${Number.isFinite(progress.progress) ? ` ${Math.round(progress.progress)}%` : ''}`;
        });
        if (epoch === voicePreparationEpoch)
          voiceStatus.textContent = `Chatterbox ready on ${browserVoice.device}. Voice One, calm delivery. Ask a short question to audition; phone performance is not yet qualified.`;
      } catch (error) {
        if (epoch === voicePreparationEpoch)
          voiceStatus.textContent = `Chatterbox preparation: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  root
    .querySelector('[data-action="voice-unload"]')
    .addEventListener('click', async () => {
      voicePreparationEpoch++;
      stopVoicePlayback();
      const voice = browserVoice;
      browserVoice = null;
      await voice?.dispose();
      voiceStatus.textContent =
        'Chatterbox unloaded. Complete cached model files remain reusable; partial downloads are not promised resumable.';
    });
  const savedVoiceProvider = loadSetting(
    'leeway.agentLee.voiceProvider',
    'browser',
  );
  voiceProvider.value = ['browser', 'kernel', 'http'].includes(
    savedVoiceProvider,
  )
    ? savedVoiceProvider
    : 'browser';
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
  voiceProvider.addEventListener('change', () => {
    stopVoicePlayback();
    saveSetting('leeway.agentLee.voiceProvider', voiceProvider.value);
    syncVoiceButton();
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
    if (queuedAudio && voiceEnabled) {
      const audio = queuedAudio;
      queuedAudio = null;
      audio
        .play()
        .then(() => syncVoiceButton('SPEAKING'))
        .catch(() => syncVoiceButton('PLAY VOICE'));
      return;
    }
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

  status.textContent = 'PHONE NOT PAIRED · MAP READY WITHOUT AI';
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
      voicePreparationEpoch++;
      void browserVoice?.dispose();
      statusObserver.disconnect();
      root.remove();
    },
  };
}
