export function _clearCctvFrame() {
  this._cctvFrameRequestToken += 1;
  if (this._cctvFramePreloader) {
    this._cctvFramePreloader.onload = null;
    this._cctvFramePreloader.onerror = null;
  }
  this._cctvFramePreloader = null;
  if (this._cctvFrame) {
    this._cctvFrame.classList.remove('active');
    this._cctvFrame.removeAttribute('src');
    this._cctvFrame.dataset.cameraId = '';
    this._cctvFrame.dataset.currentSrc = '';
    this._cctvFrame.dataset.loading = '';
    this._cctvFrame.dataset.error = '';
    this._cctvFrame.dataset.nativeWidth = '';
    this._cctvFrame.dataset.nativeHeight = '';
    this._cctvFrame.dataset.quality = '';
  }
  this._cctvFrameWrap?.classList.remove('loading', 'has-frame');
  if (this._cctvFrameMessage) {
    this._cctvFrameMessage.hidden = true;
    this._cctvFrameMessage.textContent = '';
  }
}

export function _queueCctvFrame(src, cameraId, cameraChanged) {
  if (this.destroyed || !this._cctvFrame || !src) return;

  if (cameraChanged) {
    // A different camera gets an honest acquisition state. Never retain
    // the prior camera's pixels under the newly selected metadata.
    this._cctvFrame.classList.remove('active');
    this._cctvFrame.removeAttribute('src');
    this._cctvFrame.dataset.nativeWidth = '';
    this._cctvFrame.dataset.nativeHeight = '';
    this._cctvFrame.dataset.quality = '';
    this._cctvFrameWrap?.classList.remove('has-frame');
  }

  if (this._cctvFramePreloader) {
    this._cctvFramePreloader.onload = null;
    this._cctvFramePreloader.onerror = null;
  }
  const token = ++this._cctvFrameRequestToken;
  this._cctvFrame.dataset.cameraId = cameraId;
  this._cctvFrame.dataset.currentSrc = src;
  this._cctvFrame.dataset.loading = 'true';
  this._cctvFrame.dataset.error = '';
  if (this._cctvFrameMessage) {
    this._cctvFrameMessage.hidden = false;
    this._cctvFrameMessage.textContent = 'Checking this public camera feed…';
  }
  this._cctvFrameWrap?.classList.toggle(
    'loading',
    !this._cctvFrameWrap?.classList.contains('has-frame'),
  );

  const preloader = new Image();
  this._cctvFramePreloader = preloader;
  preloader.onload = () =>
    this._settleCctvFrame(token, src, true, {
      width: Number(preloader.naturalWidth) || 0,
      height: Number(preloader.naturalHeight) || 0,
    });
  preloader.onerror = () => this._settleCctvFrame(token, src, false);
  preloader.src = src;
}

export function _settleCctvFrame(token, src, ok, dimensions = {}) {
  if (
    this.destroyed ||
    !this._cctvFrame ||
    token !== this._cctvFrameRequestToken
  )
    return;
  if (this._cctvFramePreloader) {
    this._cctvFramePreloader.onload = null;
    this._cctvFramePreloader.onerror = null;
  }
  this._cctvFramePreloader = null;
  this._cctvFrame.dataset.loading = '';
  this._cctvFrameWrap?.classList.remove('loading');

  const syncBadge = () =>
    this._syncCctvSourceBadge(
      this._cctvState?.activeCamera,
      !!this._cctvState?.enabled && !!this.actions.isEnabled(),
    );

  if (!ok) {
    // Leave the element untouched — a settled frame stays on screen.
    this._cctvFrame.dataset.error = 'true';
    if (this._cctvFrameMessage) {
      this._cctvFrameMessage.hidden = false;
      this._cctvFrameMessage.textContent =
        'This public camera did not return a usable frame. Trying another source…';
    }
    syncBadge();
    if (typeof this._cctvFrame.dispatchEvent === 'function')
      this._cctvFrame.dispatchEvent(
        new CustomEvent('leeway:cctv-frame-unavailable', {
          bubbles: true,
          detail: { cameraId: this._cctvFrame.dataset.cameraId || '' },
        }),
      );
    return;
  }

  this._cctvFrame.dataset.error = '';
  const width = Number(dimensions.width) || 0;
  const height = Number(dimensions.height) || 0;
  this._cctvFrame.dataset.nativeWidth = String(width || '');
  this._cctvFrame.dataset.nativeHeight = String(height || '');
  const pixels = width * height;
  this._cctvFrame.dataset.quality =
    pixels >= 700_000 ? 'hd' : pixels >= 300_000 ? 'standard' : 'low';
  this._cctvFrame.src = src;
  this._cctvFrame.classList.add('active');
  this._cctvFrameWrap?.classList.add('has-frame');
  if (this._cctvFrameMessage) {
    this._cctvFrameMessage.hidden = true;
    this._cctvFrameMessage.textContent = '';
  }
  if (typeof this._cctvFrame.dispatchEvent === 'function')
    this._cctvFrame.dispatchEvent(
      new CustomEvent('leeway:cctv-frame-ready', {
        bubbles: true,
        detail: {
          cameraId: this._cctvFrame.dataset.cameraId || '',
          width,
          height,
          quality: this._cctvFrame.dataset.quality,
        },
      }),
    );
  syncBadge();
}

export function _syncCctvSourceBadge(activeCamera, enabled) {
  if (!this._cctvSourceBadge) return;
  if (!enabled || !activeCamera) {
    this._cctvSourceBadge.textContent = 'SOURCE · UNKNOWN';
    this._cctvSourceBadge.dataset.frameState = 'idle';
    return;
  }
  const hasDisplayedFrame =
    this._cctvFrameWrap?.classList.contains('has-frame');
  if (this._cctvFrame?.dataset.loading === 'true' && !hasDisplayedFrame) {
    this._cctvSourceBadge.textContent = 'FRAME · LOADING';
    this._cctvSourceBadge.dataset.frameState = 'loading';
    return;
  }
  if (this._cctvFrame?.dataset.error === 'true' && !hasDisplayedFrame) {
    this._cctvSourceBadge.textContent = 'FRAME · UNAVAILABLE';
    this._cctvSourceBadge.dataset.frameState = 'error';
    return;
  }
  const kind = String(
    activeCamera.sourceKind || activeCamera.feedType || 'unknown',
  ).toUpperCase();
  const status = String(activeCamera.sourceStatus || 'unknown').toUpperCase();
  const width = Number(this._cctvFrame?.dataset.nativeWidth) || 0;
  const height = Number(this._cctvFrame?.dataset.nativeHeight) || 0;
  const resolution = width && height ? ` · ${width}×${height}` : '';
  const quality = this._cctvFrame?.dataset.quality
    ? ` · ${String(this._cctvFrame.dataset.quality).toUpperCase()}`
    : '';
  this._cctvSourceBadge.textContent = `${kind} · ${status}${resolution}${quality}`;
  this._cctvSourceBadge.dataset.frameState = 'ready';
}
