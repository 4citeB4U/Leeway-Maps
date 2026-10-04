# LeeWay Spatial Intelligence Gate

This directory stages two heavy spatial services outside the browser:

1. Overture Places PMTiles for global business/POI context.
2. Valhalla / Meili for deterministic Hidden-Markov road matching of noisy bus GPS traces.

## Overture

Overture publishes a global places.pmtiles artifact for each release. LeeWay reuses that canonical artifact by default instead of rebuilding tens of millions of place records unnecessarily.

Use scripts/spatial/sync-overture-places.sh in reference, download, extract, or build-from-parquet mode.

## Valhalla / Meili

The compose file provides a persistent Valhalla service. Point LEEWAY_VALHALLA_URL at it from the LeeWay World runtime.

No browser chooses an upstream URL. /api/transit/map-match accepts only bounded bus GPS traces and calls the configured server endpoint.

## Measurement gate

Run the app with Valhalla and Places configured, then capture a real 16x6 window with scripts/qa-spatial-formula-capture.mjs.

Headless software GL is useful for regression only. Formula calibration requires real-device traces with provenance.
