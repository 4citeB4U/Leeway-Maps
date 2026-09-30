# Platform and authority status

## Existing, implemented and still unverified

Both products have independent scoped PWA identities, icons, service workers and saved-trip offline pages. The worker excludes live APIs, TTS, routes and private responses. `node scripts/check-installable.mjs public` validates required local artifacts. It does not test installation on each OS. Full offline maps, offline geocoding and rerouting are not implemented by the saved-trip viewer.

No APK/AAB, iOS archive, desktop installer or store submission is built by this change. The appropriate mobile packaging lane is Capacitor with each app's own bundle identity, local production assets, native GPS permission descriptions, HTTPS API endpoint and device tests. iOS requires its Xcode/macOS toolchain; each store requires signing/account setup and review. Capacitor supports wrapping an existing web app: https://capacitorjs.com/docs . Apple review applies to the actual submitted functionality: https://developer.apple.com/app-store/review/guidelines/ . Browser installability does not imply store acceptance, CarPlay or Android Auto support.

## External authorities

`src/leeway/voiceFabric.js` lazily imports the canonical external Voice Fabric SDK. The engine, reference clip, streaming queue and package registry remain at the Fabric origin. It selects `agent-lee-voice-one`, verifies preparation identity, supports stop/mute and never falls back to a system voice. Prepare must follow a user gesture and real browser/audio qualification remains necessary. Fabric source was inspected in `4citeB4U/LeeWay-Voice-Fabric`; source access is not playback evidence.

`server/providers/leeway-ecosystem.js` exposes bounded read-only health via its provider plugin. Configure server-only `LEEWAY_FORMULA_BASE_URL` (HTTPS) and optional `LEEWAY_FORMULA_TOKEN`. It does not fall back to localhost. Formula health is only a diagnostic, always labeled task evaluation NOT_EXECUTED. Its server-only evaluate method uses the canonical transport client copied from `Leeway-formula-live/scripts/formula-client.mjs`; no Formula mathematics is embedded. Evaluation requires real 16x6 observations, approved mapping/source/authorization, and retains EXECUTED/UNVERIFIED distinction. No public arbitrary-evaluation endpoint is exposed. A mapping from map tasks to this matrix is not verified.

Agent Skills offers authenticated Streamable HTTP MCP at `/mcp`, with the official MCP SDK client and `read_leeway_skill` tool. Reading a skill returns documentation, not domain execution. `LEEWAY_SKILLS_MCP_URL` currently records configuration only; the status explicitly says NOT_CONNECTED. Do not invent a REST `/skills` API. Credentials belong on the server; no public MCP passthrough should expose arbitrary tools.

## Gemini attachment requirements and outstanding gaps

The attachment dated in this task contains historical suggestions and inaccurate blanket claims; compare actual source/runtime evidence before treating its examples as implementations. Distinct requested groups:

- Public HTTPS APIs and separate personal/business products: deployed, with live provider health verified separately by parent.
- CCTV national/international catalog, retry, source provenance and camera orientation: CCTV lane; catalog coverage does not establish live frames in every jurisdiction.
- Airline identity, arrival/departure airports/times, distinguishable moving planes, original cockpit: aircraft lane; no fabricated schedule completion.
- Transit bus/train routes, stops, live vehicles/countdowns/delays/alerts, walking transfers and worldwide discovery: mapped OSM routes/stops work for four tested cities; Transitland adapters exist but require credentials/provider access. Mapped shape is not a timetable. Full multimodal transfer planner remains a gap.
- Live rain radar/NWS hazards and traffic congestion/incidents: sources exist; freshness and current production behavior must be checked independently.
- Familiar directions: From/To, swap, driving/walking/biking, route steps, geolocation and saved searches implemented. Truck restriction routing requires verified Valhalla data; wheelchair guarantees, entrances/gates, indoor floors, true lane metadata and complex interchange guidance remain data-dependent gaps.
- Search along route, open hours, detour ETAs, fuel/charging/repair stops, toll/ferry/highway preferences, parking timer, speedometer/posted limits and hazard reporting: inspect provider-specific support; do not infer Google-equivalent live business crowding, prices or restrictions from a POI pin.
- Native mobile apps, desktop download, CarPlay/Android Auto, cross-device continuity, live sharing, collaborative lists, timeline and calendar/reservation import: require distinct native/account/privacy integration; a PWA manifest alone does not deliver them.
- Offline rectangular region/vector packages, offline address lookup and rerouting: outstanding beyond saved-trip geometry/instructions.
- Mobile thumb controls, bottom sheets, one-finger zoom, original visual effects and voice command/tool access: require touch/browser acceptance. Formula and deterministic mapping core must stay LLM independent; complex language reasoning may be optional.
- Business dispatch triangles, commercial restrictions, freight gates, fuel cost and cargo layers must remain separate from personal commuter/passenger tools.

Priority is verified working navigation and current sources, then native package/device qualification, then licensed offline/navigation datasets and account features. No Google proprietary telemetry, historical imagery, crowdsourcing volume, AR positioning or store approval is implied.
