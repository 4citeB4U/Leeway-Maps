# Map-first Logistics

Open Directions without signing in or enabling Agent Lee. Search and select real street addresses; ordinary inputs reject coordinate pairs. My Location requests a fresh GPS fix, sets the origin and reverse-geocodes its address. Add up to ten intermediate stops; reorder by position, reverse, remove, cancel or clear them. The map-pin tool requires confirmation before adding a stop. Save addresses locally, recall session recents, or import/export CSV and JSON address lists. Default stop optimization uses a directed road-distance matrix with fixed start/end locations and can be disabled. Distance reduction is a fuel proxy, not a fuel-consumption model or guaranteed saving.

Go opens Drive Mode with GPS speed, remaining distance, next maneuver and optional camera following. Poor, stale or off-route fixes pause guidance; automatic rerouting and background Android navigation are not qualified. Exit or route changes stop the watcher. The custom install button is removed; installation uses the browser's standard PWA menu. The header uses the exact supplied Gemini logo asset; see public/LOGO-PROVENANCE.md.

## Android address sharing and offline trips

After Chrome installs LeeWay Logistics, it registers as an Android share target. From a compatible map or address app, use **Share** and choose **LeeWay Logistics**. A supplied street address, or a Google Maps link containing an address query, is placed in LeeWay’s destination field. The driver still selects the matching address and requests the route. Android does not let a web PWA take over Google Maps' private `geo:`/navigation intent or replace Google Maps as the system default; a native Android wrapper with verified intent filters would be required for that exact chooser behavior.

When a road route is calculated, one bounded local copy of its geometry, stop labels and turn directions is saved on that browser profile. If the app is reopened without a connection, the offline trip view shows the saved path, stop sequence and directions and can use fresh GPS only after the driver presses **Use GPS on saved trip**. It deliberately has no street basemap, traffic, CCTV, weather, price data, fresh hazard data or automatic rerouting. It does not store GPS history. The driver can delete the saved trip on the normal planner or offline trip page.

New arbitrary offline road routing, street-address search and a live offline basemap require an installed regional map/geocoder/routing pack such as a maintained Valhalla graph plus offline tiles. The browser PWA currently does not ship a nationwide road pack; the locally verified Valhalla build covers Washington, DC only. A phone model does not contain road geometry or current road data by itself.

## Routing and vehicle settings

Passenger preview uses public OSRM. Commercial profiles require a configured Valhalla endpoint; they do not silently fall back to passenger routing. Set the HTTPS endpoint in Directions or build with `VITE_LEEWAY_VALHALLA_URL`. HTTP is accepted only for loopback development. Route and matrix requests carry the same vehicle dimensions, weight, axle load/count, hazmat and toll preferences. Human-facing kg values become metric tonnes in Valhalla payloads.

Prefer toll-free uses `use_tolls=0`. Strict exclusion requires an operator-enabled `allow_hard_exclusions` server and rejects ignored-option warnings or routes with unverified toll flags. Toll avoidance does not calculate toll charges. Oversize permits and missing OSM restrictions remain unverified. The app never certifies a route as truck-safe merely because Valhalla returned it.

See [portable Valhalla setup](../../../integrations/valhalla/README.md). The checked local runtime covers Washington, DC only. A nationwide graph, its storage/RAM capacity, HTTPS hosting, operational monitoring and regional updates have not been deployed. Loopback on this computer is not an Android-accessible endpoint.

## Road stops and fuel

Road stops searches OpenStreetMap within 15 km of the map center, returning up to 100 mapped fuel stations, rest areas, truck parking, weighbridges/weigh stations, toll points or construction features. These are incomplete mapped records: parking availability, station prices, operating status and current construction closures are not inferred.

Regional Estimates are dated EIA weekly diesel benchmarks. The build refreshes `public/fuel-benchmark.json` using `node scripts/refresh-fuel-benchmark.mjs`; if EIA is unavailable, the dated previous snapshot remains. The UI marks snapshots older than ten days. Reported Station Prices are separate, explicitly unverified driver reports stored on this browser only, with fuel type and timestamp. Station prices are not shared by the road-hazard backend. Trip fuel cost uses route distance, entered consumption and the selected price; it excludes unknown toll costs. The fuel advisor compares up to three recently reported diesel stations against actual road detours using the selected routing profile, purchase quantity and maximum detour. It does not invent live prices, prove the cheapest station across the whole corridor, or plan tank range.

## Private communications and community reports

Talk opens a separate peer workspace or splits the map. Operator-provisioned accounts have server-authenticated individual identities and organization-scoped opt-in discovery. An invitation must be accepted before WebRTC text, push-to-talk audio or video starts. Closing or ending a channel releases media. Video is disabled during Drive Mode. See [peer setup](PRIVATE-PEER-COMMUNICATIONS.md).

Report supports approximate-location police, congestion and debris reports, with source labels and expiration. Sharing requires a configured server and operator-issued write token; it never presents unsent reports as broadcast. See [community reports](COMMUNITY-HAZARD-REPORTS.md). The [Vercel adapter](VERCEL-SHARED-SERVICE.md) uses durable Redis state across instances. Neither Vercel nor Redis has been provisioned by this change. TURN service and two-phone media qualification remain required for reliable mobile calls.

## Weather and hazards

Static hosting can fetch NOAA radar, satellite clouds/infrared and GOES lightning density directly. Observation timestamps and coverage are exposed; lightning density is not a worldwide individual-strike service. Direct NIFC wildfire perimeters and USGS earthquakes remain available. Partial or failed perimeter downloads preserve the previous snapshot and its timestamp. FIRMS thermal hotspots require a configured backend/key. There is no verified landslide feed, nationwide road-closure feed or automatic hazard-aware detour engine.

## Android and Agent Lee

Install the HTTPS app using Chrome's Install app/Add to Home screen menu. Maps and new routes require connectivity; the offline screen is not offline navigation. The service worker does not cache live route/weather responses as current data.

Follow [Phone and voice setup](PHONE-PWA-ADAPTER.md) to pair LeeWay Device Bridge through the existing Leeway-live relay. Enter the pairing token in the app, not a chat. The bridge reports models owned by its runtime; a website cannot inventory arbitrary models in other Android apps. Compatible verified models are reused. Chatterbox is an explicit optional browser download of about 1.5 GB, with cache reuse, cancellation and unloading. Physical Android pairing, model inference and acoustic voice quality still require device verification.

The Device Bridge application is the model authority. The currently inspected bridge contract exposes its configured runtime model and does not scan every Android app or private model file. A Gemma model can be used only after the bridge itself reports it as a compatible, verified runtime. Do not re-download or replace a verified phone model merely to connect Logistics.

## Validation and release status

This change is prepared for review, not a production navigation certification. Production build and focused routing, weather, fuel, agent and adapter tests are checked. The inherited full suite has 48 failures reproduced on the unchanged base; the comparison before the final targeted fixes found the same 48 failure identities. Existing aggregate package-boundary ownership failures also remain. Runtime receipts for the DC Valhalla service are in `integrations/valhalla`.

Browser checks cover real Chicago address selection/road geometry, cancel/clear, roadside results, NOAA observation metadata, responsive 390-pixel layout, Agent setup and production service-worker scope. A later real-address check routed 50 Massachusetts Avenue NE to 1100 New Jersey Avenue SE in Washington, DC (3.1 km), saved the start address, and entered/exited Drive Mode. Actual host geolocation timed out; no physical GPS guidance is claimed. Two independently signed-in local browser clients accepted an invitation, exchanged WebRTC text in both directions, split the map, and ended the channel. Voice/video on physical phones remains untested. Public geocoding, tiles and routing services have usage policies and availability limits; self-hosting eliminates per-request routing license fees, not infrastructure costs or attribution obligations.
