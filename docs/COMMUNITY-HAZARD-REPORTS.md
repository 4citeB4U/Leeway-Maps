# Shared driver road reports

Driver reports cover police presence, congestion, debris, crashes, road closures, construction, flooding, and ice. Every report is labeled **community / unverified**. No report is treated as an official incident, route clearance, or enforcement prediction.

## What actually shares data

`hazardReportsPlugin()` mounts `/api/hazard-reports` in the existing Vite development/preview API host. One enabled server process holds a shared, bounded memory store. Two clients of that same server can see a successfully posted report. The browser does not create a local report and pretend it was broadcast.

This is not global hosting, durable storage, moderation, or driver-account verification. Restarting the process clears reports. Multiple independent replicas do not share data. A production service needs a shared expiring database, individual account/session authorization, abuse controls/moderation, TLS, and a retention policy before broad deployment.

Enable an authorized server by setting both:

```text
LEEWAY_HAZARD_REPORTS_ENABLED=1
LEEWAY_HAZARD_REPORTS_WRITE_TOKEN=<operator-provided random secret, at least 24 characters>
```

Keep the token in server-side configuration. Never place it in a `VITE_*` variable, committed file, URL, screenshot, or app default. A trusted driver enters it in the reporting panel for this session only. The token is not saved to local storage. This shared posting token is a small-deployment access control, not proof of a driver's identity.

The default is **disabled**. A missing/short token or disabled service reports that nothing will be broadcast. Pages cannot host this API. Configure `VITE_LEEWAY_WORLD_API_URL` or enter the report-server HTTPS origin in the panel. A phone's `127.0.0.1` is that phone, not the workstation, and cannot provide a shared fleet service by itself. Local HTTP loopback is accepted only for development; remote token transport requires HTTPS.

The existing standalone CORS middleware permits `Authorization` and `Content-Type` plus OPTIONS for its allowlisted origins, including `https://4citeb4u.github.io`. Operators must explicitly configure additional trusted app origins. CORS is not authorization: POST always checks the bearer token. IP limits use the socket peer, never untrusted forwarded headers; a deployment behind a reverse proxy currently shares that proxy's quota.

## Deliberate publication flow

1. Center the map on an incident and select **Use map center**, or explicitly request **Use my location**.
2. Choose the observed incident type. Location selection alone sends nothing to the report service.
3. Read the disclosure, then press **Report to other drivers**. Only this action posts the report.
4. The panel displays publication only after a valid server acknowledgement. If the network fails after submission, publication is **unconfirmed**, not automatically retried; check nearby reports before submitting again.

Coordinates are rounded to three decimals before transmission and again on the server: approximately 110 meters north/south, with longitude precision varying by latitude. Rounding precision is not GPS accuracy; the UI reports available device accuracy. Normal UI shows the location on the map, not coordinate text. Names, free text, photos, plates, raw GPS tracks, and reporter identifiers are not accepted.

**Refresh reports within 10 km** explicitly sends the chosen rounded query location to the server. There is no automatic geolocation or background location publication. Local display expiry checks make no network calls. Reports reaching expiry are removed from markers and listings.

## Bounds and endpoint contract

- `GET /api/hazard-reports/status`: configuration state, no location required.
- `GET /api/hazard-reports?lat=...&lon=...&radiusKm=10`: nearby unexpired reports; radius 1–50 km, at most 100 records, explicit `truncated` flag.
- `POST /api/hazard-reports`, bearer authorization, JSON `{kind, lat, lon}`: HTTP 201 with `published:true`, `sharedScope:"clients-of-this-server"`, and the server-created report. No free-form fields.
- Report contains a server UUID, rounded location, kind, server creation/expiry times, `source:"community"`, and `verification:"unverified"`.
- Police and congestion expire after 30 minutes; debris/crash/flood/ice after 60; closure/construction after 120. Expired records are purged during store reads/writes.
- Capacity 5,000 reports. Request body 4 KiB, body deadline 10 seconds. Posting 6/minute per socket peer and 100/minute globally; reads/status 60/minute per peer and 600/minute globally.
- No report number is presented as a count of drivers, confirmations, official incidents, or people nearby. An empty feed never proves the road is clear.

## UI integration

```js
const panel = mountHazardReports({
  container: document.body,
  getMapPoint: () => currentMapCenter(), // {lat, lon}; queried only by a button press
  onReports: reports => updateCommunityMarkers(reports),
});
panel.root.hidden = true;
// Explicit Report dock action:
panel.root.hidden = false;
// On teardown:
panel.destroy();
```

`setPoint({lat,lon})` only stages a location. It never publishes. Marker callback receives only server-confirmed, unexpired records. A parent must preserve the community/unverified label and must not use these markers to certify a truck route.

## Verification

Run `node --test server/providers/hazardReports.test.mjs src/leeway/hazardReportsClient.test.mjs` from `apps/transit-world`. Tests use a temporary loopback HTTP server and independent clients to prove cross-client visibility, expiry, rejection of unconfigured/unauthorized writes, bounded results, request limits, coordinate rounding, and truthful handling of ambiguous network failures. These tests do not establish deployed public hosting or phone-to-phone connectivity.
