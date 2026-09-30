import {
  FUEL_LEDGER_KEY,
  MAX_FUEL_RECORDS,
  normalizeFuelRecords,
  measuredFuelEconomy,
  deleteFuelRecord,
  estimateFuelRange,
  estimateLoadQuote,
  decodeFuelLedger,
} from './fuelLedgerCore.js';
import './fuelLedger.css';

const usd = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    value,
  );
const numeric = (field, label, extra = '') =>
  `<label>${label}<input data-value="${field}" type="number" min="0" step="any" ${extra}></label>`;

/** One vehicle per browser log. Nothing is transmitted, booked or negotiated. */
export function mountFuelLedger({
  container,
  planner,
  documentRef = globalThis.document,
  storage,
} = {}) {
  const root = documentRef.createElement('section');
  root.className = 'lw-fuel-ledger';
  root.innerHTML = `<details><summary>Fuel log, range and load pricing</summary>
    <p>One vehicle per log. Stored only in this browser when storage is available. Miles, US gallons and USD. No live prices or automatic tax rates.</p>
    <details><summary>Record a fuel fill</summary><form data-fill>
      <label>Fill date<input data-date type="date" required></label>
      <label>Odometer miles<input data-odometer type="number" min="0" max="10000000" step="any" required></label>
      <label>US gallons added<input data-gallons type="number" min="0.01" max="2000" step="any" required></label>
      <label class="lw-fuel-check"><input data-full type="checkbox">Tank filled completely</label>
      <p>Record every fill, including partial fills. Missing fills, fuel transfers or switching vehicles invalidate measured MPG.</p>
      <button type="submit">Save fill on this device</button></form><ul data-records></ul>
      <button data-clear type="button">Delete this vehicle’s fill history</button></details>
    <p data-economy role="status"></p>
    <div class="lw-fuel-grid">${numeric('mpg', 'MPG used for estimates', 'max="200"')}</div>
    <button data-measured type="button">Use measured full-to-full MPG</button>
    <p data-mpg-source>MPG is a manually entered estimate unless copied from the measured log.</p>
    <details><summary>Estimate remaining fuel range</summary><div class="lw-fuel-grid">
      ${numeric('capacity', 'Tank capacity — US gallons', 'max="2000"')}
      ${numeric('current', 'Current fuel — US gallons', 'max="2000"')}
      ${numeric('reserve', 'Keep in reserve — US gallons', 'max="2000"')}</div>
      <button data-range type="button">Estimate range</button><p data-range-result></p>
      <p>Enter current tank contents yourself; fills do not update it automatically. Range changes with load, idling, grade, wind and driving. This is not a fuel gauge.</p></details>
    <details><summary>Price a load including fuel</summary><div class="lw-fuel-grid">
      ${numeric('loadedMiles', 'Loaded trip miles')}${numeric('deadheadMiles', 'Empty miles before pickup')}${numeric('returnMiles', 'Return / reposition miles after delivery')}
      ${numeric('fuelPrice', 'Fuel price — USD per US gallon', 'max="100"')}${numeric('tolls', 'Tolls — USD')}${numeric('labor', 'Driver / owner labor — USD')}
      ${numeric('operating', 'Maintenance, insurance and other costs — USD')}${numeric('taxFees', 'Tax / fee allowance — USD')}
      ${numeric('targetMargin', 'Target profit margin — percent of revenue', 'max="95"')}${numeric('offeredRevenue', 'Offered load payment — USD (optional)')}</div>
      <button data-route type="button">Use planned route as loaded miles</button>
      <p>Count each mile once. Enter 0 explicitly for costs or empty legs that do not apply. Include any return or deadhead travel outside the planned loaded route. Tax and fee amounts are your entries, not calculated tax advice.</p>
      <button data-quote type="button">Estimate costs and counteroffer</button><div data-quote-result role="status"></div>
      <p>Suggested counteroffers are estimates based only on entered costs. No offer is sent, load booked or contact messaged. Check missing operating costs and current prices before using a quote.</p></details>
    <button data-save type="button">Save estimator entries on this device</button>
    <button data-reset type="button">Delete all local fuel data</button>
    <p data-status role="status" aria-live="polite"></p></details>`;
  (container || planner?.root || documentRef.body).append(root);
  const get = (selector) => root.querySelector(selector);
  const status = (value) => {
    get('[data-status]').textContent = value;
  };
  let records = [],
    measured = null,
    measuredApplied = false,
    persisted = false;
  try {
    storage ??= globalThis.localStorage;
  } catch {
    storage = null;
  }
  const inputs = [...root.querySelectorAll('[data-value]')];
  const values = () =>
    Object.fromEntries(
      inputs.map((input) => [input.dataset.value, input.value]),
    );
  const clearResults = () => {
    get('[data-range-result]').textContent = '';
    get('[data-quote-result]').replaceChildren();
  };
  function save() {
    try {
      if (!storage) throw new Error('unavailable');
      storage.setItem(
        FUEL_LEDGER_KEY,
        JSON.stringify({ version: 1, records, settings: values() }),
      );
      persisted = true;
      status('Saved in this browser only.');
      return true;
    } catch {
      persisted = false;
      status(
        'Browser storage is unavailable or full. Changes are in memory only and will be lost when this page closes.',
      );
      return false;
    }
  }
  function renderRecords() {
    measured = measuredFuelEconomy(records);
    get('[data-economy]').textContent =
      measured.mpg === null
        ? 'Measured MPG unavailable: at least two full fills and all intervening fills are required.'
        : `Measured full-to-full average: ${measured.mpg.toFixed(2)} MPG over ${measured.miles.toFixed(1)} miles and ${measured.gallons.toFixed(2)} US gallons (${measured.intervals.length} completed interval${measured.intervals.length === 1 ? '' : 's'}).${measured.pendingPartialFills ? ' Later partial fills are not yet included.' : ''}`;
    get('[data-measured]').disabled =
      measured.mpg == null || measured.mpg < 0.1 || measured.mpg > 200;
    const list = get('[data-records]');
    list.replaceChildren();
    for (const row of [...records].reverse()) {
      const item = documentRef.createElement('li'),
        label = documentRef.createElement('span'),
        remove = documentRef.createElement('button');
      label.textContent = `${row.date} · ${row.odometer.toLocaleString()} mi · ${row.gallons} gal · ${row.full ? 'full tank' : 'partial fill'}${row.gapBefore || row.gapAfter ? ' · deleted-fill gap excluded from MPG' : ''}`;
      remove.type = 'button';
      remove.textContent = 'Delete fill';
      remove.dataset.delete = row.id;
      item.append(label, remove);
      list.append(item);
    }
  }
  try {
    const raw = storage?.getItem(FUEL_LEDGER_KEY);
    if (raw) {
      const state = decodeFuelLedger(raw);
      records = state.records;
      for (const input of inputs)
        input.value = state.settings[input.dataset.value] || '';
      persisted = true;
    }
  } catch {
    status(
      'Saved fuel data could not be read. It has not been overwritten. Use Delete all local fuel data to clear it.',
    );
  }
  get('[data-date]').value = new Date().toLocaleDateString('en-CA');
  renderRecords();
  get('[data-route]').disabled = !planner?.getState;
  const abort = new AbortController();
  root.addEventListener(
    'input',
    (event) => {
      if (event.target.dataset.value) {
        clearResults();
        if (event.target.dataset.value === 'mpg') {
          measuredApplied = false;
          get('[data-mpg-source]').textContent =
            'Using manually entered MPG for estimates.';
        }
      }
    },
    { signal: abort.signal },
  );
  get('[data-fill]').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      try {
        if (records.length >= MAX_FUEL_RECORDS)
          throw new Error(
            `The log is limited to ${MAX_FUEL_RECORDS} fills. Delete older records to continue.`,
          );
        const id =
          globalThis.crypto?.randomUUID?.() ||
          `fill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        records = normalizeFuelRecords([
          ...records,
          {
            id,
            date: get('[data-date]').value,
            odometer: get('[data-odometer]').value,
            gallons: get('[data-gallons]').value,
            full: get('[data-full]').checked,
          },
        ]);
        renderRecords();
        clearResults();
        measuredApplied = false;
        get('[data-mpg-source]').textContent =
          'Fill history changed. Choose Use measured MPG again to update estimates.';
        get('[data-odometer]').value = '';
        get('[data-gallons]').value = '';
        get('[data-full]').checked = false;
        save();
      } catch (error) {
        status(error.message);
      }
    },
    { signal: abort.signal },
  );
  root.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      try {
        if (button.dataset.delete) {
          records = deleteFuelRecord(records, button.dataset.delete);
          renderRecords();
          clearResults();
          measuredApplied = false;
          get('[data-mpg-source]').textContent =
            'Fill deleted. Remaining full intervals may be incomplete; review the log before using measured MPG.';
          save();
        } else if (button.matches('[data-clear]')) {
          records = [];
          renderRecords();
          clearResults();
          measuredApplied = false;
          get('[data-mpg-source]').textContent =
            'Fill history cleared. MPG entry is now a manual estimate.';
          save();
        } else if (button.matches('[data-reset]')) {
          try {
            storage?.removeItem(FUEL_LEDGER_KEY);
          } catch {
            throw new Error(
              'Could not delete browser storage. Clear site storage in your browser settings.',
            );
          }
          records = [];
          for (const input of inputs) input.value = '';
          measuredApplied = false;
          persisted = false;
          renderRecords();
          clearResults();
          get('[data-mpg-source]').textContent =
            'Enter MPG or record completed full-to-full intervals.';
          status('All fuel log and estimator data deleted from this browser.');
        } else if (button.matches('[data-save]')) save();
        else if (button.matches('[data-measured]')) {
          if (!measured?.mpg || measured.mpg > 200 || measured.mpg < 0.1)
            throw new Error('No usable measured MPG is available.');
          get('[data-value="mpg"]').value = String(measured.mpg);
          measuredApplied = true;
          clearResults();
          get('[data-mpg-source]').textContent =
            'Using the measured full-to-full average from this log. Future range and cost are still estimates.';
        } else if (button.matches('[data-range]')) {
          const result = estimateFuelRange(values());
          get('[data-range-result]').textContent =
            `Estimated range: ${result.estimatedMiles.toFixed(0)} miles from ${result.usableGallons.toFixed(2)} usable US gallons, after your reserve, using ${measuredApplied ? 'measured historical' : 'manually entered'} MPG.`;
        } else if (button.matches('[data-route]')) {
          const distanceM = planner?.getState?.().route?.distanceM;
          if (!Number.isFinite(distanceM) || distanceM <= 0)
            throw new Error('Plan a route first.');
          get('[data-value="loadedMiles"]').value = (
            distanceM / 1609.344
          ).toFixed(2);
          clearResults();
          status(
            'Current route copied as loaded miles. Check empty pickup and return legs separately.',
          );
        } else if (button.matches('[data-quote]')) {
          const quote = estimateLoadQuote(values()),
            output = get('[data-quote-result]');
          output.replaceChildren();
          const lines = [
            `Estimated travel: ${quote.miles.toFixed(1)} total miles; ${quote.gallons.toFixed(2)} US gallons.`,
            `Fuel ${usd(quote.fuelCost)} + tolls ${usd(quote.tolls)} + labor ${usd(quote.labor)} + other operating costs ${usd(quote.operating)} + entered taxes/fees ${usd(quote.taxFees)} = ${usd(quote.totalCost)} estimated total cost.`,
            `Suggested counteroffer: ${usd(quote.suggestedCounteroffer)} for ${quote.targetMargin}% profit margin (${usd(quote.revenuePerTotalMile)} per total traveled mile).`,
          ];
          if (quote.offeredRevenue !== null)
            lines.push(
              `At the offered ${usd(quote.offeredRevenue)}, estimated profit is ${usd(quote.offeredProfit)}${quote.offeredMargin === null ? ' (margin undefined for zero revenue)' : ` (${quote.offeredMargin.toFixed(1)}% margin)`}.`,
            );
          for (const line of lines) {
            const p = documentRef.createElement('p');
            p.textContent = line;
            output.append(p);
          }
          status('Estimate calculated from your entries only.');
        }
      } catch (error) {
        status(error.message);
      }
    },
    { signal: abort.signal },
  );
  return {
    root,
    getState: () => ({
      records: structuredClone(records),
      settings: values(),
      persisted,
    }),
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
