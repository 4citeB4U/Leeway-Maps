/** Presentation of registry evidence; availability is not a promise of live frames. */
export function cameraSourceAccess(source = {}) {
  const status = String(source.integrationStatus || '').toLowerCase();
  let message;
  if (status === 'integrated') message = 'Connected network; individual cameras may be offline or outside this view.';
  else if (status === 'key-required') message = source.requiredCredential
    ? `Connector needs ${source.requiredCredential} before cameras can appear here.`
    : 'Provider credentials are required before cameras can appear here.';
  else if (/restrict|permission|prohibit|official-site-only/.test(status + ' ' + String(source.mediaStatus || '')))
    message = 'Official-site access only; embedded camera media is not enabled.';
  else if (status === 'metadata-integrated') message = 'Camera locations are connected; reusable camera media is not connected.';
  else message = 'Official source identified; camera media is not yet connected to this map.';
  const links = [];
  for (const [label, value] of [[String(source.linkLabel || 'Official source').slice(0,80),source.sourceUrl],['Provider documentation',source.documentationUrl]]) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || links.some(link=>link.href===url.href)) continue;
      links.push({label,href:url.href});
    } catch { /* Unverified or malformed links are not rendered. */ }
  }
  return {message,links};
}

export function emptyCameraCoverageText({totalCount=0,scopedCount=0,error=null}={}) {
  if (error) return 'Camera catalog could not be loaded. Check camera source status and retry.';
  if (!totalCount) return 'No camera records loaded. Open Camera networks for connected sources, access requirements and official websites.';
  if (!scopedCount) return 'No connected cameras in this map area. This does not mean the area has no cameras. Open Camera networks for provider coverage and official websites.';
  return `${scopedCount} cameras in this map area; select a camera to view its source and media status.`;
}
