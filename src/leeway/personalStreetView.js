import * as Cesium from 'cesium';

export function screenPointToLonLat(viewer, clientX, clientY) {
  const canvas = viewer?.scene?.canvas;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  let cartesian = null;
  try {
    if (viewer.scene.pickPositionSupported)
      cartesian = viewer.scene.pickPosition(new Cesium.Cartesian2(x, y));
  } catch {}
  if (!cartesian) {
    try {
      cartesian = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(x, y),
        viewer.scene.globe?.ellipsoid,
      );
    } catch {}
  }
  if (!cartesian) return null;
  const c = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lat: Cesium.Math.toDegrees(c.latitude),
    lon: Cesium.Math.toDegrees(c.longitude),
  };
}

export function mountPersonalStreetView({
  shell,
  viewer,
  notify = () => {},
  documentRef = document,
} = {}) {
  const rail = shell?.querySelector?.('.lm-rail');
  if (!rail || !viewer)
    return { destroy() {}, openAt() {}, open() {}, close() {}, isOpen: () => false };

  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'lws-nav lm-streetview-pegman';
  button.setAttribute('aria-label', 'Drag Street View person onto the map');
  button.innerHTML =
    '<span class="lm-pegman" aria-hidden="true"><span class="lm-peg-head"></span><span class="lm-peg-body"></span></span><span>Street View</span>';
  rail.insertBefore(button, rail.querySelector('.lws-spacer'));

  const panel = documentRef.createElement('section');
  panel.className = 'lm-streetview-viewport';
  panel.hidden = true;
  panel.innerHTML = `
    <header><strong>Street View</strong><span data-street-coords></span><button type="button" data-street-close aria-label="Close Street View">×</button></header>
    <div class="lm-street-image-wrap"><img data-street-image alt="Street View" /></div>
    <nav class="lm-street-heading" aria-label="Street View direction">
      <button type="button" data-turn="-45">↶</button>
      <button type="button" data-turn="45">↷</button>
      <button type="button" data-street-refresh>Refresh</button>
    </nav>
  `;
  shell.append(panel);
  const image = panel.querySelector('[data-street-image]');
  const coords = panel.querySelector('[data-street-coords]');
  let point = null;
  let heading = 0;
  let drag = null;
  let ghost = null;

  function sourceUrl() {
    if (!point) return '';
    const q = new URLSearchParams({
      lat: point.lat.toFixed(6),
      lon: point.lon.toFixed(6),
      heading: String((heading + 360) % 360),
      pitch: '0',
      fov: '90',
    });
    return '/api/streetview/image?' + q;
  }

  function refresh() {
    if (!point) return;
    coords.textContent = `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
    image.removeAttribute('src');
    image.src = sourceUrl();
  }

  function openAt(next) {
    if (!next) return false;
    point = next;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    refresh();
    return true;
  }

  function centerPoint() {
    const canvas = viewer.scene.canvas;
    const rect = canvas.getBoundingClientRect();
    return screenPointToLonLat(
      viewer,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  }

  function open() {
    const center = point || centerPoint();
    if (!openAt(center)) {
      notify('Street View is unavailable at the current map center.');
      return { ok: false };
    }
    return { ok: true };
  }

  function close() {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    image.removeAttribute('src');
    return { ok: true };
  }

  button.addEventListener('click', open);

  const move = (event) => {
    if (!drag || !ghost) return;
    ghost.style.left = event.clientX + 8 + 'px';
    ghost.style.top = event.clientY + 8 + 'px';
  };
  const up = (event) => {
    if (!drag) return;
    const dropped = screenPointToLonLat(viewer, event.clientX, event.clientY);
    drag = null;
    ghost?.remove();
    ghost = null;
    documentRef.removeEventListener('pointermove', move);
    if (!openAt(dropped))
      notify('Drop the Street View person directly on the map.');
  };
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    ghost = documentRef.createElement('div');
    ghost.className = 'lm-pegman-ghost';
    ghost.textContent = '●';
    documentRef.body.append(ghost);
    move(event);
    documentRef.addEventListener('pointermove', move);
    documentRef.addEventListener('pointerup', up, { once: true });
  });

  panel.querySelector('[data-street-close]').onclick = close;
  panel.querySelector('[data-street-refresh]').onclick = refresh;
  for (const control of panel.querySelectorAll('[data-turn]')) {
    control.onclick = () => {
      heading = (heading + Number(control.dataset.turn || 0) + 360) % 360;
      refresh();
    };
  }

  return {
    root: panel,
    open,
    openAt,
    close,
    isOpen: () => !panel.hidden,
    destroy() {
      documentRef.removeEventListener('pointermove', move);
      ghost?.remove();
      button.remove();
      panel.remove();
    },
  };
}
