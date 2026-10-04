import {
  getLanguage,
  setLanguage,
  languageOptions,
  mountLocaleLabels,
} from './experienceLocale.js';
import './experiencePreferences.css';

export function mountExperiencePreferences() {
  const root = document.createElement('section');
  root.className = 'lw-preferences';
  root.hidden = true;
  root.setAttribute('aria-label', 'Settings and map atlas');
  root.innerHTML = `<header><h2>Settings</h2><button type="button" data-close>Close</button></header>
    <h3>Welcome to LeeWay</h3><label>Which language do you prefer?<select aria-label="Preferred language">${languageOptions()}</select></label>
    <button type="button" data-apply>Apply language</button>
    <p data-coverage></p>
    <h3>Music</h3><label>Choose music from this device<input type="file" accept="audio/*" data-music /></label>
    <audio controls preload="metadata" hidden aria-label="Music player"></audio><p data-track translate="no"></p>
    <nav aria-label="Music apps"><a href="https://open.spotify.com/" target="_blank" rel="noopener">Spotify ↗</a><a href="https://music.youtube.com/" target="_blank" rel="noopener">YouTube Music ↗</a><a href="https://music.apple.com/" target="_blank" rel="noopener">Apple Music ↗</a></nav>
    <p data-music-note></p>
    <h3>Map atlas</h3>
    <p class="lw-atlas-intro">Use this atlas to understand map controls, multimodal layers, icons, and the difference between live, scheduled, mapped, and simulated information.</p>
    <div class="lw-atlas-grid">
      <details><summary>Map & navigation</summary><div class="lw-atlas-body"><b>▦ Map</b> main spatial view · <b>▤ Transit</b> public transportation · <b>▥ Rail</b> rail/transit context · <b>▥ Intelligence</b> world layers · <b>⚙ Settings</b> preferences and atlas · <b>✦ Agent Lee</b> map copilot. Directions and Road stops remain trip-planning tools rather than live layers.</div></details>
      <details><summary>Public transit</summary><div class="lw-atlas-body">Transit uses independent <b>Routes</b>, <b>Stops & departures</b>, and <b>Reported vehicles</b>. Route lines show the published or mapped service geometry. Stops show scheduled/estimated departures only when an authoritative source supplies them. Vehicle markers are source-reported GPS positions; a vehicle position alone is not an arrival prediction.</div></details>
      <details><summary>Rail, air & marine</summary><div class="lw-atlas-body"><b>Rail</b> uses published transit network data and supported real-time rail feeds. <b>Air</b> shows public aircraft position data plus source-authorized enrichment. <b>Marine</b> shows reported AIS vessels. Gate, terminal, exact departure/arrival, and vessel-port schedule claims require an explicit authoritative source and are not inferred from motion.</div></details>
      <details><summary>Layer & truth states</summary><div class="lw-atlas-body"><span class="lw-truth live">LIVE</span> source-reported now · <span class="lw-truth scheduled">SCHEDULED</span> published timetable · <span class="lw-truth mapped">MAPPED</span> geometry/context only · <span class="lw-truth simulated">SIMULATED</span> training/replay · <span class="lw-truth stale">STALE</span> old observation · <span class="lw-truth unavailable">UNAVAILABLE</span> no usable source/key/coverage. The map must not convert one state into another silently.</div></details>
      <details><summary>Interaction states</summary><div class="lw-atlas-body"><b>Default</b> icon/line · <b>Hover</b> quick context · <b>Selected</b> highlighted object · <b>Expanded</b> richer card · <b>Tracked</b> follow a moving subject · <b>Linked panel</b> complete context and actions. Viewport changes should automatically discover the providers relevant to the area being viewed.</div></details>
    </div>`;
  document.body.append(root);
  const language = root.querySelector('select'),
    audio = root.querySelector('audio');
  let mediaUrl;
  const coverage = {
    en: 'Map and voice controls are translated. Guidance details and provider content are not fully translated yet. Voice availability depends on the selected service.',
    es: 'Los controles del mapa y de voz están traducidos. Los detalles de navegación y el contenido de proveedores aún no están completamente traducidos. La voz depende del servicio elegido.',
    fr: 'Les commandes de carte et de voix sont traduites. Les détails du guidage et les contenus des fournisseurs ne sont pas encore entièrement traduits. La voix dépend du service choisi.',
    zh: '地图和语音控件已翻译。导航详情和数据提供方内容尚未完全翻译。语音支持取决于所选服务。',
    ru: 'Элементы карты и голосового управления переведены. Подробности навигации и данные поставщиков пока переведены не полностью. Голос зависит от выбранного сервиса.',
    mn: 'Газрын зураг болон дууны удирдлагыг орчуулсан. Чиглүүлэлтийн дэлгэрэнгүй мэдээлэл, нийлүүлэгчийн агуулгыг бүрэн орчуулаагүй. Дууны боломж сонгосон үйлчилгээнээс хамаарна.',
  };
  const musicNotes = {
    en: 'Device files stay on this device. Music apps open separately and keep their own login, playback and voice controls. Agent Lee does not control them.',
    es: 'Los archivos permanecen en este dispositivo. Las apps de música se abren por separado y conservan sus propios controles. Agent Lee no las controla.',
    fr: 'Les fichiers restent sur cet appareil. Les applications musicales s’ouvrent séparément et gardent leurs commandes. Agent Lee ne les contrôle pas.',
    zh: '本机文件保留在此设备上。音乐应用单独打开，使用各自的登录和播放控制。Agent Lee 不控制这些应用。',
    ru: 'Файлы остаются на устройстве. Музыкальные приложения открываются отдельно со своими средствами управления. Agent Lee ими не управляет.',
    mn: 'Файлууд төхөөрөмж дээрээ үлдэнэ. Хөгжмийн аппууд тусдаа нээгдэж, өөрийн удирдлагыг ашиглана. Agent Lee тэдгээрийг удирдахгүй.',
  };
  function refresh() {
    language.value = getLanguage().code;
    root.querySelector('[data-coverage]').textContent =
      coverage[language.value];
    root.querySelector('[data-music-note]').textContent =
      musicNotes[language.value];
  }
  const stopLabels = mountLocaleLabels();
  refresh();
  globalThis.addEventListener('leeway:language', refresh);
  root.querySelector('[data-apply]').addEventListener('click', () => {
    setLanguage(language.value);
    root.hidden = true;
  });
  root.querySelector('[data-close]').addEventListener('click', () => {
    root.hidden = true;
  });
  root.querySelector('[data-music]').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    audio.pause();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = URL.createObjectURL(file);
    audio.src = mediaUrl;
    audio.hidden = false;
    root.querySelector('[data-track]').textContent = file.name;
  });
  // First-use language onboarding does not block the map or request location.
  try {
    if (!localStorage.getItem('leeway.maps.language')) root.hidden = false;
  } catch {}
  return {
    open() {
      root.hidden = false;
      refresh();
      language.focus();
    },
    openAtlas() {
      root.hidden = false;
      refresh();
      const first = root.querySelector('.lw-atlas-grid details');
      if (first) first.open = true;
      first?.querySelector('summary')?.focus?.();
    },
    destroy() {
      audio.pause();
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      stopLabels();
      globalThis.removeEventListener('leeway:language', refresh);
      root.remove();
    },
  };
}
