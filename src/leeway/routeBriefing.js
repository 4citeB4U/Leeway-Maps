import { fuelEstimate, formatFuelPriceProvenance } from './routePlannerCore.js';
import { formatRouteDuration } from '../data/routeSteps.js';

const names = {
  car: 'Passenger car',
  van: 'Commercial van',
  truck: 'Rigid truck',
  semi: 'Semi / tractor trailer',
};
const positive = (value) => Number.isFinite(value) && value > 0;
const label = (value) =>
  String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 300);

/** Read only the selected planner snapshot. No model, geocoder or live-data claim. */
export function routeBriefing(snapshot) {
  const route = snapshot?.route;
  if (!route)
    return 'There is no calculated route to review. Enter and select your street addresses in Directions, then choose Get road route.';
  const stops = (Array.isArray(route.stops) ? route.stops : [])
    .map((stop) => label(stop.label))
    .filter(Boolean);
  const lines = ['Your selected route:'];
  if (stops.length >= 2) {
    lines.push(`From ${stops[0]} to ${stops.at(-1)}.`);
    if (stops.length > 2)
      lines.push(
        `${stops.length - 2} intermediate stops, in the order shown in Directions.`,
      );
  }
  const totals = [];
  if (positive(route.distanceM))
    totals.push(`${(route.distanceM / 1609.344).toFixed(1)} miles`);
  if (positive(route.durationS))
    totals.push(
      `${formatRouteDuration(route.durationS)} of provider-estimated driving`,
    );
  if (totals.length)
    lines.push(
      `${totals.join(' · ')}. This is not a live-traffic arrival time.`,
    );
  if (names[route.vehicle?.type])
    lines.push(`Vehicle: ${names[route.vehicle.type]}.`);
  lines.push(
    `Source: ${label(route.source) || 'not recorded'}. ${label(route.authority) || 'Route restriction authority is not recorded.'}`,
  );
  if (
    route.preview ||
    (route.vehicle?.type !== 'car' && /OSRM/i.test(route.source || ''))
  ) {
    lines.push(
      'Passenger-road preview only. Truck clearance, hazmat access and oversize permits are unverified.',
    );
  }
  const estimate =
    positive(route.distanceM) && positive(route.vehicle?.mpg)
      ? fuelEstimate(
          route.distanceM,
          route.vehicle.mpg,
          route.vehicle.fuelPrice,
        )
      : null;
  if (estimate) {
    lines.push(
      `Estimated fuel: ${estimate.gallons.toFixed(1)} US gallons using ${route.vehicle.mpg} US MPG.`,
    );
    if (estimate.cost !== null) {
      lines.push(
        `Estimated fuel cost: $${estimate.cost.toFixed(2)} USD at $${route.vehicle.fuelPrice.toFixed(3)} per US gallon. Price source: ${formatFuelPriceProvenance(route.fuelPriceProvenance)}.`,
      );
    } else
      lines.push('Fuel cost is unavailable until you supply a fuel price.');
    lines.push(
      'Fuel estimates exclude idling, traffic, toll charges and maintenance. To compare stop order, use Optimize stops; it minimizes road distance at a constant MPG. Cheapest station pricing requires reported price evidence.',
    );
  } else
    lines.push(
      'Fuel estimate unavailable. Enter a positive MPG and calculate the route again.',
    );
  lines.push(
    'This briefing reads the current plan on this device. It does not certify road access, current hazards or hours-of-service compliance.',
  );
  return lines.join('\n');
}
