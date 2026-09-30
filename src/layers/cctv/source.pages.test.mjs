import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Pages CCTV URLs do not assume a localhost provider exists on the phone', async () => {
  const previousLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL('https://4citeb4u.github.io/LEEWAY-LOGISTICS-/'),
  });

  try {
    const { createCctvSource } = await import('./source.js?test=pages-media');
    const source = createCctvSource({
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { sources: [], cameras: [] };
        },
      }),
    });
    const camera = {
      id: 'il-gateway-test',
      name: 'Chicago Test Camera',
      city: 'Chicago',
      lat: 41.88,
      lon: -87.64,
      headingDeg: 90,
      fovDeg: 55,
      pitchDeg: -18,
    };

    const frame = source.getFrameUrl(camera, 300000);
    const media = source.getMediaUrl(camera);

    assert.match(frame, /^\/api\/cctv\/frame\/il-gateway-test\?/);
    assert.match(media, /^\/api\/cctv\/media\/il-gateway-test\?/);
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: previousLocation,
      });
    }
  }
});

test('an explicitly configured world provider remains available', async () => {
  // Vite supplies this compile-time value. Exercise the production resolver with
  // that single binding substituted, without needing a running Vite server.
  const source = await readFile(
    new URL('../../leeway/worldApiBridge.js', import.meta.url),
    'utf8',
  );
  assert.ok(source.includes('import.meta.env?.VITE_LEEWAY_WORLD_API_URL'));
  const configured = source.replace("'./publicApiConfig.js'", JSON.stringify(new URL('../../leeway/publicApiConfig.js', import.meta.url).href)).replace(
    'import.meta.env?.VITE_LEEWAY_WORLD_API_URL',
    JSON.stringify('https://world.example.test/'),
  );
  const { worldApiBase, resolveWorldApiUrl } = await import(
    `data:text/javascript;base64,${Buffer.from(configured).toString('base64')}`
  );
  assert.equal(worldApiBase(), 'https://world.example.test');
  assert.equal(
    resolveWorldApiUrl('/api/cctv/frame/test?ts=1'),
    'https://world.example.test/api/cctv/frame/test?ts=1',
  );
  assert.equal(
    resolveWorldApiUrl('https://other.example.test/api/test'),
    'https://other.example.test/api/test',
  );
});
