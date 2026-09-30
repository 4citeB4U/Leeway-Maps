/** Browser-native installation across supported desktop and mobile browsers. */
export function installHelp(platform = navigator) {
  const ua = platform.userAgent || '';
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && platform.maxTouchPoints > 1)
  )
    return 'On iPhone or iPad, open this app in Safari, tap Share, then Add to Home Screen and Open as Web App.';
  if (/Android/.test(ua))
    return 'On Android, open this app in Chrome or Edge and choose Install app or Add to Home screen from the browser menu.';
  return 'In Chrome or Edge, use Install app in the address bar or browser menu. On a supported Mac, Safari offers File > Add to Dock. Other browsers can bookmark the app.';
}
export function mountInstallControls({ worker = 'sw.js', scope = '' } = {}) {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}${worker}`, {
        scope: `${import.meta.env.BASE_URL}${scope}`,
      })
      .catch((error) =>
        console.warn('LeeWay offline support unavailable:', error.message),
      );
  }
  if (document.getElementById('leeway-install-app')) return;
  let pending;
  const controller = new AbortController();
  const button = document.createElement('button');
  button.id = 'leeway-install-app';
  button.type = 'button';
  button.textContent = 'Install app';
  button.setAttribute('aria-label', 'Install LeeWay app on this device');
  button.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:10020;padding:9px 14px;border:1px solid #69e2ec;border-radius:8px;background:#09202b;color:white;cursor:pointer;font:13px system-ui';
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Install LeeWay app');
  dialog.style.cssText =
    'max-width:min(460px,85vw);border:1px solid #69e2ec;border-radius:12px;background:#09202b;color:white;padding:22px;font:16px/1.5 system-ui';
  const title = document.createElement('h2');
  title.textContent = 'Install on this device';
  const instructions = document.createElement('p');
  instructions.textContent = installHelp();
  const note = document.createElement('p');
  note.textContent =
    'The installed app uses the same live service. Live maps, cameras, aircraft and routing need an internet connection. Saved trips remain available through the offline viewer.';
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  dialog.append(title, instructions, note, close);
  document.body.append(button, dialog);
  const standalone = matchMedia('(display-mode: standalone)');
  const sync = () => {
    button.hidden = standalone.matches || navigator.standalone === true;
  };
  sync();
  standalone.addEventListener?.('change', sync, { signal: controller.signal });
  window.addEventListener(
    'beforeinstallprompt',
    (event) => {
      event.preventDefault();
      pending = event;
    },
    { signal: controller.signal },
  );
  window.addEventListener(
    'appinstalled',
    () => {
      pending = null;
      button.hidden = true;
    },
    { signal: controller.signal },
  );
  button.addEventListener('click', async () => {
    if (!pending) {
      dialog.showModal();
      return;
    }
    const event = pending;
    pending = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      dialog.showModal();
    }
  });
  return () => {
    controller.abort();
    dialog.remove();
    button.remove();
  };
}
