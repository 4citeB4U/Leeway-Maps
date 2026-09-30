# Phone, model and install boundaries

Source inspected: `4citeB4U/Leeway-live` commit `37c6be76079911cb62b79b08bc6bb46dd21836db`, `docs/phone-relay.js`; Device Bridge source at `81703f27bf6968909ef844863518bde73cde5323`, `RemoteCommandRouter` and `RemoteRelayService`. These sources define the actual relay client protocol consumed by `src/leeway/phoneRelay.js`.

Agent Lee setup defaults to the existing LeeWay Device Bridge phone route. The owner supplies device ID and pairing token from the phone. The token stays in tab memory, never localStorage. The browser sends the existing authenticated hello and capability command messages through `wss://agent-lee-x.vercel.app/api/device-relay`. A successful relay connection is distinct from the phone being online, model verification, and inference success. Nested model failures are checked.

`model.status` exposes one app-private model, not a phone-wide model inventory. Verified model files are reused; the current bridge has no remote model-install capability. If missing, prepare the model in the native bridge app. Do not redownload a verified model or uninstall the existing app merely to connect Logistics. Current native source names SmolLM2-360M-Instruct; this is distinct from the optional Ollama Gemma preference. Phone inference supplies advice with current route context; it does not silently execute browser tools. The explicit Optimize stops button invokes the route planner directly and reports its actual outcome.

The alternative Ollama adapter checks `/api/tags`, reuses installed models, and downloads only after the user presses Download selected model. `/api/pull` streams progress and inventory is rechecked before success. Downloads consume the configured runtime's storage, not necessarily the browser device. No automatic model substitution occurs.

Native `sensory.speak` uses Android TTS; it is not Chatterbox. The inspected relay has no speech cancellation capability, so automatic remote speech is not enabled. The actual browser Chatterbox adapter from `4citeB4U/RapidWebDev` commit `5b56120c7b896ad501cdd410995fac611b34ee1c` is now bundled under `public/agent-voice`, with pinned model/runtime dependencies and hash-verified approved Voice One reference. The default voice path is browser-local Chatterbox, explicitly prepared by the user after a storage check. Its approximately 1.5 GB model is separate from the phone's reasoning model. Browser caches can reuse complete files in this origin; no phone-wide or cross-origin inventory is claimed. Stop rejects late synthesis; Unload terminates the worker. Source lifecycle tests pass; phone speed and acoustic quality remain unqualified, and this UI does not capture microphone input.

An optional external HTTP audio adapter accepts `{text}` and returns audio. On 2026-09-28 at 06:45 UTC, the existing local `agent-lee-voice-kernel` at `http://127.0.0.1:8092` reported healthy and ready; `/voice-identity` reported **XTTS-v2**, voice ID `LEEWAY_VOICE::AGENT_LEE::DEFAULT_CLONE`, reference SHA-256 `30d4f63e070d150c857d1d02710163cd7863bb4a8210806e822b63292795320a`. Its `/tts` returns a JSON audio path consumed through `/audio/{filename}`; the existing Logistics Node proxy adapts that to an audio response. It is not Chatterbox and is not silently substituted. GitHub Pages cannot host that Node proxy or make a phone's localhost refer to this desktop.

## First Android pairing

1. On the phone, open [canonical Device Bridge installation](https://4citeb4u.github.io/LEEWAY-DEVICE-BRIDGE/). If installed, open the existing app first. The current package manifest controls which APK is available; do not pin a stale download link.
2. Tap **ENABLE LOCAL AGENT SESSION**, then **ENABLE ALWAYS-ON REMOTE BRIDGE**.
3. Tap **SHOW PAIRING TOKEN**. In Logistics → Agent Lee → Model and voice setup, enter the LeeWay Device ID and token, then **Connect / recheck phone**. Do not paste the token into chat or publish it.
4. Keep the phone's foreground-service notification enabled. A verified model is reused; download inside Device Bridge only when the native model is missing or unverified.
5. If Android rejects an update because of signatures, preserve the installed app/model and resolve package compatibility. Do not uninstall to force the update.

The actual relay source (`AGENT_LEE_X/api/device-relay.ts`) exposes initial `hello-ack.phoneOnline`, command errors such as `PHONE_OFFLINE`, and no presence broadcasts. Logistics permits a fresh status request after an offline result; a successful reply updates observed presence. Connect / recheck performs a fresh handshake after transport loss. Owner Disconnect clears the UI token and pending commands. Network recovery is explicit; no always-live connection is claimed.

The manifest, 192/512 icons, install help and scoped service worker support an installable web surface. Only the offline landing screen is cached. Maps, routes, hazards, API responses, speech and model files are never served stale by this worker. Offline map navigation is not implemented. Android/iOS installation and actual paired inference are not established by unit tests or a successful build.

Governance: canonical browser-agent, real-time-voice and portability contracts informed implementation. Source access is not runtime skill execution. No Formula task evaluation is claimed (`NOT_EXECUTED`).
