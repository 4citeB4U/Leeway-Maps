export const ADDRESS_KEYS = {
  saved: 'leeway.addresses.saved.v1',
  recent: 'leeway.addresses.recent.v1',
};
export function addressText(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 600)
    throw new Error(
      'Enter a street address or place name (up to 600 characters).',
    );
  if (
    /^[-+\d.\s,;()[\]]+$/.test(text) ||
    /^(?:lat(?:itude)?|lon(?:gitude)?)\s*[:=]/i.test(text) ||
    (/\d/.test(text) && /^[-+\d.\s°'"NSWE,;]+$/i.test(text))
  )
    throw new Error(
      'Use a street address or place name, not coordinates. My Location and map picking handle location automatically.',
    );
  return text;
}
function record(value) {
  const address = addressText(
    typeof value === 'string' ? value : value?.address,
  );
  const point = value?.point;
  return {
    id: address.toLocaleLowerCase(),
    address,
    ...(Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
      ? { point: { lat: point.lat, lon: point.lon, label: address } }
      : {}),
  };
}
export function createAddressStore({ permanent, session } = {}) {
  function storage(kind) {
    const target = kind === 'saved' ? permanent : session;
    if (!target)
      throw new Error(
        `${kind === 'saved' ? 'Permanent' : 'Session'} address storage is unavailable in this browser.`,
      );
    return target;
  }
  function read(kind) {
    try {
      const rows = JSON.parse(
        storage(kind).getItem(ADDRESS_KEYS[kind]) || '[]',
      );
      return Array.isArray(rows)
        ? rows.flatMap((row) => {
            try {
              return [record(row)];
            } catch {
              return [];
            }
          })
        : [];
    } catch {
      return [];
    }
  }
  function write(kind, rows) {
    storage(kind).setItem(ADDRESS_KEYS[kind], JSON.stringify(rows));
    return rows;
  }
  return {
    list: read,
    save(value) {
      const row = record(value);
      return write(
        'saved',
        [row, ...read('saved').filter((x) => x.id !== row.id)].slice(0, 100),
      );
    },
    remember(value) {
      const row = record(value);
      return write(
        'recent',
        [row, ...read('recent').filter((x) => x.id !== row.id)].slice(0, 30),
      );
    },
    remove(id) {
      return write(
        'saved',
        read('saved').filter((x) => x.id !== id),
      );
    },
    clearRecent() {
      return write('recent', []);
    },
  };
}
function csvRows(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quote.');
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function importAddresses(text, format = 'json') {
  if (typeof text !== 'string' || text.length > 65536)
    throw new Error('Address import must be smaller than 64 KB.');
  let values;
  if (format === 'csv') {
    const rows = csvRows(text.replace(/^\uFEFF/, ''));
    const header = rows.shift() || [];
    const column = header.findIndex(
      (x) => x.trim().toLowerCase() === 'address',
    );
    if (column < 0)
      throw new Error(
        'CSV needs an address column. Quote addresses containing commas.',
      );
    values = rows.map((row) => row[column]);
  } else {
    const parsed = JSON.parse(text);
    values = Array.isArray(parsed) ? parsed : parsed?.addresses;
  }
  if (!Array.isArray(values) || values.length < 2 || values.length > 12)
    throw new Error(
      'Import 2–12 addresses: start, up to 10 intermediate stops, destination.',
    );
  return values.map((v) => ({
    text: addressText(typeof v === 'string' ? v : v?.address),
  }));
}
export function exportAddresses(stops, format = 'json') {
  const addresses = stops.map((s) => addressText(s.point?.label || s.text));
  if (addresses.length < 2 || addresses.length > 12)
    throw new Error('Export requires 2–12 addresses.');
  return format === 'csv'
    ? 'address\r\n' +
        addresses.map((x) => '"' + x.replaceAll('"', '""') + '"').join('\r\n')
    : JSON.stringify({ version: 1, addresses }, null, 2);
}
