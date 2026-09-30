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
  IA: [
    {
      operator: 'Iowa Department of Transportation',
      system: 'Iowa 511',
      accessMethod: 'official_public_map',
      integrationStatus: 'research-required',
      mediaStatus: 'official-public',
      authRequired: null,
      evidenceState: 'VERIFIED',
      sourceUrl: 'https://www.511ia.org/',
      notes:
        'Official traveler information includes traffic camera images and streaming video.',
    },
  ],
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
