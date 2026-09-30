import { createCctvCatalog } from './cctv/catalog.js';
import { createCctvFrameCache } from './cctv/frameCache.js';
import { globalTrafficCameraCoverage } from './cctv/globalRegistry.js';
import {
  normalizeFeedType,
  isVideoFeedType,
  toFiniteNumber,
} from './cctv/normalize.js';
import {
  proxyMediaResponse,
  fetchCctvImageFromUpstream,
  fetchTxdotSnapshot,
  fetchCctvMediaUpstream,
  watchDownstreamClose,
} from './cctv/media.js';
import {
  CCTV_FRAME_FETCH_TIMEOUT_MS,
  CCTV_MAX_SOURCES_CEILING,
} from './cctv/constants.js';
import { sanitizeCctvRangeHeader } from './cctv/range.js';
import { createHlsPuller } from './cctv/stream.js';
import {
  createStatelessHls,
  cameraMediaCapabilities,
} from './cctv/statelessHls.js';
import {
  nationalTrafficCameraJurisdictions,
  nationalTrafficCameraSummary,
  nationalTrafficCameraJurisdiction,
} from './cctv/nationalRegistry.js';
export { CCTV_FRAME_FETCH_TIMEOUT_MS, fetchCctvImageFromUpstream };
/**
 * Vite plugin: CCTV camera proxy with source registry, frame/media serving,
 * verified upstream media, truthful failures, and health tracking.
 *
 * Endpoints:
 *   GET /api/cctv/sources        — list all registered camera sources
 *   GET /api/cctv/health         — per-camera health/status report
 *   GET /api/cctv/stream/:id     — stream info (feedType, URLs) for a camera
 *   GET /api/cctv/media/:id      — proxy live video/image media from upstream
 *   GET /api/cctv/frame/:id      — verified public frame or truthful failure
 *
 * @returns {import('vite').Plugin}
 */
export function cctvProxy({
  sourceRoot = process.cwd(),
  statelessMedia = false,
} = {}) {
  const getCctvSources = createCctvCatalog({ sourceRoot });
  const getFrame = createCctvFrameCache();
  /** @type {Map<string,{id:string,status:string,sourceKind:string,label:string,message:string,updatedAt:number}>} */
  const health = new Map();
  /** Cap on health map entries to prevent unbounded growth. Sized to the
   * CCTV_MAX_SOURCES ceiling so health/status observability is never evicted
   * for any catalog the proxy can actually serve. */
  const HEALTH_MAX_ENTRIES = CCTV_MAX_SOURCES_CEILING;
  /** Live HLS strategies (see ./cctv/stream.js). Shared across dev and preview. */
  const puller = createHlsPuller();
  const statelessHls = createStatelessHls();

  /** Update health and a bounded asymmetric circuit breaker per camera. */
  const setHealth = (cameraId, patch) => {
    // Evict oldest entries if the health map grows beyond the cap
    if (!health.has(cameraId) && health.size >= HEALTH_MAX_ENTRIES) {
      const oldest = health.keys().next().value;
      health.delete(oldest);
    }
    health.set(cameraId, nextCctvHealth(cameraId, health.get(cameraId), patch));
  };

  /** Snapshot all camera health entries as an array. */
  const listHealth = () => Array.from(health.values());

  /** Build a JSON payload describing stream info (feedType, URLs) for a camera. */
  const buildStreamPayload = (source, cameraId) => {
    const feedType = normalizeFeedType(source?.feedType || 'image');
    return {
      id: cameraId,
      feedType,
      mediaMode: statelessMedia
        ? 'stateless-streams-and-snapshots'
        : 'streams-and-snapshots',
      mediaCapabilities: cameraMediaCapabilities(source),
      mediaLimitation: cameraMediaCapabilities(source).locationOnly
        ? 'Camera location only; provider publishes no public image or video URL.'
        : !cameraMediaCapabilities(source).video
          ? 'Provider supplies refreshed still images, not continuous video.'
          : source?.sourceKind === 'tfl-open-data'
            ? 'Provider supplies periodically refreshed video clips, not a continuous live stream.'
            : '',
      mediaUrl: isVideoFeedType(feedType)
        ? `/api/cctv/media/${encodeURIComponent(cameraId)}`
        : null,
      frameUrl: `/api/cctv/frame/${encodeURIComponent(cameraId)}`,
      provider: source?.provider || '',
      sourceKind:
        source?.sourceKind || (source?.url ? 'configured' : 'fallback'),
    };
  };

  const installMiddleware = (server) => {
    server.httpServer?.on('close', () => {
      puller.shutdown();
    });
    server.middlewares.use('/api/cctv', async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');

        if (url.pathname === '/coverage') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(
            JSON.stringify(
              globalTrafficCameraCoverage(getCctvSources.status()),
            ),
          );
          return;
        }

        if (url.pathname === '/jurisdictions') {
          const code = String(url.searchParams.get('code') || '').trim();
          const body = code
            ? { jurisdiction: nationalTrafficCameraJurisdiction(code) }
            : {
                summary: nationalTrafficCameraSummary(),
                jurisdictions: nationalTrafficCameraJurisdictions(),
              };
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          });
          res.end(JSON.stringify(body));
          return;
        }

        // Status and static coverage remain responsive even when an inventory
        // provider is slow. They must not launch a worldwide catalog download.
        if (url.pathname === '/health') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(
            JSON.stringify({
              cameras: listHealth(),
              packs: getCctvSources.status(),
            }),
          );
          return;
        }
        if (url.pathname === '/sources') {
          const sources = await getCctvSources();
          const body = {
            sources: sources.map((source) => ({
              id: source.id,
              name: source.name,
              city: source.city,
              cityId: source.cityId,
              provider: source.provider,
              lat: source.lat,
              lon: source.lon,
              headingDeg: source.headingDeg,
              headingConfidence: source.headingConfidence || '',
              pitchDeg: source.pitchDeg,
              fovDeg: source.fovDeg,
              rangeM: source.rangeM,
              mountHeightM: source.mountHeightM,
              groundElevationM: source.groundElevationM,
              feedType: normalizeFeedType(source.feedType),
              mediaCapabilities: cameraMediaCapabilities(source),
              mediaLimitation: cameraMediaCapabilities(source).locationOnly
                ? 'Camera location only; provider publishes no public image or video URL.'
                : !cameraMediaCapabilities(source).video
                  ? 'Provider supplies refreshed still images, not continuous video.'
                  : source?.sourceKind === 'tfl-open-data'
                    ? 'Provider supplies periodically refreshed video clips, not a continuous live stream.'
                    : '',
              sourceKind:
                source.sourceKind || (source.url ? 'configured' : 'fallback'),
              poseSource: source.poseSource,
              license: source.license,
              credit: source.credit || '',
              code: source.code || '',
              frameRefreshMs: source.frameRefreshMs,
              ageMinutes: source.ageMinutes,
              warningAge: source.warningAge,
              catalogStatus: source.catalogStatus || 'configured',
              catalogUpdatedAt: source.catalogUpdatedAt || null,
              groundHeights: source.groundHeights || null,
            })),
          };
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(body));
          return;
        }

        if (url.pathname.startsWith('/stream/')) {
          const cameraId =
            decodeURIComponent(url.pathname.replace('/stream/', '').trim()) ||
            'camera';
          const source = await getCctvSources.resolve(cameraId);
          const payload = buildStreamPayload(source, cameraId);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(payload));
          return;
        }

        if (url.pathname.startsWith('/media/')) {
          const match = /^\/media\/([^/]+)(?:\/(seg_(\d+)\.ts))?$/.exec(
            url.pathname,
          );
          if (!match) {
            res.writeHead(404);
            res.end();
            return;
          }
          const cameraId = decodeURIComponent(match[1]);
          const source = await getCctvSources.resolve(cameraId);
          const mediaUrl = source?.url || '';
          const feedType = normalizeFeedType(source?.feedType || 'image');
          const leaseId = url.searchParams.get('lease');
          if (statelessMedia && feedType === 'hls') {
            if (req.method === 'DELETE') {
              res.writeHead(204);
              res.end();
              return;
            }
            if (req.method !== 'GET') {
              res.writeHead(405);
              res.end();
              return;
            }
            const downstream = watchDownstreamClose(res);
            try {
              const resource = url.searchParams.get('resource');
              const body =
                resource !== null
                  ? await statelessHls.segment(
                      mediaUrl,
                      resource,
                      downstream.signal,
                    )
                  : await statelessHls.playlist(
                      cameraId,
                      mediaUrl,
                      downstream.signal,
                    );
              if (!downstream.closed) {
                res.writeHead(200, {
                  'Content-Type':
                    resource !== null
                      ? 'video/mp2t'
                      : 'application/vnd.apple.mpegurl',
                  'Cache-Control': 'no-store',
                  'X-CCTV-Source': 'official-stateless-hls',
                });
                res.end(body);
              }
            } catch (error) {
              if (!downstream.closed) {
                res.writeHead(error.statusCode || 503, {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store',
                  'Retry-After': '2',
                });
                res.end(
                  JSON.stringify({
                    error:
                      error.statusCode === 410
                        ? error.message
                        : 'Official HLS stream unavailable or unsupported; retry or use its snapshot if available.',
                  }),
                );
              }
            }
            return;
          }
          if (feedType === 'hls' && !/^[a-f0-9-]{36}$/i.test(leaseId || '')) {
            res.writeHead(400);
            res.end();
            return;
          }
          if (req.method === 'DELETE') {
            if (leaseId) puller.release(cameraId, leaseId);
            res.writeHead(204);
            res.end();
            return;
          }
          if (req.method !== 'GET') {
            res.writeHead(405);
            res.end();
            return;
          }
          if (feedType === 'hls') {
            if (
              !/^https?:\/\//i.test(mediaUrl) ||
              !/\.m3u8(?:\?|$)/i.test(mediaUrl)
            ) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error:
                    'This stream requires an unsupported transport; use the frame fallback',
                }),
              );
              return;
            }
            if (match[2]) {
              const body = puller.getSegment(
                cameraId,
                url.searchParams.get('session'),
                Number(match[3]),
                leaseId,
              );
              res.writeHead(body ? 200 : 404, {
                'Content-Type': 'video/mp2t',
                'Cache-Control': 'no-store',
              });
              res.end(body || undefined);
              return;
            }
            const downstream = watchDownstreamClose(res);
            let entry;
            const cancelPending = () => {
              if (entry) puller.release(cameraId, leaseId);
            };
            try {
              entry = await puller.ensure(cameraId, mediaUrl, leaseId);
              if (downstream.closed) {
                cancelPending();
                return;
              }
              downstream.signal.addEventListener('abort', cancelPending, {
                once: true,
              });
              if (!(await puller.waitReady(entry, downstream.signal)))
                throw new Error('Stream unavailable');
              const playlist = await puller.buildPlaylist(
                entry,
                cameraId,
                leaseId,
              );
              if (downstream.closed) return;
              if (!playlist) throw new Error('Stream unavailable');
              setHealth(cameraId, {
                status: 'ok',
                sourceKind: 'live',
                label: source?.provider || 'Configured source',
                message: 'Live HLS connected',
              });
              res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-store',
                'X-CCTV-Source': 'hls-pull',
                'X-CCTV-Session': entry.token,
              });
              res.end(playlist);
            } catch {
              setHealth(cameraId, {
                status: 'degraded',
                sourceKind: 'fallback',
                label: source?.provider || 'Configured source',
                message: 'Live HLS unavailable',
              });
              if (!downstream.closed) {
                res.writeHead(503, {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store',
                  'Retry-After': '2',
                });
                res.end(JSON.stringify({ error: 'Live stream unavailable' }));
              }
            } finally {
              downstream.signal.removeEventListener('abort', cancelPending);
            }
            return;
          }
          if (match[2] || req.method !== 'GET') {
            res.writeHead(404);
            res.end();
            return;
          }

          if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
            setHealth(cameraId, {
              status: 'degraded',
              sourceKind: 'fallback',
              label: source?.provider || 'No upstream URL',
              message: 'No stream URL configured',
            });
            res.writeHead(404, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            });
            res.end(
              JSON.stringify({
                error: 'No media URL configured for this camera',
              }),
            );
            return;
          }

          // Bound before the request goes out: most of the wait is before any
          // header arrives, and a viewer who leaves during it must take the
          // upstream request with them.
          const downstream = watchDownstreamClose(res);
          try {
            const upstreamHeaders = {
              'User-Agent': 'leeway-logistics-transit-world-cctv-proxy/1.0',
            };
            // Never forward the client's own string: a Range this proxy does
            // not accept is dropped and the request proceeds without one.
            const requestRange = sanitizeCctvRangeHeader(req.headers?.range);
            if (requestRange) upstreamHeaders.Range = requestRange;
            const upstream = await fetchCctvMediaUpstream(mediaUrl, {
              headers: upstreamHeaders,
              signal: downstream.signal,
            });
            if (downstream.closed) {
              // The headers arrived for a viewer who is no longer there.
              try {
                await upstream.body?.cancel();
              } catch {
                /* already closed */
              }
              return;
            }
            const contentType = upstream.headers.get('content-type') || '';
            if (!upstream.ok) {
              try {
                await upstream.body?.cancel();
              } catch {
                /* already closed */
              }
              setHealth(cameraId, {
                status: 'degraded',
                sourceKind: 'upstream',
                label: source?.provider || 'Configured source',
                message: `Upstream HTTP ${upstream.status}`,
              });
              res.writeHead(upstream.status, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              });
              res.end(
                JSON.stringify({
                  error: `Upstream returned ${upstream.status}`,
                }),
              );
              return;
            }

            if (
              isVideoFeedType(feedType) &&
              !(
                contentType.startsWith('video/') ||
                contentType.includes('mpegurl')
              )
            ) {
              setHealth(cameraId, {
                status: 'degraded',
                sourceKind: 'upstream',
                label: source?.provider || 'Configured source',
                message: `Unexpected media type ${contentType || 'unknown'}`,
              });
              await upstream.body?.cancel().catch(() => {});
              res.writeHead(502, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              });
              res.end(
                JSON.stringify({
                  error: 'Provider returned no playable video.',
                }),
              );
              return;
            } else {
              setHealth(cameraId, {
                status: 'ok',
                sourceKind: isVideoFeedType(feedType) ? 'live' : 'snapshot',
                label: source?.provider || 'Configured source',
                message: isVideoFeedType(feedType)
                  ? source?.sourceKind === 'tfl-open-data'
                    ? 'Provider video clip received'
                    : 'Video stream connected'
                  : 'Snapshot feed connected',
              });
            }

            await proxyMediaResponse(res, upstream, {
              waitForCompletion: statelessMedia,
              sourceHeader: isVideoFeedType(feedType)
                ? 'live-media'
                : 'upstream-image',
            });
            return;
          } catch (error) {
            if (downstream.closed) {
              // The viewer left mid-request. That is not a camera fault and
              // there is nobody to answer.
              return;
            }
            const timedOut =
              error?.name === 'AbortError' || error?.name === 'TimeoutError';
            // GET /api/cctv/health serializes `message`, and the CCTV panel
            // renders it as a status label, so the raw error would leave the
            // server by a different door than the sanitized body below and
            // land on screen.
            //
            // The log line drops the text too, unlike the catch at the bottom
            // of this file: a media-fetch failure names the camera's upstream
            // host, and these lines get pasted into issues. The status codes
            // below carry the diagnosis — 504 for a timeout, 502 otherwise.
            console.warn('[CCTV Proxy] media fetch failed');
            setHealth(cameraId, {
              status: 'degraded',
              sourceKind: 'upstream',
              label: source?.provider || 'Configured source',
              message: 'Media fetch failed',
            });
            res.writeHead(timedOut ? 504 : 502, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            });
            res.end(
              JSON.stringify({
                error: timedOut
                  ? 'Upstream media timeout'
                  : 'Media proxy failed',
              }),
            );
            return;
          }
        }

        if (!url.pathname.startsWith('/frame/')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }

        const cameraId =
          decodeURIComponent(url.pathname.replace('/frame/', '').trim()) ||
          'camera';
        const source = await getCctvSources.resolve(cameraId);
        const priorHealth = health.get(cameraId);
        if (priorHealth?.retryAt > Date.now()) {
          const seconds = Math.max(
            1,
            Math.ceil((priorHealth.retryAt - Date.now()) / 1000),
          );
          res.writeHead(503, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Retry-After': String(seconds),
          });
          res.end(
            JSON.stringify({
              error: 'Camera source is in bounded backoff',
              retryAfterSeconds: seconds,
            }),
          );
          return;
        }
        // Only use server-registered upstream URLs — never accept client-supplied URLs
        // (prevents SSRF via ?upstream= query parameter)
        const upstreamCandidate =
          source?.snapshotUrl ||
          (!isVideoFeedType(normalizeFeedType(source?.feedType))
            ? source?.url
            : '');

        const upstreamImage = await getFrame(
          `${cameraId}:${upstreamCandidate}`,
          async () =>
            source?.sourceKind === 'txdot-its'
              ? await fetchTxdotSnapshot(upstreamCandidate)
              : await fetchCctvImageFromUpstream(upstreamCandidate),
        );
        if (upstreamImage?.busy) {
          res.writeHead(503, {
            'Content-Type': 'application/json',
            'Retry-After': '2',
            'Cache-Control': 'no-store',
          });
          res.end(
            JSON.stringify({ error: 'Camera proxy busy; retry shortly' }),
          );
          return;
        }
        if (upstreamImage?.ok) {
          setHealth(cameraId, {
            status: 'ok',
            sourceKind: 'snapshot',
            label: source?.provider || 'Configured source',
            message: 'Snapshot image received; scene not verified',
          });
          res.writeHead(200, {
            'Content-Type': upstreamImage.contentType,
            'Cache-Control': 'no-store',
            'X-CCTV-Source': 'upstream-image',
          });
          res.end(upstreamImage.body);
          return;
        }

        setHealth(cameraId, {
          status: 'unavailable',
          sourceKind: source?.sourceKind || 'upstream',
          label: source?.provider || 'Public camera source',
          message: source?.url
            ? 'Upstream unavailable'
            : 'No source configured',
        });
        const currentHealth = health.get(cameraId);
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Retry-After': String(
            Math.max(1, Math.ceil((currentHealth.retryAt - Date.now()) / 1000)),
          ),
        });
        res.end(
          JSON.stringify({
            error: source?.url
              ? 'Public camera frame unavailable'
              : 'Camera location has no verified public media feed',
          }),
        );
      } catch (error) {
        console.error('[CCTV Proxy]', error?.message || String(error));
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'CCTV proxy error' }));
      }
    });
  };
  return {
    name: 'cctv-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}

export function nextCctvHealth(
  cameraId,
  previous = {},
  patch = {},
  now = Date.now(),
) {
  const success = patch.status === 'ok';
  const failureCount = success ? 0 : (Number(previous?.failureCount) || 0) + 1;
  const delayMs = success
    ? 0
    : Math.min(30 * 60_000, 300_000 * 2 ** Math.min(failureCount - 1, 3));
  return {
    id: cameraId,
    status: patch.status || previous?.status || 'unknown',
    sourceKind: patch.sourceKind || previous?.sourceKind || 'unknown',
    label: patch.label || previous?.label || '',
    message: patch.message || previous?.message || '',
    updatedAt: now,
    failureCount,
    circuitState: success
      ? 'closed'
      : failureCount >= 3
        ? 'quarantined'
        : 'backoff',
    retryAt: success ? 0 : now + delayMs,
  };
}
