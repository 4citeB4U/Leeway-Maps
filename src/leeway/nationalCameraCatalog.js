import { cameraSourceAccess } from './cameraCoverageStatus.js';
function ensureStyles(documentRef) {
  if (documentRef.getElementById('leeway-national-camera-catalog-styles'))
    return;
  const style = documentRef.createElement('style');
  style.id = 'leeway-national-camera-catalog-styles';
  style.textContent = `
    .lnc-root { pointer-events:auto; position:absolute; top:76px; right:12px; z-index:9796;
      width:min(560px,calc(100vw - 106px)); max-height:calc(100vh - 94px); overflow:hidden;
      border:1px solid rgba(71,225,242,.28); border-radius:15px; background:rgba(3,15,24,.97);
      color:#eaffff; box-shadow:0 18px 55px rgba(0,0,0,.42); backdrop-filter:blur(16px); display:none; }
    .lnc-root.open { display:flex; flex-direction:column; }
    .lnc-head { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:10px; padding:16px; border-bottom:1px solid rgba(255,255,255,.08); }
    .lnc-head strong { letter-spacing:.10em; font-size:12px; }
    .lnc-head span { margin-left:auto; font-size:9px; opacity:.65; }
    .lnc-close { width:48px; height:48px; border:1px solid rgba(117,239,251,.35); border-radius:18px; background:linear-gradient(150deg,#294a58,#0b202b); color:#fff; font:700 25px/1 system-ui,sans-serif; cursor:pointer; box-shadow:inset 0 1px 0 #fff3,0 4px 0 #020a0f; }
    .lnc-toolbar { display:grid; grid-template-columns:1fr auto; gap:8px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.07); }
    .lnc-toolbar input { min-width:0; height:36px; border-radius:8px; border:1px solid rgba(71,225,242,.20);
      background:#071722; color:#efffff; padding:0 10px; font:inherit; outline:none; }
    .lnc-toolbar button { border:1px solid rgba(71,225,242,.24); background:rgba(71,225,242,.06); color:#eaffff;
      border-radius:8px; padding:0 10px; cursor:pointer; font:inherit; }
    .lnc-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:10px 12px; }
    .lnc-metric { padding:8px; border:1px solid rgba(255,255,255,.07); border-radius:8px; background:rgba(255,255,255,.025); }
    .lnc-metric b { display:block; font-size:15px; color:#75effb; } .lnc-metric span { font-size:8px; opacity:.6; }
    .lnc-list { overflow:auto; padding:0 10px 12px; display:grid; gap:7px; }
    .lnc-row { border:1px solid rgba(255,255,255,.08); border-radius:9px; padding:9px 10px; background:rgba(255,255,255,.025); }
    .lnc-row-head { display:flex; align-items:center; gap:8px; }
    .lnc-code { min-width:29px; color:#72edfa; font-weight:800; }
    .lnc-name { font-weight:700; }
    .lnc-state { margin-left:auto; font-size:8px; padding:3px 6px; border-radius:999px; border:1px solid rgba(255,255,255,.12); }
    .lnc-state.integrated { color:#76f0af; border-color:rgba(118,240,175,.35); }
    .lnc-state.seeded { color:#ffd877; border-color:rgba(255,216,119,.35); }
    .lnc-state.research-required { color:#a9b9c1; }
    .lnc-source { margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,.06); font-size:9px; line-height:1.45; }
    .lnc-source strong { color:#dffcff; } .lnc-source small { display:block; opacity:.62; margin-top:2px; }
    .lnc-source a { color:#75effb; text-decoration:underline; display:inline-block; margin-top:5px; }
    .lnc-row-actions { display:flex; justify-content:flex-end; margin-top:8px; }
    .lnc-action { border:1px solid rgba(71,225,242,.30); border-radius:8px; padding:7px 9px;
      background:rgba(71,225,242,.08); color:#dffcff; font:700 9px/1 system-ui,sans-serif; letter-spacing:.06em; cursor:pointer; }
    .lnc-action:hover { background:rgba(71,225,242,.16); }
    .lnc-action:disabled { opacity:.45; cursor:wait; }
    .lnc-empty { padding:20px; text-align:center; opacity:.6; }
  `;
  documentRef.head.appendChild(style);
}

export function nationalCameraJurisdictionAction(row = {}) {
  const sources = Array.isArray(row.sources) ? row.sources : [];
  const canViewCameras = sources.some(
    (source) => source?.integrationStatus === 'integrated',
  );
  if (canViewCameras)
    return {
      label: 'VIEW CAMERAS',
      canViewCameras: true,
      requiredCredential: null,
    };

  const credentialSource = sources.find(
    (source) =>
      source?.integrationStatus === 'key-required' &&
      String(source?.requiredCredential || '').trim(),
  );
  if (credentialSource)
    return {
      label: 'API KEY REQUIRED',
      canViewCameras: false,
      requiredCredential: String(credentialSource.requiredCredential).trim(),
    };

  if (sources.length)
    return {
      label: 'LOCATE SOURCE',
      canViewCameras: false,
      requiredCredential: null,
    };
  return {
    label: 'LOCATE',
    canViewCameras: false,
    requiredCredential: null,
  };
}

export function mountNationalCameraCatalog({
  host = document.body,
  notify = () => {},
  onJurisdictionSelect = null,
} = {}) {
  ensureStyles(document);
  const root = document.createElement('section');
  root.className = 'lnc-root';
  root.setAttribute('aria-label', 'National public traffic camera catalog');
  root.innerHTML = `
    <div class="lnc-head">
      <strong>U.S. PUBLIC TRAFFIC CAMERA CATALOG</strong>
      <span data-status>NOT LOADED</span>
      <button class="lnc-close" type="button" data-close aria-label="Close national camera catalog">×</button>
    </div>
    <div class="lnc-toolbar">
      <input data-search aria-label="Filter jurisdictions" placeholder="Filter state, territory, operator, system..." />
      <button type="button" data-refresh>REFRESH</button>
    </div>
    <p class="lnc-source" style="padding:0 12px">Networks have different coverage and access rules. An empty map does not establish that a town has no cameras. Connected does not mean every camera is online.</p>
    <div class="lnc-summary" data-summary></div>
    <div class="lnc-list" data-list><div class="lnc-empty">Loading national catalog…</div></div>
  `;
  host.appendChild(root);

  const search = root.querySelector('[data-search]');
  const list = root.querySelector('[data-list]');
  const summaryNode = root.querySelector('[data-summary]');
  const status = root.querySelector('[data-status]');
  let payload = null;
  let loading = false;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render() {
    const summary = payload?.summary || {};
    summaryNode.innerHTML = [
      ['56', 'JURISDICTIONS'],
      [summary.seededJurisdictionCount ?? 0, 'SEEDED'],
      [summary.integratedSourceCount ?? 0, 'INTEGRATED SOURCES'],
      [summary.researchRequiredJurisdictionCount ?? 0, 'RESEARCH QUEUE'],
    ]
      .map(
        ([value, label]) =>
          `<div class="lnc-metric"><b>${escapeHtml(value)}</b><span>${label}</span></div>`,
      )
      .join('');

    const q = search.value.trim().toLowerCase();
    const rows = (payload?.jurisdictions || []).filter((row) => {
      if (!q) return true;
      const haystack = [
        row.code,
        row.name,
        row.type,
        ...(row.sources || []).flatMap((source) => [
          source.operator,
          source.system,
          source.integrationStatus,
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    if (!rows.length) {
      list.innerHTML = '<div class="lnc-empty">No matching jurisdiction.</div>';
      return;
    }

    list.innerHTML = rows
      .map((row) => {
        const state = row.integrated ? 'integrated' : row.researchStatus;
        const sources = (row.sources || [])
          .map((source) => {
            const access = cameraSourceAccess(source);
            return `
        <div class="lnc-source">
          <strong>${escapeHtml(source.system || source.operator)}</strong>
          · ${escapeHtml(source.integrationStatus || 'unknown')}
          <small>${escapeHtml(access.message)}</small>
          ${access.links.map(link => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join(' &middot; ')}
          <small>${escapeHtml(source.operator || '')}${source.notes ? ' · ' + escapeHtml(source.notes) : ''}</small>
        </div>
      `;
          })
          .join('');
        const action = nationalCameraJurisdictionAction(row);
        const actionControl =
          typeof onJurisdictionSelect === 'function'
            ? `<div class="lnc-row-actions"><button type="button" class="lnc-action" data-jurisdiction="${escapeHtml(row.code)}">${escapeHtml(action.label)}</button></div>`
            : '';
        return `
        <article class="lnc-row">
          <div class="lnc-row-head">
            <span class="lnc-code">${escapeHtml(row.code)}</span>
            <span class="lnc-name">${escapeHtml(row.name)}</span>
            <span class="lnc-state ${escapeHtml(state)}">${escapeHtml(state.toUpperCase())}</span>
          </div>
          ${sources || '<div class="lnc-source"><small>Official source research not yet completed. No feed is implied.</small></div>'}
          ${actionControl}
        </article>
      `;
      })
      .join('');
  }

  async function refresh() {
    if (loading) return false;
    loading = true;
    status.textContent = 'CHECKING';
    try {
      const response = await fetch('/api/cctv/jurisdictions', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok)
        throw new Error(`National catalog HTTP ${response.status}`);
      payload = await response.json();
      status.textContent = `${payload?.summary?.jurisdictionCount || 0} JURISDICTIONS`;
      render();
      return true;
    } catch (error) {
      status.textContent = 'UNAVAILABLE';
      list.innerHTML =
        '<div class="lnc-empty">National catalog provider is unavailable.</div>';
      notify(error?.message || 'National catalog unavailable');
      return false;
    } finally {
      loading = false;
    }
  }

  search.addEventListener('input', render);
  list.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-jurisdiction]');
    if (!button || typeof onJurisdictionSelect !== 'function') return;
    const code = String(button.dataset.jurisdiction || '').trim();
    const row = (payload?.jurisdictions || []).find(
      (candidate) => candidate.code === code,
    );
    if (!row) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = 'LOCATING';
    try {
      await onJurisdictionSelect(row, nationalCameraJurisdictionAction(row));
    } catch (error) {
      notify(error?.message || `Could not open ${row.name}`);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      status.textContent = `${payload?.summary?.jurisdictionCount || 0} JURISDICTIONS`;
    }
  });
  root
    .querySelector('[data-refresh]')
    .addEventListener('click', () => void refresh());
  root.querySelector('[data-close]').addEventListener('click', () => {
    root.classList.remove('open');
    root.dispatchEvent(
      new CustomEvent('leeway:right-panel-close', { bubbles: true }),
    );
  });

  return {
    root,
    open() {
      root.classList.add('open');
      if (!payload) void refresh();
    },
    close() {
      root.classList.remove('open');
    },
    toggle() {
      if (root.classList.contains('open')) this.close();
      else this.open();
    },
    refresh,
    destroy() {
      root.remove();
    },
  };
}
