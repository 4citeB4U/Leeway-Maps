export const FUEL_LEDGER_KEY = 'leeway.fuel-ledger.v1';
export const MAX_FUEL_RECORDS = 250;

function number(value, name, min, max) {
  if (value === '' || value == null || typeof value === 'boolean')
    throw new Error(
      `${name} is required; enter 0 when there is no cost or distance.`,
    );
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max)
    throw new Error(`${name} must be between ${min} and ${max}.`);
  return result;
}
export function normalizeFuelRecord(input) {
  if (!input || typeof input !== 'object' || typeof input.full !== 'boolean')
    throw new Error('Choose whether the tank was filled completely.');
  if (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id))
    throw new Error('Invalid fuel record ID.');
  const date = String(input.date || '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('Enter a valid fill date.');
  return {
    id: input.id,
    date,
    odometer: number(input.odometer, 'Odometer miles', 0, 10000000),
    gallons: number(input.gallons, 'US gallons added', 0.01, 2000),
    full: input.full,
    gapBefore: input.gapBefore === true,
    gapAfter: input.gapAfter === true,
  };
}
export function normalizeFuelRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_FUEL_RECORDS)
    throw new Error(`Keep at most ${MAX_FUEL_RECORDS} fill records.`);
  const result = records
    .map(normalizeFuelRecord)
    .sort((a, b) => a.odometer - b.odometer);
  if (
    new Set(result.map((row) => row.id)).size !== result.length ||
    new Set(result.map((row) => row.odometer)).size !== result.length
  )
    throw new Error('Each fill needs a distinct ID and odometer reading.');
  if (result.some((row, i) => i && row.date < result[i - 1].date))
    throw new Error('Fill dates must follow odometer order.');
  return result;
}

/** Opening full fill establishes tank level; subsequent gallons replace burned fuel. */
export function measuredFuelEconomy(records) {
  const rows = normalizeFuelRecords(records),
    intervals = [];
  let start = null,
    gallons = 0;
  for (const row of rows) {
    if (row.gapBefore) {
      start = null;
      gallons = 0;
    }
    if (start) gallons += row.gallons;
    if (row.full) {
      if (start) {
        const miles = row.odometer - start.odometer;
        intervals.push({
          from: start.id,
          to: row.id,
          miles,
          gallons,
          mpg: miles / gallons,
        });
      }
      start = row;
      gallons = 0;
    }
    if (row.gapAfter) {
      start = null;
      gallons = 0;
    }
  }
  const miles = intervals.reduce((sum, row) => sum + row.miles, 0);
  const totalGallons = intervals.reduce((sum, row) => sum + row.gallons, 0);
  return {
    mpg: totalGallons > 0 ? miles / totalGallons : null,
    miles,
    gallons: totalGallons,
    intervals,
    pendingPartialFills: start
      ? rows.filter((row) => row.odometer > start.odometer).length
      : rows.length,
  };
}

/** Preserve a missing-fill boundary so deleting fuel cannot inflate measured MPG. */
export function deleteFuelRecord(records, id) {
  const rows = normalizeFuelRecords(records),
    index = rows.findIndex((row) => row.id === id);
  if (index < 0) return rows;
  if (rows[index + 1]) rows[index + 1].gapBefore = true;
  else if (rows[index - 1]) rows[index - 1].gapAfter = true;
  rows.splice(index, 1);
  return rows;
}

export function estimateFuelRange(input) {
  const capacity = number(
    input.capacity,
    'Tank capacity in US gallons',
    0.01,
    2000,
  );
  const current = number(input.current, 'Current US gallons', 0, capacity);
  const reserve = number(input.reserve, 'Reserved US gallons', 0, capacity);
  const mpg = number(input.mpg, 'MPG', 0.1, 200);
  return {
    capacity,
    current,
    reserve,
    mpg,
    usableGallons: Math.max(0, current - reserve),
    estimatedMiles: Math.max(0, current - reserve) * mpg,
  };
}

/** Target margin is profit / revenue, not a markup on costs. All USD costs explicit. */
export function estimateLoadQuote(input) {
  const loadedMiles = number(input.loadedMiles, 'Loaded miles', 0, 100000);
  const deadheadMiles = number(
    input.deadheadMiles,
    'Deadhead miles before pickup',
    0,
    100000,
  );
  const returnMiles = number(
    input.returnMiles,
    'Return or reposition miles after delivery',
    0,
    100000,
  );
  const miles = loadedMiles + deadheadMiles + returnMiles;
  if (!miles) throw new Error('Enter at least one traveled mile.');
  const mpg = number(input.mpg, 'MPG', 0.1, 200);
  const fuelPrice = number(input.fuelPrice, 'USD per US gallon', 0.01, 100);
  const tolls = number(input.tolls, 'Tolls', 0, 1000000);
  const labor = number(input.labor, 'Driver or owner labor', 0, 1000000);
  const operating = number(
    input.operating,
    'Maintenance, insurance and other costs',
    0,
    1000000,
  );
  const taxFees = number(input.taxFees, 'Tax and fee dollars', 0, 1000000);
  const targetMargin = number(
    input.targetMargin,
    'Target profit margin percent',
    0,
    95,
  );
  const gallons = miles / mpg,
    fuelCost = gallons * fuelPrice;
  const totalCost = fuelCost + tolls + labor + operating + taxFees;
  const suggestedCounteroffer =
    Math.ceil((totalCost / (1 - targetMargin / 100)) * 100) / 100;
  let offeredRevenue = null,
    offeredProfit = null,
    offeredMargin = null;
  if (input.offeredRevenue !== '' && input.offeredRevenue != null) {
    offeredRevenue = number(
      input.offeredRevenue,
      'Offered revenue',
      0,
      100000000,
    );
    offeredProfit = offeredRevenue - totalCost;
    offeredMargin =
      offeredRevenue > 0 ? (offeredProfit / offeredRevenue) * 100 : null;
  }
  return {
    miles,
    loadedMiles,
    deadheadMiles,
    returnMiles,
    mpg,
    fuelPrice,
    gallons,
    fuelCost,
    tolls,
    labor,
    operating,
    taxFees,
    targetMargin,
    totalCost,
    suggestedCounteroffer,
    revenuePerTotalMile: suggestedCounteroffer / miles,
    offeredRevenue,
    offeredProfit,
    offeredMargin,
  };
}

export function decodeFuelLedger(raw) {
  if (typeof raw !== 'string' || raw.length > 100000)
    throw new Error('Saved fuel log is invalid or too large.');
  const state = JSON.parse(raw);
  if (state.version !== 1)
    throw new Error('Saved fuel log version is not supported.');
  const records = normalizeFuelRecords(state.records);
  const settings = {};
  const allowed = [
    'capacity',
    'current',
    'reserve',
    'mpg',
    'loadedMiles',
    'deadheadMiles',
    'returnMiles',
    'fuelPrice',
    'tolls',
    'labor',
    'operating',
    'taxFees',
    'targetMargin',
    'offeredRevenue',
  ];
  for (const field of allowed)
    if (
      typeof state.settings?.[field] === 'string' &&
      state.settings[field].length <= 24
    )
      settings[field] = state.settings[field];
  return { version: 1, records, settings };
}
