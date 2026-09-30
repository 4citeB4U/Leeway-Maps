import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatelessHls, cameraMediaCapabilities } from './statelessHls.js';
import { loadTflSourcesFromOpenData } from './sources.js';

test('TfL uses actual official video clips, rejects lookalike bucket paths, retains snapshots', async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify(
        [
          'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4',
          'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/../evil/clip.mp4',
        ].map((video, i) => ({
          id: `JamCams_${i}`,
          lat: 51.5,
          lon: -0.1,
          additionalProperties: [
            { key: 'available', value: 'true' },
            {
              key: 'imageUrl',
              value:
                'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/test.jpg',
            },
            { key: 'videoUrl', value: video },
          ],
        })),
      ),
    );
  try {
    const rows = await loadTflSourcesFromOpenData();
    assert.equal(rows.find((x) => x.id === 'tfl-0').feedType, 'mp4');
    assert.equal(rows.find((x) => x.id === 'tfl-1').feedType, 'image');
    assert.ok(rows.every((x) => x.snapshotUrl.endsWith('.jpg')));
  } finally {
    globalThis.fetch = prior;
  }
});

test('cold independent instances serve rolling official playlists and overlapping segments', async () => {
  const root = 'https://video.deldot.gov/live/proof/playlist.m3u8';
  let sequence = 10;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === root)
      return new Response(
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=200000\nchunklist.m3u8\n',
      );
    if (url.endsWith('chunklist.m3u8'))
      return new Response(
        `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:${sequence}\n#EXTINF:4,\nseg${sequence}.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nseg${sequence + 1}.ts\n`,
      );
    if (/seg\d+\.ts$/.test(url))
      return new Response(new Uint8Array([71, 0, 1]));
    throw new Error('unexpected request');
  };
  const playlist = await createStatelessHls({ fetchImpl }).playlist(
    'official-camera',
    root,
  );
  assert.match(playlist, /MEDIA-SEQUENCE:10/);
  assert.match(playlist, /#EXT-X-DISCONTINUITY/);
  assert.doesNotMatch(playlist, /https:|session=|lease=/);
  const resources = playlist
    .split('\n')
    .filter((x) => x.startsWith('/api/'))
    .map((x) => new URL(x, 'https://map.example').searchParams.get('resource'));
  sequence = 11;
  assert.deepEqual(
    await createStatelessHls({ fetchImpl }).segment(root, resources[1]),
    Buffer.from([71, 0, 1]),
  );
  await assert.rejects(
    createStatelessHls({ fetchImpl }).segment(root, resources[0]),
    { statusCode: 410 },
  );
  assert.ok(
    calls.every((url) =>
      url.startsWith('https://video.deldot.gov/live/proof/'),
    ),
  );
  const before = calls.length;
  await assert.rejects(
    createStatelessHls({ fetchImpl }).segment(root, 'http://127.0.0.1/private'),
    { statusCode: 400 },
  );
  assert.equal(calls.length, before);
});

test('unregistered segment identifiers never become URLs and escaping provider references fail closed', async () => {
  for (const reference of [
    'https://attacker.example/seg.ts',
    'http://127.0.0.1/seg.ts',
    '//attacker.example/seg.ts',
  ]) {
    const calls = [];
    const api = createStatelessHls({
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response(`#EXTM3U\n#EXTINF:4,\n${reference}\n`);
      },
    });
    await assert.rejects(
      api.playlist('camera', 'https://official.example/live.m3u8'),
      /escapes/,
    );
    assert.equal(calls.length, 1);
  }
});

test('encrypted and URI-bearing playlist tags fail explicitly', async () => {
  for (const tag of [
    '#EXT-X-KEY:METHOD=AES-128,URI="secret"',
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXT-X-SESSION-DATA:URI="https://evil.example"',
  ]) {
    const api = createStatelessHls({
      fetchImpl: async () =>
        new Response(`#EXTM3U\n${tag}\n#EXTINF:4,\nseg.ts\n`),
    });
    await assert.rejects(
      api.playlist('camera', 'https://official.example/live.m3u8'),
      /Unsupported/,
    );
  }
});

test('location-only, snapshot and video capabilities remain distinct', () => {
  assert.deepEqual(
    cameraMediaCapabilities({ url: '', snapshotUrl: '', feedType: 'image' }),
    { video: false, snapshot: false, locationOnly: true },
  );
  assert.deepEqual(
    cameraMediaCapabilities({
      url: 'https://official.example/frame.jpg',
      feedType: 'image',
    }),
    { video: false, snapshot: true, locationOnly: false },
  );
  assert.deepEqual(
    cameraMediaCapabilities({
      url: 'https://official.example/live.m3u8',
      feedType: 'hls',
    }),
    { video: true, snapshot: false, locationOnly: false },
  );
});
