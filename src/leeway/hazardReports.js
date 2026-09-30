import { createHazardReportsClient } from './hazardReportsClient.js';
import {
  HAZARD_KINDS,
  reportPoint,
  validSharedReport,
} from './hazardReportContract.js';
import { worldApiBase } from './worldApiBridge.js';
import './hazardReports.css';

/** Parent supplies a user-picked map point and may render onReports(rows) as markers. */
export function mountHazardReports({
  container,
  getMapPoint,
  onReports = () => {},
  documentRef = globalThis.document,
  geolocation = globalThis.navigator?.geolocation,
  createClient = createHazardReportsClient,
} = {}) {
  const root = documentRef.createElement('section');
  root.className = 'lw-hazard-reports';
  root.innerHTML = `<div class="lw-hazard-heading"><h2>Driver road reports</h2><button type="button" data-close aria-label="Close road reports">×</button></div>
    <p>Community observations are unverified and expire. They do not establish that a road is safe or clear.</p>
    <details><summary>Shared report server</summary>
      <label>Server URL<input data-server type="url" placeholder="https://your-report-server.example" autocomplete="off"></label>
      <label>Posting access token<input data-token type="password" autocomplete="off" placeholder="Provided by the report server operator"></label>
      <p>The token stays in this panel's memory. Reports are shared only with drivers using the same server and are lost if it restarts.</p>
      <button type="button" data-check>Check server</button>
    </details>
    <label>What did you observe?<select data-kind></select></label>
    <p>Center the map on the incident, then choose Use map center. Choosing a location does not publish it.</p>
    <div class="lw-hazard-actions"><button type="button" data-map>Use map center</button><button type="button" data-gps>Use my location</button></div>
    <p data-point>No location selected. Nothing has been shared.</p>
    <p>Report shares this approximate location (rounded to about 100 m) and the selected incident type with other users of this server. No name, photo, plate, or precise GPS fix is sent. Nearby refresh sends the chosen approximate location to this server.</p>
    <div class="lw-hazard-actions"><button type="button" data-report disabled>Report to other drivers</button><button type="button" data-nearby disabled>Refresh reports within 10 km</button></div>
    <p data-status role="status" aria-live="polite">Server not checked. Nothing has been broadcast.</p>
    <ul data-reports aria-label="Nearby community reports"></ul>`;
  container.append(root);
  const find = (selector) => root.querySelector(selector);
  const status = (text) => {
    if (!destroyed) find('[data-status]').textContent = text;
  };
  let selected = null,
    destroyed = false,
    busy = false,
    displayed = [];
  const controller = new AbortController();
  find('[data-server]').value = worldApiBase();
  for (const [kind, spec] of Object.entries(HAZARD_KINDS)) {
    const option = documentRef.createElement('option');
    option.value = kind;
    option.textContent = spec.label;
    find('[data-kind]').append(option);
  }
  function stage(point) {
    selected = reportPoint(point);
    find('[data-point]').textContent =
      'Approximate map location selected. Not shared yet.';
    find('[data-report]').disabled = false;
    find('[data-nearby]').disabled = false;
  }
  function render(rows, truncated = false) {
    displayed = rows;
    const list = find('[data-reports]');
    list.replaceChildren();
    for (const row of rows) {
      const li = documentRef.createElement('li');
      li.textContent = `${HAZARD_KINDS[row.kind].label} · community, unverified · reported ${new Date(row.createdAt).toLocaleTimeString()} · expires ${new Date(row.expiresAt).toLocaleTimeString()}`;
      list.append(li);
    }
    try {
      onReports(rows);
    } catch {
      /* A marker failure cannot undo confirmed publication. */
    }
    return `${rows.length} unexpired community report${rows.length === 1 ? '' : 's'} returned within 10 km${truncated ? '; more results exist' : ''}. This does not establish that the road is clear.`;
  }
  async function run(action) {
    if (busy || destroyed) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try {
      await action();
    } catch (error) {
      status(
        error.message ||
          'Shared service unavailable. Publication not confirmed.',
      );
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
    }
  }
  const client = () => createClient({ serverUrl: find('[data-server]').value });
  find('[data-close]').onclick = () => {
    root.hidden = true;
  };
  find('[data-check]').onclick = () =>
    run(async () => {
      const result = await client().status({ signal: controller.signal });
      status(
        result.available
          ? 'Shared server reachable. Press Report to publish your selected location; nothing shared yet.'
          : 'Shared reporting unavailable. Nothing will be broadcast.',
      );
    });
  find('[data-map]').onclick = () =>
    run(async () => {
      if (typeof getMapPoint !== 'function')
        throw new Error(
          'Map location is unavailable. Use my location instead.',
        );
      const point = await getMapPoint();
      if (!point)
        throw new Error(
          'Center the map on the incident first. Nothing shared.',
        );
      if (!destroyed) {
        stage(point);
        status('Map location selected. Press Report only when ready to share.');
      }
    });
  find('[data-gps]').onclick = () =>
    run(async () => {
      if (!geolocation)
        throw new Error('Location is unavailable on this device.');
      const fix = await new Promise((resolve, reject) =>
        geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 30000,
        }),
      );
      if (!destroyed) {
        stage({ lat: fix.coords.latitude, lon: fix.coords.longitude });
        const accuracy = Number.isFinite(fix.coords.accuracy)
          ? ` Device accuracy is about ${Math.round(fix.coords.accuracy)} m.`
          : '';
        status(`Approximate location selected.${accuracy} Nothing shared yet.`);
      }
    });
  find('[data-nearby]').onclick = () =>
    run(async () => {
      if (!selected) throw new Error('Choose a location first.');
      const result = await client().nearby(selected, {
        signal: controller.signal,
      });
      if (!destroyed) status(render(result.reports, result.truncated));
    });
  find('[data-report]').onclick = () =>
    run(async () => {
      if (!selected) throw new Error('Choose a location first.');
      const input = { ...selected, kind: find('[data-kind]').value };
      const result = await client().publish(input, find('[data-token]').value, {
        signal: controller.signal,
      });
      if (destroyed) return;
      status(
        `Published to this report server: ${HAZARD_KINDS[result.report.kind].label}. Community, unverified; expires ${new Date(result.report.expiresAt).toLocaleTimeString()}. Other drivers must use this same server.`,
      );
      // Server-confirmed only. A network failure never becomes a local broadcast marker.
      render([result.report]);
    });
  const expiryTimer = setInterval(() => {
    const active = displayed.filter((row) => validSharedReport(row));
    if (!destroyed && active.length !== displayed.length) {
      render(active);
      status(
        'Expired reports removed. Refresh nearby reports for current observations.',
      );
    }
  }, 15000);
  return {
    root,
    setPoint: stage,
    destroy() {
      destroyed = true;
      clearInterval(expiryTimer);
      controller.abort();
      find('[data-token]').value = '';
      root.remove();
      onReports([]);
    },
  };
}
