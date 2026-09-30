import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { mountPersonalTravelPanel } from './leeway/personalTravelPanel.js';
import { mountAgentLeeGemma } from './leeway/agentLeeGemma.js';
import { mountMapsShell } from './leeway/mapsShell.js';
import { installWorldApiBridge } from './leeway/worldApiBridge.js';
import { mountInstallControls } from './leeway/pwa.js';
import { initAgentLeeVoiceEntry } from './leeway/agentLeeVoiceEntry.js';

document.body.dataset.leewayEdition = 'personal';
installWorldApiBridge();
mountInstallControls({
  worker: 'sw.js',
  scope: '',
});

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
  voice: { initialize: initAgentLeeVoiceEntry },
});

application
  .start()
  .then(async () => {
    const personalShell = mountMapsShell(application, {
      edition: 'personal',
    });
    mountAgentLeeGemma(application, personalShell);
    void mountPersonalTravelPanel(application, { edition: 'personal' }).catch(
      (error) => {
        console.error('Public travel panel unavailable', error);
        personalShell.notify(
          'Public travel data unavailable; map remains usable',
        );
      },
    );
  })
  .catch((error) => {
    console.error('LeeWay Maps initialization failed:', error);
    const loaderStatus = document.querySelector(
      '#loading-screen .loader-status',
    );
    if (loaderStatus) {
      loaderStatus.textContent = `Error: ${describeError(error)}`;
      loaderStatus.style.color = '#ff4444';
    }
  });

export { application };
