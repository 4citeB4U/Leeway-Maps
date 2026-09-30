const { app, BrowserWindow, shell, dialog, session } = require('electron');
const config = require('./app-config.json');
const start = new URL(config.url);
const allowed = (value) => {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      u.origin === start.origin &&
      u.pathname.startsWith(start.pathname)
    );
  } catch {
    return false;
  }
};
app.enableSandbox();
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      if (
        !allowed(contents.getURL()) ||
        details?.isMainFrame === false ||
        (details?.requestingUrl && !allowed(details.requestingUrl)) ||
        !['media', 'geolocation', 'notifications'].includes(permission)
      )
        return callback(false);
      dialog
        .showMessageBox({
          type: 'question',
          buttons: ['Deny', 'Allow'],
          defaultId: 0,
          cancelId: 0,
          message: `Allow ${config.name} to use ${permission}?`,
          detail: 'This permission applies to the current app request.',
        })
        .then(
          (result) => callback(result.response === 1),
          () => callback(false),
        );
    },
  );
  const create = () => {
    const win = new BrowserWindow({
      title: config.name,
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (!allowed(url)) {
        event.preventDefault();
        if (url.startsWith('https://')) void shell.openExternal(url);
      }
    });
    win.loadURL(config.url);
  };
  create();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) create();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
