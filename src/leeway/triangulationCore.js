import { fuelEstimate } from './routePlannerCore.js';
import { validateLoadCandidate } from './loadIntakeCore.js';

export const MAX_TRIANGULATION_LOADS = 3;

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function confirmedAddress(value, label) {
  const address = clean(value);
  if (!address) throw new Error(`${label} needs a confirmed street address.`);
  return address;
}

/**
 * Produces a closed dispatch plan. This is a planning structure only: it never
 * books a freight load, changes a driver assignment, or certifies HOS legality.
 */
export function buildTriangulation({ homeBase, offers } = {}) {
  const home = confirmedAddress(homeBase, 'Home base');
  const rows = (Array.isArray(offers) ? offers : []).slice(
    0,
    MAX_TRIANGULATION_LOADS,
  );
  if (!rows.length)
    throw new Error('Select at least one load for the triangle.');
  const loads = rows.map(validateLoadCandidate);
  const stops = [{ kind: 'HOME', label: 'Home base', address: home }];
  for (let index = 0; index < loads.length; index += 1) {
    const load = loads[index];
    const letter = String.fromCharCode(65 + index);
    stops.push(
      {
        kind: 'PICKUP',
        loadId: load.id,
        label: `${letter}1 pickup`,
        address: load.pickup,
      },
      {
        kind: 'DELIVERY',
        loadId: load.id,
        label: `${letter}2 delivery`,
        address: load.delivery,
      },
    );
  }
  stops.push({ kind: 'RETURN', label: 'Return home', address: home });
  const totalRate = loads.reduce(
    (sum, load) => sum + (Number.isFinite(load.rate) ? load.rate : 0),
    0,
  );
  return {
    type: 'DISPATCH_TRIANGULATION_DRAFT',
    externalWrite: false,
    homeBase: home,
    loads,
    stops,
    totalRate,
    rateComplete: loads.every((load) => Number.isFinite(load.rate)),
  };
}

/** Returns transparent planning math; it is not a DOT/HOS compliance ruling. */
export function estimateTriangleEconomics({
  plan,
  distanceM,
  durationS,
  mpg,
  fuelPrice,
  driverCostPerMile = 0,
  maintenanceCostPerMile = 0,
  fixedCostPerDay = 0,
  tollCost = 0,
  taxAndOtherCost = 0,
} = {}) {
  if (!plan?.stops?.length)
    throw new Error('Build a triangulation plan first.');
  if (!Number.isFinite(distanceM) || distanceM < 0)
    throw new Error('Road distance is required for an estimate.');
  const fuel = fuelEstimate(distanceM, Number(mpg), Number(fuelPrice));
  if (!fuel) throw new Error('Enter a valid miles-per-gallon value.');
  const routeHours =
    Number.isFinite(durationS) && durationS >= 0 ? durationS / 3600 : null;
  const totalRate = Number(plan.totalRate) || 0;
  const nonNegative = (value, label) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0)
      throw new Error(`${label} must be a non-negative number.`);
    return number;
  };
  const driver =
    nonNegative(driverCostPerMile, 'Driver cost per mile') * fuel.miles;
  const maintenance =
    nonNegative(maintenanceCostPerMile, 'Maintenance cost per mile') *
    fuel.miles;
  const tolls = nonNegative(tollCost, 'Toll cost');
  const taxAndOther = nonNegative(taxAndOtherCost, 'Tax and other cost');
  const days =
    routeHours == null ? null : Math.max(1, Math.ceil(routeHours / 11));
  const fixed =
    days == null
      ? 0
      : nonNegative(fixedCostPerDay, 'Fixed cost per day') * days;
  const operatingCost =
    (fuel.cost ?? 0) + driver + maintenance + fixed + tolls + taxAndOther;
  return {
    miles: fuel.miles,
    gallons: fuel.gallons,
    fuelCost: fuel.cost,
    totalRate,
    ratePerMile:
      totalRate > 0 && fuel.miles > 0 ? totalRate / fuel.miles : null,
    fuelMarginBeforeOtherCosts:
      fuel.cost != null && totalRate > 0 ? totalRate - fuel.cost : null,
    driverCost: driver,
    maintenanceCost: maintenance,
    fixedCost: fixed,
    tollCost: tolls,
    taxAndOtherCost: taxAndOther,
    operatingCost,
    estimatedNet: totalRate > 0 ? totalRate - operatingCost : null,
    routeHours,
    elevenHourDrivingDays: days,
    rateComplete: plan.rateComplete === true,
    status: 'PLANNING_ESTIMATE_REQUIRES_DISPATCH_AND_HOS_REVIEW',
  };
}
