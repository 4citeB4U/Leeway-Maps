import test from 'node:test';
import assert from 'node:assert/strict';
import { nationalCameraJurisdictionAction } from './nationalCameraCatalog.js';

test('national camera action only promises camera viewing for media-integrated sources', () => {
  assert.deepEqual(
    nationalCameraJurisdictionAction({
      sources: [{ integrationStatus: 'integrated' }],
    }),
    { label: 'VIEW CAMERAS', canViewCameras: true },
  );
  assert.deepEqual(
    nationalCameraJurisdictionAction({
      sources: [{ integrationStatus: 'metadata-integrated' }],
    }),
    { label: 'LOCATE SOURCE', canViewCameras: false },
  );
  assert.deepEqual(nationalCameraJurisdictionAction({ sources: [] }), {
    label: 'LOCATE',
    canViewCameras: false,
  });
});
