# Bay Area regional vehicle positions

Set `SF_BAY_511_API_KEY` only in the API server/Vercel environment. Never use a `VITE_` prefix or commit a token. The browser calls `/api/transit/vehicles/sf-bay-regional`; only the server inserts the token into the fixed official HTTPS request. Missing credentials return503. Ordinary Transit layer auto-discovers the regional feed near San Francisco. The separate Transitland regional-network endpoint is unchanged.

[Official documentation](https://511.org/open-data/transit) specifies GTFS-Realtime VehiclePositions, `agency=RG`, and a default60requests/hour/token. The adapter uses125second process and downstream cache TTL; failures use backoff. Multiple apps/cold serverless instances can share a token quota, so this is not a distributed rate-limit guarantee. Provider429 is unavailable/backoff, never invented vehicles. More traffic needs a shared upstream cache or an authorized quota increase.

[Agreement](https://511.org/sites/default/files/2026-04/511_Data_Agreement_Final_2026.pdf): retain the nearby linked “data provided by511.org” attribution. Do not imply endorsement or use supplier logos. Registered disseminators must provide launch documentation to MTC within30days; user/owner handles that external communication. No message sent by this change.

Coordinates come from protobuf VehiclePositions. No route-mode guess or synthetic locations. Timetables, tripupdates and stoparrivals are not implemented by this adapter. Tests use synthetic protobuf fixtures; parent must verify actual authenticated production response separately. Token value is never returned in catalog, snapshot provenance or errors; credentialed redirects are rejected.
