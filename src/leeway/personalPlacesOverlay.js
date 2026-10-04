import * as Cesium from 'cesium';

const TIER = Object.freeze([
  { maxHeightM: 2500, radiusM: 1200, limit: 20, labelMaxM: 2200 },
  { maxHeightM: 7000, radiusM: 2500, limit: 14, labelMaxM: 7000 },
  { maxHeightM: 18000, radiusM: 5000, limit: 8, labelMaxM: 18000 },
]);

function tierFor(heightM) {
  return TIER.find((tier) => heightM <= tier.maxHeightM) || null;
}

function centerPoint(viewer) {
  const rectangle = viewer?.camera?.computeViewRectangle?.(
    viewer.scene.globe?.ellipsoid,
  );
  if (!rectangle) return null;
  const center = Cesium.Rectangle.center(rectangle);
  return {
    lat: Cesium.Math.toDegrees(center.latitude),
    lon: Cesium.Math.toDegrees(center.longitude),
  };
}

function categoryGlyph(place) {
  const raw = [place.primaryType, ...(place.types || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/restaurant|food|cafe|bakery|meal/.test(raw)) return '●';
  if (/gas|fuel|charging/.test(raw)) return '◆';
  if (/grocery|supermarket|store|shop|retail/.test(raw)) return '■';
  if (/hospital|doctor|pharmacy|health/.test(raw)) return '✚';
  if (/hotel|lodging/.test(raw)) return '▲';
  return '•';
}

export function personalPlacesTier(heightM) {
  return tierFor(Number(heightM));
}

export function mountPersonalPlacesOverlay({
  viewer,
  shell,
  fetchImpl = globalThis.fetch,
  notify = () => {},
  documentRef = document,
} = {}) {
  if (!viewer || !shell) return { toggle() {}, destroy() {} };

  const source = new Cesium.CustomDataSource('leeway-personal-places');
  viewer.dataSources.add(source);
  source.show = false;

  let enabled = false;
  let request = null;
  let lastKey = '';
  let lastAt = 0;
  let timer = null;
  let renderedCount = 0;
  let lastTier = null;
  const cache = new Map();

  const button = shell.querySelector('[data-action="places"]');

  function clear() {
    renderedCount = 0;
    source.entities.removeAll();
    viewer.scene.requestRender?.();
  }

  function cacheKey(point, tier) {
    const cell = tier.radiusM <= 1500 ? 3 : tier.radiusM <= 3000 ? 2 : 1;
    return [
      Math.round(point.lat * cell) / cell,
      Math.round(point.lon * cell) / cell,
      tier.radiusM,
    ].join(':');
  }

  function render(rows, tier) {
    clear();
    lastTier = tier;
    for (const place of rows.slice(0, tier.limit)) {
      if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude))
        continue;
      source.entities.add({
        id: 'place:' + (place.id || `${place.latitude}:${place.longitude}:${place.name}`),
        name: place.name,
        position: Cesium.Cartesian3.fromDegrees(
          place.longitude,
          place.latitude,
          0,
        ),
        point: {
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString('#ffd84d'),
          outlineColor: Cesium.Color.fromCssColorString('#081b24'),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 50000,
        },
        label: {
          text: `${categoryGlyph(place)} ${place.name}`,
          font: '600 12px system-ui',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#061622'),
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0,
            tier.labelMaxM,
          ),
          disableDepthTestDistance: 50000,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#061622').withAlpha(
            0.72,
          ),
          backgroundPadding: new Cesium.Cartesian2(5, 3),
        },
        properties: {
          source: 'Google Places',
          address: place.address || '',
          type: place.primaryType || '',
          distanceM: place.distanceM ?? null,
        },
      });
      renderedCount += 1;
    }
    viewer.scene.requestRender?.();
  }

  async function refresh({ force = false } = {}) {
    if (!enabled || documentRef.hidden) return;
    const height = Number(viewer.camera.positionCartographic?.height || Infinity);
    const tier = tierFor(height);
    if (!tier) {
      lastKey = '';
      clear();
      return;
    }
    const point = centerPoint(viewer);
    if (!point) return;
    const key = cacheKey(point, tier);
    if (!force && key === lastKey && Date.now() - lastAt < 120000) return;
    lastKey = key;
    lastAt = Date.now();
    request?.abort();
    const cached = cache.get(key);
    if (cached && cached.until > Date.now()) {
      render(cached.rows, tier);
      return;
    }
    request = new AbortController();
    const url = new URL(
      '/api/google/nearby-places',
      globalThis.location?.origin || 'http://localhost',
    );
    url.searchParams.set('lat', point.lat.toFixed(6));
    url.searchParams.set('lon', point.lon.toFixed(6));
    url.searchParams.set('radiusM', String(tier.radiusM));
    try {
      const response = await fetchImpl(url.pathname + url.search, {
        signal: request.signal,
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (request.signal.aborted) return;
      const rows = Array.isArray(data.places) ? data.places : [];
      if (!response.ok || data.configured === false) {
        clear();
        return;
      }
      cache.set(key, { rows, until: Date.now() + 300000 });
      if (cache.size > 24) cache.delete(cache.keys().next().value);
      render(rows, tier);
    } catch (error) {
      if (error?.name !== 'AbortError') clear();
    }
  }

  const removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => {
    clearTimeout(timer);
    timer = setTimeout(() => refresh(), 180);
  });

  function setEnabled(next) {
    enabled = Boolean(next);
    source.show = enabled;
    button?.classList.toggle('active', enabled);
    button?.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      notify('Nearby places on · labels increase as you zoom closer');
      void refresh({ force: true });
    } else {
      request?.abort();
      clear();
      notify('Nearby places off');
    }
    viewer.scene.requestRender?.();
  }

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      setEnabled(!enabled);
    },
    setEnabled,
    refresh,
    getStats() {
      return {
        enabled,
        renderedCount,
        tierMaxHeightM: lastTier?.maxHeightM ?? null,
        tierLimit: lastTier?.limit ?? 0,
        cacheEntries: cache.size,
      };
    },
    destroy() {
      clearTimeout(timer);
      request?.abort();
      removeMoveEnd?.();
      viewer.dataSources.remove(source, true);
    },
  };
}
