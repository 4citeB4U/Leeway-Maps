/** Rehome existing shared map controls; never switch the application presentation. */
export function mountMapToolsPanel({ shell, documentRef = document } = {}) {
  const doc = documentRef;
  const launcher = doc.createElement('button');
  launcher.type = 'button'; launcher.className = 'lws-dock-btn';
  launcher.textContent = 'Map settings'; launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'leeway-map-tools');
  shell.querySelector('.lws-dock')?.appendChild(launcher);
  const host = doc.createElement('section');
  host.id = 'leeway-map-tools'; host.hidden = true;
  host.setAttribute('aria-label', 'Map settings');
  const header = doc.createElement('header');
  const title = doc.createElement('strong'); title.textContent = 'Map settings';
  const closeButton = doc.createElement('button'); closeButton.type = 'button';
  closeButton.textContent = 'Close'; closeButton.setAttribute('aria-label', 'Close map settings');
  header.append(title, closeButton);
  const tabs = doc.createElement('div'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Map settings sections');
  host.append(header, tabs);
  const records = [];
  for (const [key, label, panelId, toggleSelector] of [
    ['views', 'Views', 'control-panel', '#control-panel-toggle'],
    ['layers', 'Layers', 'data-panel', '[data-collapse-target="data-panel"]'],
    ['scenes', 'Scenes', 'scene-panel', '[data-collapse-target="scene-panel"]'],
  ]) {
    const tab = doc.createElement('button'); tab.type = 'button'; tab.textContent = label;
    tab.id = `map-tools-tab-${key}`; tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `map-tools-${key}`);
    const slot = doc.createElement('div'); slot.id = `map-tools-${key}`;
    slot.className = 'lmt-content'; slot.setAttribute('role', 'tabpanel');
    slot.setAttribute('aria-labelledby', tab.id); slot.hidden = true;
    const panel = doc.getElementById(panelId);
    const record = { key, tab, slot, panel, parent: panel?.parentNode, next: panel?.nextSibling,
      collapsed: panel?.classList.contains('collapsed'), toggleSelector };
    if (panel) slot.appendChild(panel);
    else { const unavailable = doc.createElement('p'); unavailable.textContent = `${label} controls are unavailable in this build.`; slot.appendChild(unavailable); }
    tabs.appendChild(tab); host.appendChild(slot); records.push(record);
    tab.onclick = () => select(key);
  }
  const display = doc.getElementById('pp-toggles');
  const displayRecord = display ? { panel: display, parent: display.parentNode, next: display.nextSibling,
    collapsed: display.classList.contains('collapsed'), toggleSelector: '[data-collapse-target="pp-toggles"]' } : null;
  if (display) records[0].slot.appendChild(display);
  const style = doc.createElement('style');
  style.textContent = `
 #leeway-map-tools{position:fixed;top:var(--map-tools-top,166px);bottom:var(--map-tools-bottom,170px);left:100px;width:min(470px,calc(100vw - 124px));z-index:9850;display:flex;flex-direction:column;min-height:0;border:1px solid #377488;border-radius:12px;background:#071a25;color:#eefaff;box-shadow:0 10px 30px #0008;font:13px/1.4 system-ui;overflow:hidden;pointer-events:auto}
 #leeway-map-tools[hidden],#leeway-map-tools [role=tabpanel][hidden]{display:none!important}
 #leeway-map-tools>header,#leeway-map-tools>[role=tablist]{display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #294957;flex:none}
 #leeway-map-tools>header{justify-content:space-between}#leeway-map-tools button{color:inherit}#leeway-map-tools>header button,#leeway-map-tools>[role=tablist]>button{background:#102f40;border:1px solid #467787;border-radius:7px;padding:8px 12px;cursor:pointer}#leeway-map-tools [role=tab][aria-selected=true]{background:#195a70}
 #leeway-map-tools>.lmt-content{min-height:0;overflow:auto;padding:10px;flex:1;overscroll-behavior:contain}
 body.leeway-enterprise-shell #leeway-map-tools :is(#control-panel,#data-panel,#scene-panel,#pp-toggles){position:relative!important;inset:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;width:100%!important;max-width:none!important;max-height:none!important;margin:0!important;display:block!important}
 #leeway-map-tools #pp-toggles{margin-top:12px!important}#leeway-map-tools .pp-panel-body{max-height:none!important;overflow:visible!important}
 #leeway-map-tools .panel-glow{display:none}#leeway-map-tools :is(.panel-inner,.data-panel-inner,.scene-panel-inner){max-height:none;overflow:visible}
 #leeway-map-tools #control-panel-popover{position:relative!important;inset:auto!important;transform:none!important;max-height:none!important;width:auto!important}
 #leeway-map-tools :is(.dock-pin-btn,.panel-collapse-btn,#control-panel-toggle){display:none!important}
 @media(max-width:720px){#leeway-map-tools{left:8px;right:8px;width:auto;top:var(--map-tools-top,245px);bottom:var(--map-tools-bottom,230px)}}
 `;
  doc.head.appendChild(style); doc.body.appendChild(host);
  let active = 'views', destroyed = false;
  function select(key) {
    active = records.some(row => row.key === key) ? key : 'views';
    for (const row of records) {
      const selected = row.key === active;
      row.tab.setAttribute('aria-selected', String(selected)); row.tab.tabIndex = selected ? 0 : -1;
      row.slot.hidden = !selected;
      if (selected && row.panel?.classList.contains('collapsed')) {
        const toggle = row.panel.querySelector(row.toggleSelector);
        toggle?.click();
        // Builds without an attached disclosure controller still expose their controls.
        row.panel.classList.remove('collapsed');
      }
    }
    if (active === 'views' && display?.classList.contains('collapsed')) {
      display.querySelector(displayRecord.toggleSelector)?.click(); display.classList.remove('collapsed');
    }
  }
  function close() { host.hidden = true; launcher.setAttribute('aria-expanded', 'false'); }
  function open(key = active) {
    if (destroyed) return;
    select(key); host.hidden = false; launcher.setAttribute('aria-expanded', 'true');
    records.find(row => row.key === active)?.tab.focus();
  }
  launcher.onclick = () => host.hidden ? open() : close();
  closeButton.onclick = () => { close(); launcher.focus(); };
  host.onkeydown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); launcher.focus(); }
    if (event.target?.getAttribute('role') !== 'tab') return;
    const index = records.findIndex(row => row.key === active);
    const next = event.key === 'ArrowRight' ? (index + 1) % records.length
      : event.key === 'ArrowLeft' ? (index + records.length - 1) % records.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? records.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); select(records[next].key); records[next].tab.focus(); }
  };
  // Set tab semantics without opening or changing any retained controller.
  for (const row of records) { row.tab.setAttribute('aria-selected', String(row.key === active)); row.tab.tabIndex = row.key === active ? 0 : -1; }
  return { open, close, toggle() { host.hidden ? open() : close(); }, root: host,
    destroy() {
      if (destroyed) return; destroyed = true;
      for (const row of [...records, ...(displayRecord ? [displayRecord] : [])]) if (row.panel && row.parent) {
        row.parent.insertBefore(row.panel, row.next?.parentNode === row.parent ? row.next : null);
        if (row.collapsed && !row.panel.classList.contains('collapsed')) {
          row.panel.querySelector(row.toggleSelector)?.click(); row.panel.classList.add('collapsed');
        }
      }
      host.remove(); launcher.remove(); style.remove();
    },
  };
}
