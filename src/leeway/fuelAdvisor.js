import { createRouteClient } from './routePlannerCore.js';
import { readStationPrices } from './stationPrices.js';

export function compareFuelOffers(
  offers,
  { gallons, mpg, benchmarkPrice, maxDetourMinutes = 20 },
) {
  if (![gallons, mpg, benchmarkPrice].every((v) => Number.isFinite(v) && v > 0))
    return [];
  return offers
    .filter(
      (o) =>
        Number.isFinite(o.price) &&
        o.price > 0 &&
        Number.isFinite(o.detourM) &&
        o.detourM >= 0 &&
        Number.isFinite(o.detourSeconds) &&
        o.detourSeconds >= 0 &&
        o.detourSeconds <= maxDetourMinutes * 60,
    )
    .map((o) => ({
      ...o,
      purchaseCost: gallons * o.price,
      detourFuelCost: (o.detourM / 1609.344 / mpg) * benchmarkPrice,
      total: gallons * o.price + (o.detourM / 1609.344 / mpg) * benchmarkPrice,
    }))
    .sort((a, b) => a.total - b.total);
}

export function usableStationReport(report, now = Date.now()) {
  const age = now - Date.parse(report?.reportedAt);
  return (
    report?.kind === 'REPORTED_STATION_PRICE' &&
    report.fuel === 'diesel' &&
    Number.isFinite(report.priceUsdPerGallon) &&
    report.priceUsdPerGallon > 0 &&
    report.priceUsdPerGallon <= 100 &&
    age >= 0 &&
    age <= 48 * 3600000
  );
}

export function corridorQuery(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2)
    throw new Error('Route geometry unavailable');
  const samples = Array.from(
    { length: Math.min(12, geometry.length) },
    (_, i) =>
      geometry[
        Math.round(
          (i * (geometry.length - 1)) / (Math.min(12, geometry.length) - 1),
        )
      ],
  );
  if (
    samples.some(
      (p) =>
        !p ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    throw new Error('Invalid route geometry');
  return `[out:json][timeout:20];(${samples.map(([lon, lat]) => `nwr(around:3000,${lat},${lon})["amenity"="fuel"];`).join('')});out center 50;`;
}

// Compare a bounded set of reported prices using full road routes. This is a
// purchase scenario, not a tank-range scheduler or a complete station-price feed.
export function mountFuelAdvisor({
  planner,
  client = createRouteClient(),
  fetchImpl = (...args) => fetch(...args),
}) {
  const root = document.createElement('details');
  root.className = 'lrp-fuel-advisor';
  root.innerHTML =
    '<summary>Fuel-cost comparison</summary><label>Planned purchase (US gallons)<input data-gallons type="number" min="1" max="500" value="20"></label><label>Maximum extra driving (minutes)<input data-detour type="number" min="0" max="120" value="20"></label><p data-note role="status">Route first to compare corridor fuel costs.</p><div data-offers></div><p>Regional Estimates and Reported Station Prices stay separate. Reports are unverified, not confirmed pump quotes. Comparison excludes toll charges and does not verify tank range or station access.</p>';
  planner.root.append(root);
  let epoch = 0,
    controller = null,
    benchmark = null,
    destroyed = false;
  const note = root.querySelector('[data-note]'),
    offersNode = root.querySelector('[data-offers]');
  const cancel = () => {
    epoch++;
    controller?.abort();
    controller = null;
    offersNode.replaceChildren();
  };
  const benchmarkReady = fetchImpl(
    `${import.meta.env.BASE_URL}fuel-benchmark.json`,
    { signal: AbortSignal.timeout(10000) },
  )
    .then((r) => {
      if (!r.ok) throw new Error('Benchmark unavailable');
      return r.json();
    })
    .then((data) => {
      const row = data.regions?.find((r) => r.region === 'U.S.');
      if (
        data.kind !== 'WEEKLY_REGIONAL_DIESEL_AVERAGE' ||
        !Number.isFinite(Date.parse(data.asOf)) ||
        !Number.isFinite(row?.priceUsdPerGallon) ||
        row.priceUsdPerGallon <= 0
      )
        return;
      benchmark = { price: row.priceUsdPerGallon, date: data.asOf };
      const field = planner.root.querySelector('[data-profile="fuelPrice"]');
      if (
        !destroyed &&
        planner.root.querySelector('[data-profile="type"]')?.value !== 'car' &&
        !planner.getState().route &&
        !Number(field?.value)
      )
        planner.setFuelPrice(
          benchmark.price,
          `EIA U.S. weekly diesel average · ${benchmark.date}`,
        );
    })
    .catch(() => {});
  async function compare(route) {
    cancel();
    const own = epoch;
    controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    if (!route) {
      note.textContent = 'Route first to compare corridor fuel costs.';
      return;
    }
    if (route.vehicle?.type === 'car') {
      note.textContent =
        'Automatic station comparison currently supports commercial diesel scenarios. Passenger-car fuel costs use your entered fuel price; diesel benchmarks are not substituted.';
      return;
    }
    await benchmarkReady;
    if (own !== epoch || destroyed) return;
    const gallons = Number(root.querySelector('[data-gallons]').value),
      maxDetourMinutes = Number(root.querySelector('[data-detour]').value);
    if (
      !Number.isFinite(gallons) ||
      gallons <= 0 ||
      gallons > 500 ||
      !Number.isFinite(maxDetourMinutes) ||
      maxDetourMinutes < 0 ||
      maxDetourMinutes > 120
    ) {
      note.textContent = 'Enter a valid purchase amount and detour limit.';
      return;
    }
    const baseline = route.vehicle?.fuelPrice || benchmark?.price;
    const reports = readStationPrices();
    const eligible = Object.values(reports).filter((r) =>
      usableStationReport(r),
    );
    if (!eligible.length) {
      note.textContent = `${benchmark ? `Regional Estimate: EIA U.S. diesel $${benchmark.price.toFixed(3)}/US gal, ${benchmark.date}. ` : ''}No recent reported diesel prices on this device. There is no verified station-price feed; a cheapest fuel stop cannot be determined.`;
      return;
    }
    if (route.stops.length >= 12) {
      note.textContent =
        'All ten intermediate stops are occupied. Remove a stop before adding a fuel stop.';
      return;
    }
    note.textContent =
      'Comparing recent reported diesel prices and road detours using the same selected vehicle/provider settings…';
    try {
      const response = await fetchImpl(
        'https://overpass-api.de/api/interpreter',
        {
          method: 'POST',
          body: new URLSearchParams({ data: corridorQuery(route.geometry) }),
          signal,
        },
      );
      if (!response.ok) throw new Error(`Fuel map HTTP ${response.status}`);
      const data = await response.json();
      if (data.remark || !Array.isArray(data.elements))
        throw new Error('Fuel map data incomplete');
      const candidates = data.elements
        .map((p) => ({
          id: `${p.type}/${p.id}`,
          lat: p.lat ?? p.center?.lat,
          lon: p.lon ?? p.center?.lon,
          label: p.tags?.name || p.tags?.brand || 'Mapped fuel station',
        }))
        .filter(
          (p) =>
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lon) &&
            usableStationReport(reports[p.id]),
        )
        .slice(0, 3);
      const offers = [];
      for (const candidate of candidates) {
        if (own !== epoch || destroyed) return;
        // Pick the nearest scheduled leg for insertion, then measure the actual
        // full road detour. No straight-line distance is billed as road mileage.
        let insertion = 1,
          score = Infinity;
        for (let i = 1; i < route.stops.length; i++) {
          const a = route.stops[i - 1],
            b = route.stops[i];
          const d =
            Math.hypot(a.lat - candidate.lat, a.lon - candidate.lon) +
            Math.hypot(b.lat - candidate.lat, b.lon - candidate.lon);
          if (d < score) {
            score = d;
            insertion = i;
          }
        }
        const points = route.stops.slice();
        points.splice(insertion, 0, candidate);
        try {
          const detour = await client.route(points, {
            profile: route.vehicle,
            preview: route.preview,
            valhallaUrl:
              route.providerEndpoint === 'public OSRM'
                ? ''
                : route.providerEndpoint,
            hardExclusionsEnabled: route.hardExclusionsEnabled,
            signal,
          });
          offers.push({
            point: candidate,
            price: reports[candidate.id].priceUsdPerGallon,
            reportedAt: reports[candidate.id].reportedAt,
            insertion,
            detourM: Math.max(0, detour.distanceM - route.distanceM),
            detourSeconds: Math.max(0, detour.durationS - route.durationS),
          });
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }
      if (own !== epoch || destroyed) return;
      const ranked = compareFuelOffers(offers, {
        gallons,
        mpg: route.vehicle.mpg,
        benchmarkPrice: baseline,
        maxDetourMinutes,
      });
      note.textContent = ranked.length
        ? `Lowest estimated purchase-plus-detour cost among ${ranked.length} evaluated offers. At most three reported stations are checked; this is not a corridor-wide minimum. Detour fuel price: ${route.fuelPriceProvenance || (benchmark ? `EIA U.S. Regional Estimate dated ${benchmark.date}` : 'your manual input')}.`
        : 'No usable recent station reports with a routable detour inside your limit.';
      for (const offer of ranked) {
        const row = document.createElement('p');
        row.textContent = `${offer.point.label}: $${offer.total.toFixed(2)} estimated for ${gallons} gal + detour fuel; ${(offer.detourM / 1609.344).toFixed(1)} extra miles. Reported Station Price $${offer.price.toFixed(3)}, ${offer.reportedAt}, unverified.`;
        const button = document.createElement('button');
        button.textContent = 'Add fuel stop for review';
        button.onclick = () => {
          planner.insertMapStop(offer.point, offer.insertion);
          planner.open();
        };
        row.append(button);
        offersNode.append(row);
      }
    } catch (error) {
      if (own === epoch && !destroyed)
        note.textContent = `Fuel comparison unavailable: ${error.message}`;
    }
  }
  const unsubscribe = planner.subscribe((event) => {
    if (event.type === 'route-ready') void compare(event.state.route);
    else {
      cancel();
      note.textContent =
        'Route changed. Get a new route to refresh fuel comparisons.';
    }
  });
  const applyDieselBaseline = (event) => {
    if (
      event.target.dataset.profile !== 'type' ||
      event.target.value === 'car' ||
      !benchmark
    )
      return;
    const field = planner.root.querySelector('[data-profile="fuelPrice"]');
    if (!Number(field?.value))
      planner.setFuelPrice(
        benchmark.price,
        `EIA U.S. weekly diesel average · ${benchmark.date}`,
      );
  };
  planner.root.addEventListener('change', applyDieselBaseline);
  root.addEventListener('change', () => void compare(planner.getState().route));
  return {
    destroy() {
      destroyed = true;
      cancel();
      unsubscribe();
      planner.root.removeEventListener('change', applyDieselBaseline);
      root.remove();
    },
  };
}
