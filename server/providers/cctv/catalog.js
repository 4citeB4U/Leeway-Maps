import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CCTV_SOURCE_FILE, CCTV_SOURCE_CACHE_MS } from './constants.js';
import { allocateSourceCap, resolveCatalogCap } from './cap.js';
import { loadGroundHeights, joinGroundHeights } from './groundHeights.js';
import { normalizeSourceItem } from './normalize.js';
import {
  loadAustinSourcesFromOpenData,
  loadCaltransSourcesFromOpenData,
  loadTflSourcesFromOpenData,
  loadIllinoisGatewaySourcesFromOpenData,
  loadWisconsin511SourcesFromOpenData,
  loadNycDotSourcesFromOpenData,
  loadDdotSourcesFromOpenData,
  loadOntarioSourcesFromOpenData,
  loadFintrafficSourcesFromOpenData,
  loadDriveBcSourcesFromOpenData,
  loadTxdotSourcesFromOpenData,
  loadTallinnSourcesFromCatalog,
  loadTarkteeSourcesFromDatex,
  loadWarendorfSourcesFromCatalog,
  loadNswSourcesFromOpenData,
  loadCalgarySourcesFromOpenData,
  loadDelDOTSourcesFromOpenData,
} from './sources.js';
import {
  loadAlaska511Sources,
  loadArizona511Sources,
  loadConnecticut511Sources,
  loadFlorida511Sources,
  loadGeorgia511Sources,
  loadIdaho511Sources,
  loadLouisiana511Sources,
  loadNevada511Sources,
  loadNewEngland511Sources,
  loadNewYork511Sources,
  loadNorthCarolina511Sources,
  loadPennsylvania511Sources,
  loadUtah511Sources,
} from './iteris511.js';

/** Env kill switch: unset or anything but "0" means enabled. */
const envEnabled = (name) => String(process.env[name] || '1').trim() !== '0';

const CAMERA_PACK_IDS = [
  [/^\d+$/, 'austin'],
  [/^ca-d\d+-/, 'caltrans'],
  [/^tfl-/, 'tfl'],
  [/^il-gateway-/, 'illinois-gateway'],
  [/^wi511-/, 'wisconsin-511'],
  [/^ak511-/, 'alaska-511'],
  [/^az511-/, 'arizona-511'],
  [/^id511-/, 'idaho-511'],
  [/^la511-/, 'louisiana-511'],
  [/^ct511-/, 'connecticut-511'],
  [/^fl511-/, 'florida-511'],
  [/^nv511-/, 'nevada-511'],
  [/^nc511-/, 'north-carolina-511'],
  [/^pa511-/, 'pennsylvania-511'],
  [/^ut511-/, 'utah-511'],
  [/^ne511-/, 'new-england-511'],
  [/^ny511-/, 'new-york-511'],
  [/^ga511-/, 'georgia-511'],
  [/^nyc-dot-/, 'nyc-dot'],
  [/^ddot-/, 'ddot'],
  [/^on-/, 'ontario'],
  [/^fi-/, 'fintraffic'],
  [/^drivebc-/, 'drivebc'],
  [/^txdot-/, 'txdot'],
  [/^tln-/, 'tallinn'],
  [/^ee-tarktee-/, 'tarktee'],
  [/^warendorf-/, 'warendorf'],
  [/^nsw-/, 'nsw'],
  [/^calgary-/, 'calgary'],
  [/^deldot-/, 'deldot'],
];

/**
 * Live open-data packs, in merge order. Adding a region is one entry here
 * plus its loader in sources.js; the catalog cap is shared across entries
 * round-robin (cap.js), so a new pack never silently evicts an older one.
 * Each pack fails independently (allSettled) and is gated by its own env
 * kill switch.
 */
const LIVE_PACKS = [
  { name: 'austin', enabled: () => true, load: loadAustinSourcesFromOpenData },
  {
    name: 'caltrans',
    enabled: () => true,
    load: loadCaltransSourcesFromOpenData,
  },
  {
    name: 'tfl',
    enabled: () => envEnabled('CCTV_TFL_ENABLED'),
    load: loadTflSourcesFromOpenData,
  },
  {
    name: 'illinois-gateway',
    enabled: () => envEnabled('CCTV_ILLINOIS_ENABLED'),
    load: loadIllinoisGatewaySourcesFromOpenData,
  },
  {
    name: 'wisconsin-511',
    enabled: () => envEnabled('CCTV_WISCONSIN_511_ENABLED'),
    load: loadWisconsin511SourcesFromOpenData,
  },
  {
    name: 'alaska-511',
    enabled: () => envEnabled('CCTV_ALASKA_511_ENABLED'),
    load: loadAlaska511Sources,
  },
  {
    name: 'arizona-511',
    enabled: () => envEnabled('CCTV_ARIZONA_511_ENABLED'),
    load: loadArizona511Sources,
  },
  {
    name: 'idaho-511',
    enabled: () => envEnabled('CCTV_IDAHO_511_ENABLED'),
    load: loadIdaho511Sources,
  },
  {
    name: 'louisiana-511',
    enabled: () => envEnabled('CCTV_LOUISIANA_511_ENABLED'),
    load: loadLouisiana511Sources,
  },
  {
    name: 'connecticut-511',
    enabled: () => envEnabled('CCTV_CONNECTICUT_511_ENABLED'),
    load: loadConnecticut511Sources,
  },
  {
    name: 'florida-511',
    enabled: () => envEnabled('CCTV_FLORIDA_511_ENABLED'),
    load: loadFlorida511Sources,
  },
  {
    name: 'nevada-511',
    enabled: () => envEnabled('CCTV_NEVADA_511_ENABLED'),
    load: loadNevada511Sources,
  },
  {
    name: 'north-carolina-511',
    enabled: () => envEnabled('CCTV_NORTH_CAROLINA_511_ENABLED'),
    load: loadNorthCarolina511Sources,
  },
  {
    name: 'pennsylvania-511',
    enabled: () => envEnabled('CCTV_PENNSYLVANIA_511_ENABLED'),
    load: loadPennsylvania511Sources,
  },
  {
    name: 'utah-511',
    enabled: () => envEnabled('CCTV_UTAH_511_ENABLED'),
    load: loadUtah511Sources,
  },
  {
    name: 'new-england-511',
    enabled: () => envEnabled('CCTV_NEW_ENGLAND_511_ENABLED'),
    load: loadNewEngland511Sources,
  },
  {
    name: 'new-york-511',
    enabled: () => envEnabled('CCTV_NEWYORK_511_ENABLED'),
    load: loadNewYork511Sources,
  },
  {
    name: 'georgia-511',
    enabled: () => envEnabled('CCTV_GEORGIA_511_ENABLED'),
    load: loadGeorgia511Sources,
  },
  {
    name: 'nyc-dot',
    enabled: () => envEnabled('CCTV_NYC_DOT_ENABLED'),
    load: loadNycDotSourcesFromOpenData,
  },
  {
    name: 'ddot',
    enabled: () => envEnabled('CCTV_DDOT_ENABLED'),
    load: loadDdotSourcesFromOpenData,
  },
  {
    name: 'ontario',
    enabled: () => envEnabled('CCTV_ONTARIO_ENABLED'),
    load: loadOntarioSourcesFromOpenData,
  },
  {
    name: 'fintraffic',
    enabled: () => envEnabled('CCTV_FINTRAFFIC_ENABLED'),
    load: loadFintrafficSourcesFromOpenData,
  },
  {
    name: 'drivebc',
    enabled: () => envEnabled('CCTV_DRIVEBC_ENABLED'),
    load: loadDriveBcSourcesFromOpenData,
  },
  {
    name: 'txdot',
    enabled: () => envEnabled('CCTV_TXDOT_ENABLED'),
    load: loadTxdotSourcesFromOpenData,
  },
  {
    name: 'tallinn',
    enabled: () => envEnabled('CCTV_TALLINN_ENABLED'),
    load: loadTallinnSourcesFromCatalog,
  },
  {
    name: 'tarktee',
    enabled: () => envEnabled('CCTV_TARKTEE_ENABLED'),
    load: loadTarkteeSourcesFromDatex,
  },
  {
    name: 'warendorf',
    enabled: () => envEnabled('CCTV_WARENDORF_ENABLED'),
    load: loadWarendorfSourcesFromCatalog,
  },
  {
    name: 'nsw',
    enabled: () => envEnabled('CCTV_NSW_ENABLED'),
    load: loadNswSourcesFromOpenData,
  },
  {
    name: 'calgary',
    enabled: () => envEnabled('CCTV_CALGARY_ENABLED'),
    load: loadCalgarySourcesFromOpenData,
  },
  {
    name: 'deldot',
    enabled: () => envEnabled('CCTV_DELDOT_ENABLED'),
    load: loadDelDOTSourcesFromOpenData,
  },
];
/**
 * Load CCTV sources from a local JSON file (CCTV_SOURCES_FILE env or default).
 *
 * @returns {Array<object>} Array of raw source objects, or [] on error.
 */
function loadSourcesFromFile(sourceRoot) {
  const sourceFile = process.env.CCTV_SOURCES_FILE || DEFAULT_CCTV_SOURCE_FILE;
  const resolved = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(sourceRoot, sourceFile);
  try {
    if (!fs.existsSync(resolved)) return [];
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(
      '[CCTV] failed to read source file:',
      resolved,
      error?.message || error,
    );
    return [];
  }
}

/**
 * Load CCTV sources from the CCTV_SOURCES_JSON env variable (inline JSON).
 *
 * @returns {Array<object>} Array of raw source objects, or [] if unset/invalid.
 */
function loadSourcesFromEnv() {
  const raw = process.env.CCTV_SOURCES_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Create an independent catalog rooted in the consuming application. */
export function createCctvCatalog({
  sourceRoot = process.cwd(),
  livePacks = LIVE_PACKS,
  now = Date.now,
  cacheMs = CCTV_SOURCE_CACHE_MS,
  staleMs = 60 * 60_000,
} = {}) {
  // Keep each provider independently: one healthy city must not erase another
  // city's last inventory during a temporary upstream outage. These are only
  // locations; frames still require a successful live media fetch.
  const lastGoodPacks = new Map();
  let packHealth = [];
  let refreshed = false;
  const lookupCache = new Map();
  const lookupInflight = new Map();
  /** @type {Array<object>} Cached merged + normalized CCTV source list. */
  let _cctvSourceCache = [];
  /** @type {number} Epoch-ms when the source cache was last refreshed. */
  let _cctvSourceCacheAt = 0;
  /** @type {Promise<Array<object>>|null} In-flight refresh, shared by concurrent
   * callers so a post-TTL burst launches ONE refetch, not one per request. */
  let _cctvSourceInflight = null;

  /**
   * Assemble and cache the merged CCTV source list.
   *
   * Merges every source pack (live open-data packs, local file, env
   * variable), deduplicates by ID, shares the catalog cap fairly across
   * packs, and caches for CCTV_SOURCE_CACHE_MS.
   *
   * @returns {Promise<Array<object>>} Deduplicated, capped source list.
   */
  async function getCctvSources() {
    if (refreshed && now() - _cctvSourceCacheAt <= cacheMs) {
      return _cctvSourceCache;
    }
    // Single-flight: a burst of requests arriving past the TTL shares ONE refresh
    // instead of each launching the full multi-provider refetch. The `.finally`
    // clears the ref so the next post-TTL cycle starts fresh.
    if (_cctvSourceInflight) return _cctvSourceInflight;
    _cctvSourceInflight = refreshCctvSources().finally(() => {
      _cctvSourceInflight = null;
    });
    return _cctvSourceInflight;
  }

  /**
   * Assemble and cache the merged CCTV source list from file/env + live packs.
   * Loaders self-catch to []; bounded stale inventories survive per provider.
   *
   * @returns {Promise<Array<object>>} Deduplicated, capped source list.
   */
  async function refreshCctvSources() {
    const fromFile = loadSourcesFromFile(sourceRoot);
    const fromEnv = loadSourcesFromEnv();

    const forceAustin =
      String(process.env.CCTV_FORCE_AUSTIN || '').trim() === '1';
    const preferAustin =
      String(process.env.CCTV_PREFER_AUSTIN || '1').trim() !== '0';
    // Live open-data packs load unless a file/env pack is configured and live
    // packs aren't forced — the same gate that governed the Austin-only fetch
    // now governs every entry in LIVE_PACKS.
    const needsLiveSources =
      forceAustin || (fromFile.length + fromEnv.length === 0 && preferAustin);
    const liveResults = needsLiveSources
      ? await Promise.allSettled(
          // Invoked inside the promise so a loader that throws synchronously
          // (a file-based pack on a malformed row) is isolated like any other
          // failed pack instead of rejecting the whole refresh.
          livePacks.map((pack) =>
            Promise.resolve().then(() =>
              pack.enabled() ? pack.load({ sourceRoot }) : [],
            ),
          ),
        )
      : [];
    // Live packs first so file/env overrides win on duplicate IDs; each pack
    // keeps its own priority order and the catalog cap is shared fairly.
    const normalizePack = (name, items) => ({
      name,
      sources: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => normalizeSourceItem(item))
        .filter((item) => item.id),
    });
    packHealth = [];
    const packs = [
      ...livePacks.map((pack, index) => {
        const enabled = needsLiveSources && pack.enabled();
        const result = liveResults[index];
        const items =
          result?.status === 'fulfilled' && Array.isArray(result.value)
            ? result.value
            : [];
        const fresh = normalizePack(pack.name, items);
        if (!enabled) lastGoodPacks.delete(pack.name);
        if (enabled && fresh.sources.length) {
          lastGoodPacks.set(pack.name, {
            sources: fresh.sources,
            updatedAt: now(),
          });
        }
        const previous = lastGoodPacks.get(pack.name);
        const stale =
          enabled &&
          !fresh.sources.length &&
          previous &&
          now() - previous.updatedAt <= staleMs;
        if (previous && !fresh.sources.length && !stale)
          lastGoodPacks.delete(pack.name);
        const status = !enabled
          ? 'disabled'
          : fresh.sources.length
            ? 'ready'
            : stale
              ? 'stale'
              : 'unavailable';
        const selected = stale ? previous.sources : fresh.sources;
        packHealth.push({
          name: pack.name,
          status,
          count: selected.length,
          updatedAt: previous?.updatedAt ?? null,
        });
        return {
          name: pack.name,
          sources: selected.map((source) => ({
            ...source,
            catalogStatus: status,
            catalogUpdatedAt: previous?.updatedAt ?? null,
          })),
        };
      }),
      normalizePack('file', fromFile),
      normalizePack('env', fromEnv),
    ];
    const maxCount = resolveCatalogCap(process.env.CCTV_MAX_SOURCES);
    const allocation = allocateSourceCap(packs, maxCount);
    // Shipped ground heights (src/data/local_data/cctv_ground_heights/, produced by
    // scripts/precompute-cctv-heights.mjs) ride along on the served source so
    // the client can place a camera and its monitor plane with zero sampling.
    const capped = joinGroundHeights(
      allocation.sources,
      loadGroundHeights(sourceRoot),
    );
    const trimmed = allocation.packs.filter((pack) => pack.kept < pack.offered);
    if (trimmed.length) {
      const detail = trimmed
        .map((pack) => `${pack.name} ${pack.kept}/${pack.offered}`)
        .join(', ');
      console.warn(
        `[CCTV] source catalog exceeds cap ${maxCount}; shared round-robin across packs (${detail}). Raise CCTV_MAX_SOURCES or lower a per-pack cap to change the mix.`,
      );
    }
    _cctvSourceCache = capped;
    _cctvSourceCacheAt = now();
    refreshed = true;
    return _cctvSourceCache;
  }

  getCctvSources.status = () => packHealth.map((entry) => ({ ...entry }));
  // Frame requests can land on a different serverless instance than /sources.
  // Rehydrate that one official provider, not the entire world catalog, and
  // search before the combined catalog cap. Never derive arbitrary URLs from
  // client input or assume a recognizable id proves that a camera exists.
  getCctvSources.resolve = async (cameraId) => {
    const id = String(cameraId || '');
    if (!id || id.length > 300) return null;
    const configured = [
      ...loadSourcesFromFile(sourceRoot),
      ...loadSourcesFromEnv(),
    ];
    const override = configured.findLast(
      (item) => String(item?.id ?? '').trim() === id,
    );
    if (override) return normalizeSourceItem(override);
    const useLive =
      String(process.env.CCTV_FORCE_AUSTIN || '').trim() === '1' ||
      (!configured.length &&
        String(process.env.CCTV_PREFER_AUSTIN || '1').trim() !== '0');
    if (!useLive) return null;
    const name = CAMERA_PACK_IDS.find(([pattern]) => pattern.test(id))?.[1];
    const pack = livePacks.find((item) => item.name === name);
    if (!pack?.enabled()) return null;
    const warm = lastGoodPacks.get(name);
    if (warm && now() - warm.updatedAt <= cacheMs) {
      return warm.sources.find((item) => item.id === id) || null;
    }
    let entry = lookupCache.get(name);
    if (!entry || now() - entry.at > cacheMs) {
      if (!lookupInflight.has(name)) {
        lookupInflight.set(
          name,
          Promise.resolve()
            .then(() => pack.load({ sourceRoot }))
            .then((rows) => {
              const sources = (Array.isArray(rows) ? rows : [])
                .filter(Boolean)
                .map(normalizeSourceItem);
              const value = { at: now(), sources };
              lookupCache.set(name, value);
              return value;
            })
            .catch(() => {
              const value = { at: now(), sources: [] };
              lookupCache.set(name, value);
              return value;
            })
            .finally(() => lookupInflight.delete(name)),
        );
      }
      entry = await lookupInflight.get(name);
    }
    return entry.sources.find((item) => item.id === id) || null;
  };
  return getCctvSources;
}
