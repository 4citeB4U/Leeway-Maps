// LeeWay Logistics national public traffic-camera jurisdiction registry.
//
// Scope: 50 states + Washington, D.C. + five inhabited U.S. territories.
// This registry is an authority/evidence catalog, not a claim that every
// jurisdiction exposes reusable media. Source states must remain explicit.

const US_JURISDICTIONS = Object.freeze([
  ['AL', 'Alabama', 'state'],
  ['AK', 'Alaska', 'state'],
  ['AZ', 'Arizona', 'state'],
  ['AR', 'Arkansas', 'state'],
  ['CA', 'California', 'state'],
  ['CO', 'Colorado', 'state'],
  ['CT', 'Connecticut', 'state'],
  ['DE', 'Delaware', 'state'],
  ['FL', 'Florida', 'state'],
  ['GA', 'Georgia', 'state'],
  ['HI', 'Hawaii', 'state'],
  ['ID', 'Idaho', 'state'],
  ['IL', 'Illinois', 'state'],
  ['IN', 'Indiana', 'state'],
  ['IA', 'Iowa', 'state'],
  ['KS', 'Kansas', 'state'],
  ['KY', 'Kentucky', 'state'],
  ['LA', 'Louisiana', 'state'],
  ['ME', 'Maine', 'state'],
  ['MD', 'Maryland', 'state'],
  ['MA', 'Massachusetts', 'state'],
  ['MI', 'Michigan', 'state'],
  ['MN', 'Minnesota', 'state'],
  ['MS', 'Mississippi', 'state'],
  ['MO', 'Missouri', 'state'],
  ['MT', 'Montana', 'state'],
  ['NE', 'Nebraska', 'state'],
  ['NV', 'Nevada', 'state'],
  ['NH', 'New Hampshire', 'state'],
  ['NJ', 'New Jersey', 'state'],
  ['NM', 'New Mexico', 'state'],
  ['NY', 'New York', 'state'],
  ['NC', 'North Carolina', 'state'],
  ['ND', 'North Dakota', 'state'],
  ['OH', 'Ohio', 'state'],
  ['OK', 'Oklahoma', 'state'],
  ['OR', 'Oregon', 'state'],
  ['PA', 'Pennsylvania', 'state'],
  ['RI', 'Rhode Island', 'state'],
  ['SC', 'South Carolina', 'state'],
  ['SD', 'South Dakota', 'state'],
  ['TN', 'Tennessee', 'state'],
  ['TX', 'Texas', 'state'],
  ['UT', 'Utah', 'state'],
  ['VT', 'Vermont', 'state'],
  ['VA', 'Virginia', 'state'],
  ['WA', 'Washington', 'state'],
  ['WV', 'West Virginia', 'state'],
  ['WI', 'Wisconsin', 'state'],
  ['WY', 'Wyoming', 'state'],
  ['DC', 'Washington, D.C.', 'federal-district'],
  ['PR', 'Puerto Rico', 'territory'],
  ['VI', 'U.S. Virgin Islands', 'territory'],
  ['GU', 'Guam', 'territory'],
  ['AS', 'American Samoa', 'territory'],
  ['MP', 'Northern Mariana Islands', 'territory'],
]);

const SEEDED_SOURCES = Object.freeze({
  MN: [{operator:'Minnesota Department of Transportation',system:'Minnesota 511 featured cameras (partial coverage)',accessMethod:'official_public_feed',integrationStatus:'integrated',mediaStatus:'integrated',authRequired:false,evidenceState:'VERIFIED',sourceUrl:'https://511mn.org/',notes:'Limited featured-dashboard subset of snapshot views. Full statewide inventory is not connected; no claim of every Minnesota camera.'}],
KS: [
  {
    "operator": "Kansas Department of Transportation",
    "system": "KanDrive",
    "sourceUrl": "https://kandrive.gov/",
    "documentationUrl": "https://www.ksdot.gov/travel/travel-conditions/kandrive",
    "notes": "Public camera viewer identified; reusable catalog and media integration are still being verified.",
    "accessMethod": "official_public_map",
    "integrationStatus": "adapter-required",
    "mediaStatus": "official-public",
    "authRequired": null,
    "evidenceState": "VERIFIED"
  }
],
NE: [
  {
    "operator": "Nebraska Department of Transportation",
    "system": "Nebraska 511",
    "sourceUrl": "https://511.nebraska.gov/",
    "documentationUrl": "https://dot.nebraska.gov/travel/",
    "notes": "Public highway camera viewer identified; a reusable catalog and media contract is not connected yet.",
    "accessMethod": "official_public_map",
    "integrationStatus": "adapter-required",
    "mediaStatus": "official-public",
    "authRequired": null,
    "evidenceState": "VERIFIED"
  }
],
MI: [
  {
    "operator": "Michigan Department of Transportation",
    "system": "Mi Drive / RIDE",
    "sourceUrl": "https://www.michigan.gov/mdot/travel/safety/efforts/its/its-data",
    "documentationUrl": "https://www.michigan.gov/mdot/business/open-data",
    "notes": "RIDE requires an account; reusable CCTV integration is not yet verified. Public viewing and API access are separate.",
    "accessMethod": "official_public_map",
    "integrationStatus": "adapter-required",
    "mediaStatus": "official-public",
    "authRequired": true,
    "evidenceState": "VERIFIED"
  }
],
IN: [
  {
    "operator": "Indiana Department of Transportation",
    "system": "TrafficWise",
    "sourceUrl": "https://511in.org/",
    "documentationUrl": "https://www.in.gov/indot/contact-indot/indot-mobile-app/",
    "notes": "Official public traffic-camera viewer; reusable anonymous feed contract is not yet connected.",
    "accessMethod": "official_public_map",
    "integrationStatus": "adapter-required",
    "mediaStatus": "official-public",
    "authRequired": null,
    "evidenceState": "VERIFIED"
  }
],
OH: [
  {
    "operator": "Ohio Department of Transportation",
    "system": "OHGO",
    "sourceUrl": "https://publicapi.ohgo.com/",
    "documentationUrl": "https://publicapi.ohgo.com/docs/registration",
    "notes": "Official camera API requires registration and a key. Camera adapter and credentials still required.",
    "accessMethod": "documented_api",
    "integrationStatus": "adapter-required",
    "mediaStatus": "official-public",
    "authRequired": true,
    "evidenceState": "VERIFIED"
  }
],
  OK: [
  {
    "operator": "Oklahoma Department of Transportation / Oklahoma Turnpike Authority",
    "system": "OKTraffic",
    "accessMethod": "official_public_feed",
    "integrationStatus": "integrated",
    "mediaStatus": "integrated",
    "authRequired": false,
    "evidenceState": "VERIFIED",
    "sourceUrl": "https://oktraffic.org/",
    "notes": "Public Web cameras only; withheld and out-of-service views excluded. Official delayed HLS streams; counts and availability change. No coverage of every town is asserted."
  }
],
  AL: [
  {
    "operator": "Alabama Department of Transportation",
    "system": "ALGO Traffic",
    "accessMethod": "official_public_map",
    "integrationStatus": "permission-required",
    "mediaStatus": "official-site-only",
    "authRequired": null,
    "evidenceState": "VERIFIED",
    "sourceUrl": "https://www.algotraffic.com/cameras",
    "documentationUrl": "https://www.algotraffic.com/cameras",
    "notes": "Official public camera viewer. ALDOT prohibits unauthorized transmission and commercial use of camera material; embedding requires ALDOT permission. Open the official viewer while permission is unresolved."
  }
],
  AR: [
  {
    "operator": "Arkansas Department of Transportation",
    "system": "IDrive Arkansas Traveler Information",
    "linkLabel": "Traveler information",
    "accessMethod": "official_public_map",
    "integrationStatus": "permission-required",
    "mediaStatus": "official-site-only",
    "authRequired": null,
    "evidenceState": "VERIFIED",
    "sourceUrl": "https://www.idrivearkansas.com/",
    "documentationUrl": "https://site.idrivearkansas.com/index.php/policies/camera-terms-of-use",
    "notes": "ARDOT prohibits embedding camera images and direct camera links in third-party apps. The official traveler-information homepage is provided; no footage is relayed."
  }
],
  AK: [
    {
      operator: 'Alaska Department of Transportation & Public Facilities',
      system: 'Alaska 511',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'ALASKA_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511.alaska.gov/developers/doc',
      documentationUrl: 'https://511.alaska.gov/help/endpoint/cameras',
      notes:
        'Statewide v2 camera adapter implemented from official API documentation; developer key is the remaining activation dependency.',
    },
  ],
  AZ: [
    {
      operator: 'Arizona Department of Transportation',
      system: 'AZ 511',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'ARIZONA_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://www.az511.gov/developers/doc',
      documentationUrl: 'https://az511.com/help/endpoint/cameras',
      notes:
        'Statewide v2 camera adapter implemented from official API documentation; developer key is the remaining activation dependency.',
    },
  ],
  ID: [
    {
      operator: 'Idaho Transportation Department',
      system: 'Idaho 511',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'IDAHO_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511.idaho.gov/developers/doc',
      documentationUrl: 'https://511.idaho.gov/help/endpoint/cameras',
      notes:
        'Statewide v2 camera adapter implemented from official API documentation; developer key is the remaining activation dependency.',
    },
  ],
  LA: [
    {
      operator: 'Louisiana Department of Transportation and Development',
      system: '511LA',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'LOUISIANA_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511la.org/developers/doc',
      documentationUrl: 'https://511la.org/help/endpoint/cameras',
      notes:
        'Statewide v2 camera adapter implemented from official API documentation; developer key is the remaining activation dependency.',
    },
  ],
  CA: [
    {
      operator: 'California Department of Transportation',
      system: 'Caltrans CCTV',
      accessMethod: 'official_public_feed',
      integrationStatus: 'integrated',
      mediaStatus: 'integrated',
      authRequired: false,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://cwwp2.dot.ca.gov/',
      notes: 'LeeWay already contains a Caltrans district adapter.',
    },
  ],
  DE: [
    {
      operator: 'Delaware Department of Transportation',
      system: 'DelDOT Traffic Cameras',
      accessMethod: 'official_public_feed',
      integrationStatus: 'integrated',
      mediaStatus: 'integrated',
      authRequired: false,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://deldot.gov/map/',
      notes: 'LeeWay already contains a DelDOT camera adapter.',
    },
  ],
  FL: [
    {
      operator: 'Florida Department of Transportation',
      system: 'FL511',
      accessMethod: 'official_public_map',
      integrationStatus: 'research-required',
      mediaStatus: 'official-public',
      authRequired: null,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://fl511.com/cctv',
      notes:
        'Official camera directory exposes snapshots/streaming video; machine-readable reuse path still requires verification.',
    },
  ],
  GA: [
    {
      operator: 'Georgia Department of Transportation',
      system: '511GA',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'GEORGIA_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511ga.org/developers/doc',
      documentationUrl: 'https://511ga.org/help/endpoint/cameras',
      notes:
        'Statewide adapter implemented; a configured developer key and live verification are required.',
    },
  ],
  IA: [{ operator: 'Iowa Department of Transportation', system: 'Iowa DOT public cameras', accessMethod: 'official_open_data', integrationStatus: 'integrated', mediaStatus: 'integrated', authRequired: false, evidenceState: 'VERIFIED', sourceUrl: 'https://www.511ia.org/', documentationUrl: 'https://data.iowadot.gov/datasets/c4063f200a7b4da5826e2ac86c677cf5_0/explore', notes: 'Official inventory and refreshed JPEG views connected. Video links were not verified usable; these are labeled snapshots.' }],
  MO: [{ operator: 'Missouri Department of Transportation', system: 'MoDOT Traveler Information', accessMethod: 'official_public_feed', integrationStatus: 'integrated', mediaStatus: 'integrated', authRequired: false, evidenceState: 'VERIFIED', sourceUrl: 'https://traveler.modot.org/', notes: 'Official enabled HLS cameras connected. Error-marked streams and indirect player URLs are excluded; this is not all Missouri cameras.' }],
  IL: [
    {
      operator: 'Illinois Department of Transportation / Travel Midwest',
      system: 'Illinois Gateway / Travel Midwest',
      accessMethod: 'official_open_data',
      integrationStatus: 'integrated',
      mediaStatus: 'integrated',
      authRequired: false,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://www.travelmidwest.com/',
      notes:
        'LeeWay already contains the Illinois Gateway adapter and required attribution handling.',
    },
  ],
  NY: [
    {
      operator: 'New York State 511',
      system: '511NY',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'NEWYORK_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511ny.org/developers/help',
      documentationUrl: 'https://511ny.org/help/endpoint/cameras',
      notes:
        'Statewide adapter implemented; developer key required; published throttling applies. This does not imply statewide live coverage.',
    },
    {
      operator: 'New York City Department of Transportation',
      system: 'NYC DOT Traffic Management Center',
      accessMethod: 'official_public_feed',
      integrationStatus: 'integrated',
      mediaStatus: 'integrated',
      authRequired: false,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://webcams.nyctmc.org/',
      notes: 'LeeWay contains the public NYC DOT current-frame adapter.',
    },
  ],
  OR: [
    {
      operator: 'Oregon Department of Transportation',
      system: 'TripCheck',
      accessMethod: 'documented_api',
      integrationStatus: 'adapter-required',
      mediaStatus: 'official-public',
      authRequired: null,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://tripcheck.com/Pages/API',
      notes:
        'TripCheck documents a CCTV inventory datafeed including still-image URLs.',
    },
  ],
  PA: [
    {
      operator: 'Pennsylvania Department of Transportation',
      system: '511PA',
      accessMethod: 'official_public_map',
      integrationStatus: 'research-required',
      mediaStatus: 'official-public',
      authRequired: null,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511pa.com/cctv',
      notes:
        'Official camera viewer; public site imposes simultaneous-stream limits. API/reuse path still needs verification.',
    },
  ],
  TX: [
    {
      operator: 'Texas Department of Transportation',
      system: 'TxDOT ITS',
      accessMethod: 'official_public_feed',
      integrationStatus: 'integrated',
      mediaStatus: 'integrated',
      authRequired: false,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://its.txdot.gov/',
      notes: 'LeeWay already contains the TxDOT district camera adapter.',
    },
  ],
  WI: [
    {
      operator: 'Wisconsin Department of Transportation',
      system: '511 Wisconsin',
      accessMethod: 'documented_api',
      integrationStatus: 'key-required',
      mediaStatus: 'connector-built-key-blocked',
      authRequired: true,
      requiredCredential: 'WISCONSIN_511_API_KEY',
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://511wi.gov/developers/doc',
      documentationUrl: 'https://511wi.gov/help/endpoint/cameras',
      notes:
        'LeeWay Wisconsin connector is implemented. Official developer key is required before catalog activation.',
    },
  ],
  DC: [
    {
      operator: 'District Department of Transportation',
      system: 'DDOT Traffic CCTV',
      accessMethod: 'official_open_data',
      integrationStatus: 'metadata-integrated',
      mediaStatus: 'metadata-only',
      authRequired: false,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://opendata.dc.gov/',
      notes:
        'LeeWay maps active DDOT camera locations; no public frame URL is claimed from the current dataset.',
    },
  ],
});

function cloneSource(source) {
  return { ...source };
}

export function nationalTrafficCameraJurisdictions() {
  return US_JURISDICTIONS.map(([code, name, type]) => {
    const sources = (SEEDED_SOURCES[code] || []).map(cloneSource);
    const integrated = sources.some((source) =>
      ['integrated', 'metadata-integrated'].includes(source.integrationStatus),
    );
    return {
      code,
      name,
      type,
      country: 'United States',
      sourceCount: sources.length,
      integrated,
      researchStatus: sources.length ? 'seeded' : 'research-required',
      sources,
    };
  });
}

export function nationalTrafficCameraSummary() {
  const rows = nationalTrafficCameraJurisdictions();
  const sources = rows.flatMap((row) => row.sources);
  const states = rows.filter((row) => row.type === 'state').length;
  const territories = rows.filter((row) => row.type === 'territory').length;
  return {
    jurisdictionCount: rows.length,
    stateCount: states,
    federalDistrictCount: rows.filter((row) => row.type === 'federal-district')
      .length,
    territoryCount: territories,
    seededJurisdictionCount: rows.filter((row) => row.sourceCount > 0).length,
    researchRequiredJurisdictionCount: rows.filter(
      (row) => row.sourceCount === 0,
    ).length,
    sourceCount: sources.length,
    integratedSourceCount: sources.filter((source) =>
      ['integrated', 'metadata-integrated'].includes(source.integrationStatus),
    ).length,
    verifiedSourceCount: sources.filter(
      (source) => source.evidenceState === 'VERIFIED',
    ).length,
  };
}

export function nationalTrafficCameraJurisdiction(code) {
  const target = String(code || '')
    .trim()
    .toUpperCase();
  return (
    nationalTrafficCameraJurisdictions().find((row) => row.code === target) ||
    null
  );
}
