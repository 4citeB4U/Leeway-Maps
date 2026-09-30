import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIllinoisGatewaySourcesFromOpenData } from './sources.js';

test('Illinois Gateway loader keeps fresh Chicago cameras and rejects TooOld rows', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        features: [
          {
            attributes: {
              OBJECTID: 1,
              ImgPath: 'https://travelmidwest.com/showCamera?id=IL-IDOTD1-IK14B&direction=NONE',
              CameraLocation: 'Hillside Tower Camera 9',
              CameraDirection: 'WB',
              y: 41.88597,
              x: -87.91483,
              SnapShot: 'https://cctv.travelmidwest.com/snapshots/fresh.jpg',
              WarningAge: 'false',
              TooOld: 'false',
              AgeInMinutes: '5',
            },
          },
          {
            attributes: {
              OBJECTID: 2,
              ImgPath: 'https://travelmidwest.com/showCamera?id=IL-IDOTD1-OLD',
              CameraLocation: 'Old Camera',
              CameraDirection: 'EB',
              y: 41.9,
              x: -87.7,
              SnapShot: 'https://cctv.travelmidwest.com/snapshots/old.jpg',
              WarningAge: 'true',
              TooOld: 'true',
              AgeInMinutes: '90',
            },
          },
        ],
      };
    },
  });

  try {
    const rows = await loadIllinoisGatewaySourcesFromOpenData();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].cityId, 'chicago-illinois');
    assert.equal(
      rows[0].provider,
      'Illinois Department of Transportation / Travel Midwest',
    );
    assert.equal(rows[0].url, 'https://cctv.travelmidwest.com/snapshots/fresh.jpg');
    assert.equal(rows[0].frameRefreshMs, 5 * 60 * 1000);
    assert.match(rows[0].credit, /Illinois Department of Transportation/);
    assert.equal(rows[0].ageMinutes, 5);
    assert.equal(rows[0].warningAge, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
