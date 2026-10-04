/*
REGION: LeeWay Maps / CCTV Coverage
TAG: LEEWAY.CCTV.COVERAGE.GAPS
WHAT = Evidence-state catalog for priority global CCTV expansion targets.
WHY = Worldwide camera coverage must distinguish implemented media, metadata-only sources, credential-required sources and research gaps.
WHO = LeeWay Industries under Creator authority.
WHERE = Server-side CCTV provider registry.
WHEN = Coverage/atlas diagnostics are requested.
HOW = Record official source evidence without claiming an adapter or live frame until implemented and verified.
LICENSE = MIT, matching this repository.
*/

const TARGETS = Object.freeze([
  {
    id: 'south-korea-molit-traffic-video',
    countryIso: 'KOR',
    subdivision: '',
    operator: 'Republic of Korea Ministry of Land, Infrastructure and Transport / public data portal',
    sourceUrl: 'https://www.data.go.kr/data/15148511/openapi.do',
    evidenceState: 'VERIFIED_SOURCE',
    access: 'key-required',
    mediaPotential: 'live-video-api',
    adapterStatus: 'not-implemented',
    notes: 'Official traffic CCTV video API; application/operational approval and attribution are required.',
  },
  {
    id: 'south-korea-cctv-national-metadata',
    countryIso: 'KOR',
    subdivision: '',
    operator: 'Republic of Korea Ministry of the Interior and Safety',
    sourceUrl: 'https://www.data.go.kr/data/15155042/openapi.do',
    evidenceState: 'VERIFIED_SOURCE',
    access: 'key-required',
    mediaPotential: 'metadata-only',
    adapterStatus: 'not-implemented',
    notes: 'National municipal CCTV inventory metadata; not a blanket live-video feed.',
  },
  {
    id: 'south-korea-road-cctv',
    countryIso: 'KOR',
    subdivision: '',
    operator: 'Republic of Korea Ministry of Land, Infrastructure and Transport',
    sourceUrl: 'https://www.data.go.kr/data/15040466/openapi.do',
    evidenceState: 'VERIFIED_SOURCE',
    access: 'key-required',
    mediaPotential: 'live-road-video',
    adapterStatus: 'not-implemented',
    notes: 'Official highway and major-road CCTV imagery/video data.',
  },
  {
    id: 'beijing-traffic-camera-locations',
    countryIso: 'CHN',
    subdivision: 'CN-BJ',
    operator: 'Beijing Municipal Government Data',
    sourceUrl: 'https://data.beijing.gov.cn/cms/web/bjdata/api/dataDoc.jsp?contentID=19156',
    evidenceState: 'VERIFIED_SOURCE',
    access: 'account-key',
    mediaPotential: 'metadata-only',
    adapterStatus: 'not-implemented',
    notes: 'Official traffic-camera location dataset. This does not establish reusable live camera media.',
  },
  {
    id: 'europe-datex2-discovery',
    countryIso: 'EUR',
    subdivision: '',
    operator: 'DATEX II operational node network',
    sourceUrl: 'https://datex2.eu/nodes-directory/',
    evidenceState: 'VERIFIED_DISCOVERY',
    access: 'varies-by-node',
    mediaPotential: 'traffic-data-discovery',
    adapterStatus: 'research-required',
    notes: 'Europe-wide discovery surface for national traffic-data nodes; camera/media support must be proven per node.',
  },
  {
    id: 'india-national-cctv-discovery',
    countryIso: 'IND',
    subdivision: '',
    operator: 'India road/transport public authorities',
    sourceUrl: '',
    evidenceState: 'RESEARCH_REQUIRED',
    access: 'unknown',
    mediaPotential: 'unknown',
    adapterStatus: 'research-required',
    notes: 'No single nationwide reusable public traffic-camera media contract has been verified for LeeWay yet.',
  },
  {
    id: 'bangladesh-national-cctv-discovery',
    countryIso: 'BGD',
    subdivision: '',
    operator: 'Bangladesh road/transport public authorities',
    sourceUrl: '',
    evidenceState: 'RESEARCH_REQUIRED',
    access: 'unknown',
    mediaPotential: 'unknown',
    adapterStatus: 'research-required',
    notes: 'No nationwide reusable public traffic-camera media contract has been verified for LeeWay yet.',
  },
  {
    id: 'russia-national-cctv-discovery',
    countryIso: 'RUS',
    subdivision: '',
    operator: 'Russian transport/open-data authorities',
    sourceUrl: 'https://www.mintrans.gov.ru/opendata',
    evidenceState: 'VERIFIED_DISCOVERY',
    access: 'varies',
    mediaPotential: 'unknown',
    adapterStatus: 'research-required',
    notes: 'Transport ministry open-data portal verified; reusable live road-camera media remains unverified.',
  },
]);

export function globalCctvExpansionTargets() {
  return TARGETS.map((row) => ({ ...row }));
}

export function globalCctvExpansionSummary() {
  const rows = globalCctvExpansionTargets();
  return {
    targetCount: rows.length,
    verifiedSourceCount: rows.filter((row) => row.evidenceState.startsWith('VERIFIED')).length,
    researchRequiredCount: rows.filter((row) => row.adapterStatus === 'research-required').length,
    notImplementedCount: rows.filter((row) => row.adapterStatus === 'not-implemented').length,
  };
}
