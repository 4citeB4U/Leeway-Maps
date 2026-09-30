export function publicWorldApiConfig(value, hostname = '') {
  const raw=String(value || '').trim();
  if (!raw) return { base:'', state:hostname.endsWith('github.io') ? 'missing' : 'same-origin' };
  try {
    const url=new URL(raw);
    const local=/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i.test(url.hostname);
    if (url.username || url.password || url.search || url.hash || !['http:','https:'].includes(url.protocol)) throw Error();
    if (hostname.endsWith('github.io') && (url.protocol!=='https:' || local)) throw Error();
    return {base:url.href.replace(/\/$/,''),state:'configured'};
  } catch { return {base:'',state:'invalid'}; }
}
