#!/usr/bin/env bash
set -euo pipefail

MODE="\${MODE:-reference}"
OUT_DIR="\${OUT_DIR:-artifacts/overture}"
RELEASE="\${OVERTURE_RELEASE:-}"
BBOX="\${BBOX:-}"
mkdir -p "$OUT_DIR"

if [[ -z "$RELEASE" ]]; then
  RELEASE="$(
    curl -fsSL https://stac.overturemaps.org/catalog.json |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["latest"])'
  )"
fi

PMTILES_URL="https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/\${RELEASE}/places.pmtiles"
MANIFEST="\${OUT_DIR}/places-manifest.json"

cat > "$MANIFEST" <<JSON
{
  "schemaVersion": "1.0.0",
  "provider": "Overture Maps Foundation",
  "release": "\${RELEASE}",
  "theme": "places",
  "pmtilesUrl": "\${PMTILES_URL}",
  "sourceSchema": "Overture Places v2 taxonomy",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mode": "\${MODE}"
}
JSON

case "$MODE" in
  reference)
    echo "Wrote \${MANIFEST}"
    echo "Remote PMTiles: \${PMTILES_URL}"
    ;;
  download)
    command -v curl >/dev/null
    curl -fL --retry 3 -o "\${OUT_DIR}/places.pmtiles" "$PMTILES_URL"
    echo "Downloaded \${OUT_DIR}/places.pmtiles"
    ;;
  extract)
    if [[ -z "$BBOX" ]]; then
      echo "MODE=extract requires BBOX=minLon,minLat,maxLon,maxLat" >&2
      exit 2
    fi
    command -v pmtiles >/dev/null || {
      echo "pmtiles CLI is required for MODE=extract" >&2
      exit 2
    }
    pmtiles extract "$PMTILES_URL" "\${OUT_DIR}/places-region.pmtiles" --bbox="$BBOX"
    echo "Extracted \${OUT_DIR}/places-region.pmtiles"
    ;;
  build-from-parquet)
    command -v duckdb >/dev/null || { echo "duckdb required" >&2; exit 2; }
    command -v tippecanoe >/dev/null || { echo "tippecanoe required" >&2; exit 2; }
    PARQUET="s3://overturemaps-us-west-2/release/\${RELEASE}/theme=places/type=place/*"
    duckdb <<SQL
INSTALL spatial; LOAD spatial;
INSTALL httpfs; LOAD httpfs;
SET s3_region='us-west-2';
COPY (
  SELECT
    id,
    names.primary AS name,
    taxonomy.primary AS category,
    basic_category,
    confidence,
    websites,
    geometry
  FROM read_parquet('\${PARQUET}', hive_partitioning=1)
  WHERE confidence >= 0.60
) TO '\${OUT_DIR}/places.geojson'
WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');
SQL
    tippecanoe \
      -fo "\${OUT_DIR}/places-custom.pmtiles" \
      -Z10 -z16 \
      --drop-densest-as-needed \
      --extend-zooms-if-still-dropping \
      -l places \
      "\${OUT_DIR}/places.geojson"
    ;;
  *)
    echo "Unknown MODE=\${MODE}" >&2
    exit 2
    ;;
esac
