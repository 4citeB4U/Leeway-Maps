const paths = {
  home: '<path d="M3 11.5 12 4l9 7.5V21H7v-7h10v7"/><path d="M9 21v-7h6v7"/>',
  directions: '<path d="M12 2 22 12 12 22 2 12 12 2Z"/><path d="M8 13h6v-3l3 3-3 3v-3"/>',
  transit: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M8 7h8M8 12h8M8 19l-2 3m10-3 2 3"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  mic: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
  traffic: '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>',
  cctv: '<rect x="3" y="6" width="13" height="10" rx="2"/><path d="m16 9 5-3v10l-5-3M7 19h6"/>',
  flights: '<path d="m2 15 8-3V5a2 2 0 0 1 4 0v7l8 3v3l-8-2v4l3 2v2l-5-1-5 1v-2l3-2v-4l-8 2v-3Z"/>',
  weather: '<path d="M7 16a5 5 0 1 1 9-5h1a4 4 0 0 1 0 8H7M8 21l-1 2m6-2-1 2m6-2-1 2M4 3v2M1 7h2m5-6L7 3"/>',
  map: '<path d="m2 5 7-3 6 3 7-3v17l-7 3-6-3-7 3V5Zm7-3v17m6-14v17"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  journey: '<circle cx="6" cy="17" r="2"/><circle cx="18" cy="7" r="2"/><path d="M8 17h3a5 5 0 0 0 5-5V9M16 7h-3a5 5 0 0 0-5 5v3"/>',
  cockpit: '<circle cx="12" cy="13" r="8"/><circle cx="12" cy="13" r="2"/><path d="M4 13h6m4 0h6M12 5v6m0 4v6M6.5 8.5 10.5 12m7-3.5L13.5 12"/>',
  satellite: '<path d="m9 10 5-5 5 5-5 5-5-5ZM2 7l4-4 4 4-4 4-4-4Zm12 12 4-4 4 4-4 4-4-4ZM4 15a5 5 0 0 1 5 5m-7-2a2 2 0 0 1 2 2m4-5 3-3"/>',
  report: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>',
  talk: '<path d="M3 3h18v13H9l-6 5V3Zm4 5h10M7 12h6"/>',
  three: '<path d="m12 2 10 6v12l-10 4L2 20V8l10-6Zm0 10v12M2 8l10 4 10-4M7 5l10 5"/>',
  settings: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>',
  music: '<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="5.5" cy="18" rx="3.5" ry="3"/><ellipse cx="17.5" cy="15" rx="3.5" ry="3"/>',
};
export function mapIcon(name) {
  return `<svg class="lw-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.map}</svg>`;
}
