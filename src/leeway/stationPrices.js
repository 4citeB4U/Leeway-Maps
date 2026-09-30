const KEY = 'leeway.stationPrices.v1';
export function readStationPrices(storage = globalThis.localStorage) {
  try {
    const rows = JSON.parse(storage.getItem(KEY) || '{}');
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch {
    return {};
  }
}
export function reportStationPrice(
  stationId,
  price,
  fuel,
  storage = globalThis.localStorage,
  now = new Date().toISOString(),
) {
  if (
    !/^(node|way|relation)\/\d+$/.test(stationId) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 100 ||
    !['diesel', 'gasoline'].includes(fuel) ||
    !Number.isFinite(Date.parse(now))
  )
    throw new Error('Enter a valid reported price and fuel type');
  const rows = readStationPrices(storage),
    entry = {
      stationId,
      priceUsdPerGallon: price,
      fuel,
      reportedAt: now,
      kind: 'REPORTED_STATION_PRICE',
      source: 'User report on this device',
      verified: false,
    };
  rows[stationId] = entry;
  const bounded = Object.fromEntries(
    Object.entries(rows)
      .sort((a, b) =>
        String(b[1].reportedAt).localeCompare(String(a[1].reportedAt)),
      )
      .slice(0, 1000),
  );
  storage.setItem(KEY, JSON.stringify(bounded));
  return entry;
}
