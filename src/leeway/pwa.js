/** Leave installation to browser-native UI; preserve scoped offline support. */
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
}
