import { createHash } from 'node:crypto';
import {
  fetchHlsBytes,
  HLS_LIMITS,
  parseHlsMedia,
  sameOriginHlsUrl,
} from './stream.js';

// Some official encoders issue a fresh session path for every playlist fetch.
// Bind public IDs to the registered root and media sequence, then resolve the
// current provider URI on each request. Never accept a client-supplied URI.
const resourceId = (root, segment) =>
  createHash('sha256').update(`${root}\n${segment.discontinuitySequence ?? 0}\n${segment.seq}`).digest('hex');

/** Every request derives resources from the registered camera's current playlist.
 * Public resource IDs are identifiers, not credentials. No URL comes from a client,
 * and a cold instance needs neither a session cache nor a shared signing secret.
 */
export function createStatelessHls({ fetchImpl = fetch } = {}) {
  const read = (url, maxBytes, signal) =>
    fetchHlsBytes(url, { fetchImpl, maxBytes, signal });
  async function inventory(root, signal) {
    let base = new URL(root);
    if (
      !['https:', 'http:'].includes(base.protocol) ||
      base.username ||
      base.password ||
      !base.pathname.endsWith('.m3u8')
    )
      throw new Error('Invalid registered HLS source');
    let text = (
      await read(base.href, HLS_LIMITS.playlistBytes, signal)
    ).toString('utf8');
    if (text.includes('#EXT-X-STREAM-INF:')) {
      const lines = text.split(/\r?\n/);
      const index = lines.findIndex((line) =>
        line.startsWith('#EXT-X-STREAM-INF:'),
      );
      const variant = lines
        .slice(index + 1)
        .find((line) => line.trim() && !line.startsWith('#'));
      if (!variant) throw new Error('Missing HLS variant');
      base = new URL(sameOriginHlsUrl(variant.trim(), base.href));
      if (!base.pathname.endsWith('.m3u8'))
        throw new Error('Invalid HLS variant');
      text = (await read(base.href, HLS_LIMITS.playlistBytes, signal)).toString(
        'utf8',
      );
    }
    const segments = parseHlsMedia(text, base.href, 1000);
    if (!segments.length) throw new Error('No current HLS segments');
    const discontinuityHeader = /^#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)\s*$/m.exec(text);
    if (discontinuityHeader) {
      let discontinuitySequence = Number(discontinuityHeader[1]);
      for (const segment of segments) {
        if (segment.discontinuity) discontinuitySequence++;
        segment.discontinuitySequence = discontinuitySequence;
      }
    }
    return { text, segments };
  }
  return {
    async playlist(cameraId, root, signal) {
      const { text, segments } = await inventory(root, signal);
      // Preserve provider sequence, discontinuities, dates and ENDLIST. Never
      // forward arbitrary URI-bearing tags to a browser outside this proxy.
      let index = 0;
      const lines = text.split(/\r?\n/).map((line) => {
        if (!line.trim() || line.startsWith('#')) {
          if (/URI\s*=/i.test(line))
            throw new Error('Unsupported HLS resource tag');
          return line;
        }
        const segment = segments[index++];
        if (!segment) throw new Error('Invalid HLS playlist');
        return `/api/cctv/media/${encodeURIComponent(cameraId)}?resource=${resourceId(root, segment)}`;
      });
      return lines.join('\n');
    },
    async segment(root, id, signal) {
      if (!/^[a-f0-9]{64}$/.test(id || ''))
        throw Object.assign(new Error('Invalid HLS resource'), {
          statusCode: 400,
        });
      const { segments } = await inventory(root, signal);
      const segment = segments.find((entry) => resourceId(root, entry) === id);
      if (!segment)
        throw Object.assign(
          new Error('HLS segment expired; refresh the playlist'),
          { statusCode: 410 },
        );
      return read(segment.uri, HLS_LIMITS.segmentBytes, signal);
    },
  };
}

export function cameraMediaCapabilities(source) {
  const video =
    ['hls', 'mp4', 'webm', 'mjpeg'].includes(source?.feedType) &&
    Boolean(source?.url);
  const snapshot = Boolean(source?.snapshotUrl || (!video && source?.url));
  return { video, snapshot, locationOnly: !video && !snapshot };
}
