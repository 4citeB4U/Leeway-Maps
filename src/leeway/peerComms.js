import { PeerMediaSession } from './peerCommsCore.js';
import './peerComms.css';
import { mapIcon } from './mapIcons.js';

export function mountPeerComms({
  viewer = null,
  baseUrl = import.meta.env.VITE_LEEWAY_PEER_API || '/api/peers',
  fetchImpl = fetch,
} = {}) {
  const root = document.createElement('section');
  root.className = 'lw-peers';
  root.hidden = true;
  root.dataset.layout = 'full';
  root.innerHTML = `<header><div><h2>Travel radio</h2><p>Private CB voice · video by invitation</p></div><button data-peer="layout" type="button">Split with map</button><button data-peer="close" type="button" aria-label="Close peer channel">×</button></header>
  <p class="lp-status" role="status" data-status>Sign in required. Use your provisioned account to connect with peers.</p>
  <div class="lp-radio"><span class="lp-radio-label">PRIVATE CB</span><strong data-peer-name>No channel selected</strong><div class="lp-radio-meter" aria-hidden="true">${'<i></i>'.repeat(12)}</div><div class="lp-call"><button data-peer="talk" type="button" disabled aria-pressed="false" aria-label="Hold to talk">${mapIcon('mic')}<span>Hold to talk</span></button><button data-peer="hangup" type="button" disabled>End channel</button></div><p>Hold the microphone to transmit. Release to listen.</p><button data-peer="block-active" type="button" disabled>Block this contact</button></div>
  <details data-auth><summary>Sign in to your channel</summary><label>Username<input autocomplete="username" data-username aria-label="Channel username"></label><label>Password<input type="password" autocomplete="current-password" data-password aria-label="Channel password"></label><button data-peer="login" type="button">Sign in</button><button data-peer="disconnect" type="button">Sign out</button><p>Use your operator-provisioned account. Identity and organization are verified by the server; your short-lived session stays in this tab.</p><details><summary>Operator access ticket</summary><label>Signed ticket<input type="password" autocomplete="off" data-ticket aria-label="Operator-issued access ticket"></label><button data-peer="connect" type="button">Connect ticket</button></details></details>
  <div class="lp-directory"><label><input type="checkbox" data-discoverable> Let authorized peers find me</label><p data-directory-policy></p><button data-peer="refresh" type="button">Refresh peers</button><select data-directory aria-label="Available peer"><option value="">Connect to see peers</option></select><input type="hidden" data-media value="audio"><div class="lp-invite-actions"><button data-peer="invite" type="button">Invite to CB voice</button><button data-peer="video" type="button">Video call</button></div><p>Both people must accept. Your selected microphone/camera starts only after acceptance. No recording is provided.</p></div>
  <section class="lp-contacts"><h3>Contacts billboard</h3><p>Choose an available travel contact, then invite them to CB. Only people who choose to be discoverable appear here. This list does not indicate who is physically ahead of you.</p><div data-contact-cards></div><details><summary>Blocked contacts</summary><div data-blocked-cards></div></details></section>
  <div data-invitations></div><p class="lp-infrastructure" data-infrastructure></p>
  <div class="lp-video-grid" hidden><video data-remote playsinline autoplay aria-label="Peer video and audio"></video><video data-local muted playsinline autoplay aria-label="Your camera preview"></video></div><button data-peer="play" type="button" hidden>Play peer audio/video</button>`;
  document.body.append(root);
  const q = (selector) => root.querySelector(selector);
  let token = '',
    identity = null,
    cursor = 0,
    timer = null,
    expiryTimer = null,
    presenceTimer = null,
    epoch = 0,
    consentEpoch = 0,
    sessionId = null,
    sessionMedia = null,
    peerName = '',
    activePeerId = '',
    iceServers = [];
  const consent = new Map();
  const status = (text) => {
    q('[data-status]').textContent = text;
  };
  function armIdentitySession(expiresAt) {
    const ttl = Number(expiresAt) - Date.now();
    if (!Number.isFinite(ttl) || ttl <= 0)
      throw new Error(
        'Server session ticket has expired or has no valid expiry.',
      );
    clearTimeout(expiryTimer);
    clearInterval(presenceTimer);
    expiryTimer = setTimeout(
      () => {
        disconnect();
        status('Your channel session expired. Sign in again.');
      },
      Math.min(ttl, 2147483647),
    );
    presenceTimer = setInterval(() => {
      if (token && q('[data-discoverable]').checked)
        void request('/presence', 'POST', { discoverable: true }).catch(
          (error) => status(`Presence unavailable: ${error.message}`),
        );
    }, 30000);
  }
  async function applyDirectoryPolicy() {
    const discoverable = q('[data-discoverable]');
    const policy = q('[data-directory-policy]');
    if (identity?.directoryPolicy !== 'opt-in') {
      throw new Error('This account does not provide a personal opt-in travel directory.');
    }
    discoverable.disabled = false;
    discoverable.checked = false;
    policy.textContent = 'Travel contact visibility is optional. Enable it only when you want authorized contacts to find you.';

  }
  const media = new PeerMediaSession({
    sendSignal: (payload) => {
      void request('/signal', 'POST', payload).catch((error) => {
        if (sessionId !== payload.sessionId) return;
        endLocal();
        status(`Signaling failed: ${error.message}`);
      });
    },
    onState: (state) => {
      status(`Channel with ${peerName}: ${state}`);
      if (state === 'failed') {
        const ended = sessionId;
        endLocal();
        if (ended)
          void request('/hangup', 'POST', { sessionId: ended }).catch(() => {});
        status(
          'Peer connection failed. Relay/TURN or network configuration may be required.',
        );
      }
    },
    onMessage: () => {}, // Travel radio has no text channel UI.
    onLocalStream: (stream) => {
      q('[data-local]').srcObject = stream;
      q('[data-local]').hidden = !stream.getVideoTracks().length;
    },
    onRemoteStream: (stream) => {
      q('[data-remote]').srcObject = stream;
      q('[data-remote]')
        .play()
        .catch(() => {
          q('[data-peer="play"]').hidden = false;
        });
    },
  });
  function endLocal() {
    activePeerId = '';
    q('[data-peer="block-active"]').disabled = true;
    media.stop();
    sessionId = null;
    sessionMedia = null;
    q('[data-local]').srcObject = null;
    q('[data-remote]').srcObject = null;
    q('[data-peer="talk"]').disabled = true;
    q('[data-peer="talk"]').setAttribute('aria-pressed', 'false');
    q('[data-peer="hangup"]').disabled = true;
    q('[data-peer="play"]').hidden = true;
    q('.lp-video-grid').hidden = true;
    q('[data-peer-name]').textContent = 'No channel selected';
    root.dataset.transmitting = 'false';
  }
  async function request(path, method = 'GET', body) {
    if (!token) throw new Error('Connect your signed user identity first.');
    const requestToken = token;
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${requestToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if ([401, 403].includes(response.status) && token === requestToken) {
        disconnect(false);
        status(
          'Identity authorization expired or was rejected. Sign in again.',
        );
      }
      throw new Error(data.error || `Peer service HTTP ${response.status}`);
    }
    return data;
  }
  async function refresh() {
    const own = epoch;
    const data = await request('/directory');
    const blocked = await request('/blocked');
    if (own !== epoch) return;
    const selected = q('[data-directory]').value;
    q('[data-directory]').replaceChildren(new Option('Choose a peer', ''));
    q('[data-contact-cards]').replaceChildren();
    q('[data-blocked-cards]').replaceChildren();
    for (const peer of data.peers || []) {
      if (peer.id !== identity?.id) {
        q('[data-directory]').append(
          new Option(`${peer.displayName} (${peer.id})`, peer.id),
        );
        const card = document.createElement('article');
        card.className = 'lp-contact';
        const name = document.createElement('strong');
        name.textContent = peer.displayName;
        name.translate = false;
        const info = document.createElement('p');
        info.textContent = `${peer.role} · ${peer.id}${peer.area ? ` · ${peer.area}` : ''}`;
        card.append(name, info);
        for (const [label, action] of [
          [
            'CB microphone',
            () => {
              q('[data-directory]').value = peer.id;
              void invite('audio');
            },
          ],
          [
            'Video call',
            () => {
              q('[data-directory]').value = peer.id;
              void invite('video');
            },
          ],
          ['Block contact', () => void protectContact(peer.id, 'block')],
          [
            'Report harassment and block',
            () => void protectContact(peer.id, 'report'),
          ],
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.onclick = action;
          card.append(button);
        }
        q('[data-contact-cards]').append(card);
      }
    }
    if (!q('[data-contact-cards]').childElementCount)
      q('[data-contact-cards]').textContent =
        'No available contacts. Refresh after another traveler signs in and enables discovery.';
    for (const peer of blocked.peers || []) {
      const row = document.createElement('div'),
        label = document.createElement('span'),
        button = document.createElement('button');
      label.textContent = peer.displayName;
      button.textContent = 'Unblock';
      button.type = 'button';
      button.onclick = () => void protectContact(peer.id, 'unblock');
      row.append(label, button);
      q('[data-blocked-cards]').append(row);
    }
    q('[data-directory]').value = selected;
  }
  async function protectContact(to, action) {
    try {
      // Cut local capture immediately, even if the server is temporarily unreachable.
      if (action !== 'unblock') {
        consent.clear();
        consentEpoch++;
        endLocal();
      }
      const result = await request(`/${action}`, 'POST', { to });
      await refresh();
      status(
        action === 'report'
          ? `Harassment report saved: ${result.reportId}. Contact blocked. This report has not been reviewed; police were not contacted. For immediate danger, use your phone's emergency calling function.`
          : action === 'unblock'
            ? 'Contact unblocked. A new invitation and acceptance are still required.'
            : 'Contact blocked. They cannot invite you or continue this channel.',
      );
    } catch (error) {
      status(`Contact safety change was not confirmed: ${error.message}`);
    }
  }
  function showInvite(event) {
    if (!event.inviteId || !['text', 'audio', 'video'].includes(event.media))
      return;
    if (event.media === 'text') {
      void request('/respond', 'POST', {
        inviteId: event.inviteId,
        accept: false,
      }).catch(() => {});
      status('This travel radio accepts voice or video invitations.');
      return;
    }
    if (
      event.media === 'video' &&
      document.body.classList.contains('leeway-drive-mode')
    ) {
      void request('/respond', 'POST', {
        inviteId: event.inviteId,
        accept: false,
      }).catch(() => {});
      status('Video invitation declined while Drive Mode is active.');
      return;
    }
    const card = document.createElement('div');
    card.className = 'lp-invite';
    card.dataset.invite = event.inviteId;
    const label = document.createElement('p');
    label.textContent = `${event.from?.displayName || event.from?.id || 'Peer'} invites you to a ${event.media} channel.`;
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent =
      event.media === 'text'
        ? 'Accept text'
        : `Accept ${event.media} + microphone`;
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = 'Decline';
    const respond = async (allowed) => {
      accept.disabled = decline.disabled = true;
      try {
        if (allowed) consent.set(event.inviteId, event.media);
        await request('/respond', 'POST', {
          inviteId: event.inviteId,
          accept: allowed,
        });
        card.remove();
      } catch (error) {
        consent.delete(event.inviteId);
        status(error.message);
        accept.disabled = decline.disabled = false;
      }
    };
    accept.onclick = () => void respond(true);
    decline.onclick = () => void respond(false);
    const block = document.createElement('button');
    block.type = 'button';
    block.textContent = 'Block contact';
    block.onclick = () => {
      void protectContact(event.from.id, 'block');
      card.remove();
    };
    card.append(label, accept, decline, block);
    q('[data-invitations]').append(card);
    if (root.hidden) open();
    status(`Invitation from ${event.from?.displayName || 'peer'}`);
  }
  async function eventReceived(event) {
    if (event.type === 'withdrawn') {
      for (const card of q('[data-invitations]').children)
        if (card.dataset.invite === event.inviteId) card.remove();
      consent.delete(event.inviteId);
    }
    if (event.type === 'invite') showInvite(event);
    if (event.type === 'accepted') {
      if (
        event.media === 'video' &&
        document.body.classList.contains('leeway-drive-mode')
      ) {
        consent.delete(event.inviteId);
        await request('/hangup', 'POST', { sessionId: event.sessionId });
        status('Video is unavailable during Drive Mode.');
        return;
      }
      if (consent.get(event.inviteId) !== event.media) {
        await request('/hangup', 'POST', { sessionId: event.sessionId });
        return;
      }
      consent.delete(event.inviteId);
      endLocal();
      sessionId = event.sessionId;
      sessionMedia = event.media;
      activePeerId = event.peer?.id || '';
      q('[data-peer="block-active"]').disabled = !activePeerId;
      peerName = event.peer?.displayName || event.peer?.id || 'Peer';
      q('[data-peer="hangup"]').disabled = false;
      q('[data-peer-name]').textContent = peerName;
      q('.lp-video-grid').hidden = event.media !== 'video';
      status(`Accepted ${event.media} channel. Preparing connection…`);
      try {
        const activeId = sessionId;
        const started = await media.start({
          sessionId,
          media: event.media,
          initiator: event.initiator,
          iceServers,
          accepted: true,
        });
        if (started && sessionId === activeId)
          q('[data-peer="talk"]').disabled = event.media === 'text';
      } catch (error) {
        const failed = sessionId;
        endLocal();
        if (failed)
          void request('/hangup', 'POST', { sessionId: failed }).catch(
            () => {},
          );
        status(`Channel could not start: ${error.message}`);
      }
    }
    if (event.type === 'signal') await media.signal(event);
    if (event.type === 'declined') {
      consent.delete(event.inviteId);
      status('The invitation was declined.');
    }
    if (event.type === 'ended' && event.sessionId === sessionId) {
      endLocal();
      status('Peer ended the channel. Microphone and camera released.');
    }
  }
  async function poll(own) {
    if (own !== epoch || !token) return;
    try {
      const data = await request(`/inbox?after=${cursor}`);
      if (own !== epoch) return;
      for (const event of data.events || []) {
        await eventReceived(event);
        if (own !== epoch) return;
      }
      cursor = data.cursor ?? cursor;
    } catch (error) {
      if (own === epoch) status(`Peer service: ${error.message}`);
    } finally {
      if (own === epoch && token)
        timer = setTimeout(() => void poll(own), 2000);
    }
  }
  function disconnect(notify = true) {
    const priorToken = token,
      priorSession = sessionId;
    epoch++;
    clearTimeout(timer);
    clearTimeout(expiryTimer);
    clearInterval(presenceTimer);
    expiryTimer = presenceTimer = null;
    timer = null;
    token = '';
    identity = null;
    consent.clear();
    consentEpoch++;
    endLocal();
    q('[data-ticket]').value = '';
    q('[data-discoverable]').checked = false;
    q('[data-discoverable]').disabled = false;
    q('[data-directory-policy]').textContent = '';
    q('[data-invitations]').replaceChildren();
    q('[data-contact-cards]').replaceChildren();
    q('[data-blocked-cards]').replaceChildren();
    q('[data-directory]').replaceChildren(
      new Option('Connect to see peers', ''),
    );
    if (notify && priorToken) {
      const headers = {
        Authorization: `Bearer ${priorToken}`,
        'Content-Type': 'application/json',
      };
      void fetchImpl(`${baseUrl}/presence`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ discoverable: false }),
        keepalive: true,
      }).catch(() => {});
      if (priorSession)
        void fetchImpl(`${baseUrl}/hangup`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ sessionId: priorSession }),
          keepalive: true,
        }).catch(() => {});
    }
  }
  q('[data-peer="connect"]').onclick = async () => {
    const value = q('[data-ticket]').value.trim();
    if (!value) {
      status('Enter an operator-issued access ticket.');
      return;
    }
    disconnect();
    token = value;
    cursor = 0;
    const own = epoch;
    try {
      const me = await request('/me');
      if (own !== epoch) return;
      identity = me.user;
      armIdentitySession(me.expiresAt);
      iceServers = Array.isArray(me.iceServers) ? me.iceServers : [];
      if (!identity?.id)
        throw new Error('Server did not return an authenticated identity.');
      await applyDirectoryPolicy();
      status(`Signed in as ${identity.displayName} (${identity.id})`);
      q('[data-auth]').open = false;
      q('[data-infrastructure]').textContent = me.turnConfigured
        ? 'TURN relay configured; network reachability still requires a successful peer connection.'
        : 'No TURN relay configured. Some mobile, corporate and carrier networks will not connect.';
      await refresh();
      void poll(own);
    } catch (error) {
      disconnect(false);
      status(`Connection unavailable: ${error.message}`);
    }
  };
  q('[data-peer="login"]').onclick = async () => {
    const username = q('[data-username]').value.trim(),
      password = q('[data-password]').value;
    if (!username || !password) {
      status('Enter your provisioned username and password.');
      return;
    }
    disconnect();
    const own = epoch;
    status('Verifying channel identity…');
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => ({}));
      q('[data-password]').value = '';
      if (own !== epoch) return;
      if (!response.ok || !result.ticket)
        throw new Error(
          result.error || `Sign-in unavailable (HTTP ${response.status})`,
        );
      token = result.ticket;
      cursor = 0;
      const me = await request('/me');
      if (own !== epoch) return;
      identity = me.user;
      armIdentitySession(me.expiresAt);
      iceServers = Array.isArray(me.iceServers) ? me.iceServers : [];
      if (!identity?.id)
        throw new Error('Server did not return an authenticated identity.');
      await applyDirectoryPolicy();
      status(`Signed in as ${identity.displayName} (${identity.id})`);
      q('[data-auth]').open = false;
      q('[data-infrastructure]').textContent = me.turnConfigured
        ? 'TURN relay configured; network reachability still requires a successful peer connection.'
        : 'No TURN relay configured. Some mobile, corporate and carrier networks will not connect.';
      await refresh();
      void poll(own);
    } catch (error) {
      if (own === epoch) {
        disconnect(false);
        status(`Sign-in unavailable: ${error.message}`);
      }
    } finally {
      q('[data-password]').value = '';
    }
  };
  q('[data-discoverable]').onchange = async (event) => {
    try {
      await request('/presence', 'POST', {
        discoverable: event.target.checked,
      });
      await refresh();
    } catch (error) {
      event.target.checked = false;
      status(error.message);
    }
  };
  q('[data-peer="refresh"]').onclick = () =>
    void refresh().catch((error) => status(error.message));
  async function invite(type) {
    const ownConsent = consentEpoch;
    try {
      if (sessionId)
        throw new Error(
          'End the current channel before inviting another peer.',
        );
      const to = q('[data-directory]').value;
      if (!to) throw new Error('Choose a peer first.');
      if (
        type === 'video' &&
        document.body.classList.contains('leeway-drive-mode')
      )
        throw new Error('Exit Drive Mode before starting a video channel.');
      const result = await request('/invite', 'POST', { to, media: type });
      if (ownConsent !== consentEpoch) return;
      consent.set(result.inviteId, type);
      status(
        'Invitation sent. Waiting for peer acceptance; microphone and camera remain off.',
      );
    } catch (error) {
      status(error.message);
    }
  }
  q('[data-peer="block-active"]').onclick = () => {
    if (activePeerId) void protectContact(activePeerId, 'block');
  };
  q('[data-peer="invite"]').onclick = () => void invite('audio');
  q('[data-peer="video"]').onclick = () => void invite('video');
  q('[data-peer="hangup"]').onclick = () => {
    const ended = sessionId;
    endLocal();
    if (ended)
      void request('/hangup', 'POST', { sessionId: ended }).catch((error) =>
        status(error.message),
      );
    status('Channel ended. Microphone and camera released.');
  };
  q('[data-peer="disconnect"]').onclick = () => {
    disconnect();
    status('Disconnected; access ticket cleared.');
  };
  const talk = q('[data-peer="talk"]');
  const talking = (enabled) => {
    media.setTalking(enabled);
    talk.setAttribute('aria-pressed', String(enabled));
    root.dataset.transmitting = String(enabled);
  };
  talk.onpointerdown = (event) => {
    if (talk.disabled) return;
    talk.setPointerCapture(event.pointerId);
    talking(true);
  };
  talk.onpointerup =
    talk.onpointercancel =
    talk.onlostpointercapture =
      () => talking(false);
  talk.onkeydown = (event) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!talk.disabled) talking(true);
    }
  };
  talk.onkeyup = (event) => {
    if ([' ', 'Enter'].includes(event.key)) talking(false);
  };
  talk.onblur = () => talking(false);
  const mute = () => talking(false);
  window.addEventListener('blur', mute);
  document.addEventListener('visibilitychange', mute);
  q('[data-peer="play"]').onclick = () => {
    void q('[data-remote]')
      .play()
      .then(() => {
        q('[data-peer="play"]').hidden = true;
      })
      .catch((error) => status(error.message));
  };
  q('[data-peer="layout"]').onclick = () => {
    root.dataset.layout = root.dataset.layout === 'split' ? 'full' : 'split';
    q('[data-peer="layout"]').textContent =
      root.dataset.layout === 'split' ? 'Full screen' : 'Split with map';
    syncLayout();
  };
  function syncLayout() {
    const split =
      !root.hidden &&
      root.dataset.layout === 'split' &&
      !document.body.classList.contains('leeway-drive-mode');
    document.body.classList.toggle('leeway-peer-split', split);
    requestAnimationFrame(() => {
      viewer?.resize?.();
      viewer?.scene?.requestRender?.();
      window.dispatchEvent(new Event('resize'));
    });
  }
  function open() {
    root.hidden = false;
    syncLayout();
  }
  function close() {
    const ended = sessionId;
    consent.clear();
    consentEpoch++;
    q('[data-invitations]').replaceChildren();
    endLocal();
    if (ended)
      void request('/hangup', 'POST', { sessionId: ended }).catch(() => {});
    root.hidden = true;
    syncLayout();
  }
  q('[data-peer="close"]').onclick = close;
  const pageExit = () => disconnect();
  window.addEventListener('pagehide', pageExit);
  let wasDriving = document.body.classList.contains('leeway-drive-mode');
  const drivingObserver = new MutationObserver(() => {
    const driving = document.body.classList.contains('leeway-drive-mode');
    if (driving === wasDriving) return;
    wasDriving = driving;
    if (driving && sessionMedia === 'video') {
      const ended = sessionId;
      endLocal();
      if (ended)
        void request('/hangup', 'POST', { sessionId: ended }).catch(() => {});
      status('Video ended because Drive Mode started.');
    }
    syncLayout();
  });
  drivingObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return {
    root,
    open,
    close,
    toggle() {
      root.hidden ? open() : close();
    },
    destroy() {
      disconnect();
      drivingObserver.disconnect();
      root.hidden = true;
      syncLayout();
      window.removeEventListener('pagehide', pageExit);
      window.removeEventListener('blur', mute);
      document.removeEventListener('visibilitychange', mute);
      root.remove();
    },
  };
}
