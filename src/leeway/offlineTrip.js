/** Persist only the last calculated trip; retain the existing online Cesium map. */
export function mountOfflineTrip({ planner, onStatus = () => {} } = {}) {
  if (!planner?.subscribe)
    throw new Error('Offline trip continuity needs a route planner.');
  const core = import(
    /* @vite-ignore */ `${import.meta.env.BASE_URL}offlineTripCore.js`
  );
  const section = document.createElement('div');
  section.className = 'lrp-offline-trip';
  section.style.cssText = 'padding:10px 0;font:12px/1.5 system-ui';
  const label = document.createElement('p');
  label.setAttribute('role', 'status');
  const link = document.createElement('a');
  link.href = `${import.meta.env.BASE_URL}offline.html`;
  link.textContent = 'Open saved offline trip';
  link.style.color = '#74f5ff';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Delete saved trip';
  remove.style.cssText = 'margin-left:10px;min-height:40px';
  section.append(label, link, remove);
  planner.root.append(section);
  let destroyed = false,
    revision = 0;
  function render(result) {
    if (destroyed) return;
    label.textContent = result.trip
      ? `Saved on this device: ${new Date(result.trip.savedAt).toLocaleString()}${result.trip.active ? '' : ' · previous route (planner changed)'}. Includes route and addresses; no basemap, live conditions or new routing offline.`
      : result.error ||
        'Calculate a route to save one trip on this device for offline reopening. No GPS history is saved.';
    remove.disabled = !result.trip && result.state !== 'unavailable';
    onStatus(label.textContent);
  }
  async function change(event) {
    const own = ++revision;
    try {
      const api = await core;
      if (destroyed || own !== revision) return;
      if (event.type === 'route-ready' && event.state?.route)
        api.saveTrip(event.state.route);
      else if (event.type === 'route-cleared' || event.type === 'stops-changed')
        api.markTripPrevious();
      render(api.loadTrip());
    } catch (error) {
      if (!destroyed && own === revision) {
        label.textContent = `Offline trip could not be saved: ${error.message}. A previous saved trip may remain.`;
        onStatus(label.textContent);
      }
    }
  }
  const unsubscribe = planner.subscribe(change);
  remove.onclick = async () => {
    revision++;
    try {
      const api = await core;
      api.deleteTrip();
      render(api.loadTrip());
    } catch (error) {
      label.textContent = `Could not delete saved trip: ${error.message}`;
    }
  };
  void core
    .then((api) => {
      if (destroyed) return;
      const current = planner.getState?.().route;
      if (current)
        void change({ type: 'route-ready', state: { route: current } });
      else render(api.loadTrip());
    })
    .catch((error) => {
      if (!destroyed)
        label.textContent = `Offline trip support unavailable: ${error.message}`;
    });
  return {
    destroy() {
      destroyed = true;
      revision++;
      unsubscribe?.();
      section.remove();
    },
  };
}
