import test from 'node:test';
import assert from 'node:assert/strict';
import { nationalCameraJurisdictionAction } from './nationalCameraCatalog.js';

test('national camera action only promises camera viewing for media-integrated sources', () => {
  assert.deepEqual(
    nationalCameraJurisdictionAction({
      sources: [{ integrationStatus: 'integrated' }],
    }),
    {
      label: 'VIEW CAMERAS',
      canViewCameras: true,
      requiredCredential: null,
    },
  );
  assert.deepEqual(
    nationalCameraJurisdictionAction({
      sources: [{ integrationStatus: 'metadata-integrated' }],
    }),
    {
      label: 'LOCATE SOURCE',
      canViewCameras: false,
      requiredCredential: null,
    },
  );
  assert.deepEqual(nationalCameraJurisdictionAction({ sources: [] }), {
    label: 'LOCATE',
    canViewCameras: false,
    requiredCredential: null,
  });
});

test('national camera action names the exact credential for a built keyed connector', () => {
  assert.deepEqual(
    nationalCameraJurisdictionAction({
      sources: [
        {
          integrationStatus: 'key-required',
          requiredCredential: 'WISCONSIN_511_API_KEY',
        },
      ],
    }),
    {
      label: 'API KEY REQUIRED',
      canViewCameras: false,
      requiredCredential: 'WISCONSIN_511_API_KEY',
    },
  );
});
