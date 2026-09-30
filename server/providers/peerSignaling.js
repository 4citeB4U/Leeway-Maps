import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  scrypt as rawScrypt,
} from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { readRequestBody } from './common/request.js';

const scrypt = promisify(rawScrypt);
const fail = (status, message) => Object.assign(new Error(message), { status });
const roles = ['driver', 'dispatcher', 'manager'];
const text = (value, max = 80) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  !/[\x00-\x1f]/.test(value);
const identity = (user) => ({
  id: user.sub,
  displayName: user.displayName,
  role: user.role,
  directoryPolicy: user.directoryPolicy === 'opt-in' ? 'opt-in' : 'company',
});
const key = (user) => `${user.org}\0${user.sub}`;
export async function hashPeerPassword(password, salt) {
  return (
    await scrypt(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    })
  ).toString('hex');
}
export function createPeerTicket(
  user,
  secret,
  { now = Date.now(), ttlSeconds = 900 } = {},
) {
  const payload = {
    v: 1,
    aud: 'leeway-peers',
    sub: user.subject,
    org: user.org,
    role: user.role,
    displayName: user.displayName,
    directoryPolicy: user.directoryPolicy === 'opt-in' ? 'opt-in' : 'company',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + Math.min(3600, ttlSeconds),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyPeerTicket(ticket, secret, now = Date.now()) {
  try {
    if (
      typeof ticket !== 'string' ||
      ticket.length > 2048 ||
      secret.length < 32
    )
      throw 0;
    const parts = ticket.split('.');
    if (parts.length !== 2) throw 0;
    const expected = createHmac('sha256', secret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], 'base64url');
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw 0;
    const user = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const seconds = Math.floor(now / 1000);
    if (
      user.v !== 1 ||
      user.aud !== 'leeway-peers' ||
      !text(user.sub) ||
      !text(user.org) ||
      !text(user.displayName) ||
      !roles.includes(user.role) ||
      !['company', 'opt-in'].includes(user.directoryPolicy) ||
      !Number.isInteger(user.iat) ||
      !Number.isInteger(user.exp) ||
      user.iat > seconds + 5 ||
      user.exp <= seconds ||
      user.exp <= user.iat ||
      user.exp - user.iat > 3600
    )
      throw 0;
    return user;
  } catch {
    throw fail(401, 'Sign in again.');
  }
}

/** Ephemeral signaling only. Media and chat travel through the accepted WebRTC connection. */
export function createPeerSignalingStore({ now = Date.now } = {}) {
  const peers = new Map(),
    invites = new Map(),
    sessions = new Map(),
    inboxes = new Map();
  const blocks = new Map(),
    reports = new Map();
  const blocked = (a, b) =>
    blocks.has(`${key(a)}\0${b.sub}`) || blocks.has(`${key(b)}\0${a.sub}`);
  let sequence = 0;
  function prune() {
    for (const map of [peers, invites, sessions])
      for (const [id, row] of map) if (row.expiresAt <= now()) map.delete(id);
    for (const [id, rows] of inboxes) {
      const live = rows.filter((row) => row.time + 120000 > now());
      if (live.length) inboxes.set(id, live);
      else inboxes.delete(id);
    }
  }
  function emit(user, event) {
    const id = key(user),
      rows = inboxes.get(id) || [];
    rows.push({ ...event, seq: ++sequence, time: now() });
    inboxes.set(id, rows.slice(-64));
    // Bound the full snapshot, not just each recipient queue. Old signaling is
    // disposable; clients time out/reinvite rather than treating it as history.
    while (
      inboxes.size > 200 ||
      Buffer.byteLength(JSON.stringify([...inboxes])) > 524288
    ) {
      let oldestKey,
        oldestSeq = Infinity;
      for (const [recipient, events] of inboxes)
        if (events[0]?.seq < oldestSeq) {
          oldestKey = recipient;
          oldestSeq = events[0].seq;
        }
      if (oldestKey === undefined) break;
      const events = inboxes.get(oldestKey);
      events.shift();
      if (!events.length) inboxes.delete(oldestKey);
    }
  }
  function sessionFor(user, id) {
    const session = sessions.get(id);
    if (!session || ![key(session.a), key(session.b)].includes(key(user)))
      throw fail(404, 'Session unavailable.');
    return session;
  }
  return {
    exportState() {
      prune();
      return {
        version: 1,
        sequence,
        peers: [...peers],
        invites: [...invites],
        sessions: [...sessions],
        inboxes: [...inboxes],
        blocks: [...blocks],
        reports: [...reports],
      };
    },
    importState(state) {
      if (
        !state ||
        state.version !== 1 ||
        !Number.isSafeInteger(state.sequence) ||
        state.sequence < 0
      )
        throw fail(503, 'Invalid shared signaling state.');
      for (const name of ['peers', 'invites', 'sessions', 'inboxes']) {
        if (
          !Array.isArray(state[name]) ||
          state[name].length > 200 ||
          state[name].some(
            (row) =>
              !Array.isArray(row) ||
              row.length !== 2 ||
              typeof row[0] !== 'string',
          )
        )
          throw fail(503, 'Invalid shared signaling state.');
      }
      if (
        state.inboxes.some(
          ([, rows]) => !Array.isArray(rows) || rows.length > 64,
        )
      )
        throw fail(503, 'Invalid shared signaling inbox.');
      for (const [name, map] of [
        ['blocks', blocks],
        ['reports', reports],
      ]) {
        const rows = state[name] || [];
        if (
          !Array.isArray(rows) ||
          rows.length > 200 ||
          rows.some(
            (row) =>
              !Array.isArray(row) ||
              row.length !== 2 ||
              typeof row[0] !== 'string' ||
              !row[1],
          )
        )
          throw fail(503, 'Invalid contact safety state.');
        map.clear();
        for (const [id, row] of rows) map.set(id, row);
      }
      sequence = state.sequence;
      for (const [name, map] of [
        ['peers', peers],
        ['invites', invites],
        ['sessions', sessions],
        ['inboxes', inboxes],
      ]) {
        map.clear();
        for (const [id, row] of state[name]) map.set(id, row);
      }
      prune();
    },
    act(user, action, input = {}) {
      prune();
      if (action === 'blocked')
        return {
          peers: [...blocks.values()]
            .filter((row) => row.owner === key(user))
            .map((row) => ({ id: row.target, displayName: row.displayName })),
        };
      if (action === 'block' || action === 'unblock' || action === 'report') {
        if (!text(input.to) || input.to === user.sub)
          throw fail(400, 'Choose another contact.');
        const blockKey = `${key(user)}\0${input.to}`;
        if (action === 'unblock') {
          blocks.delete(blockKey);
          return { blocked: false };
        }
        if (!blocks.has(blockKey) && blocks.size >= 200)
          throw fail(503, 'Contact safety storage at capacity.');
        if (action === 'report' && reports.size >= 200)
          throw fail(503, 'Report storage at capacity.');
        const target = peers.get(`${user.org}\0${input.to}`)?.user;
        blocks.set(blockKey, {
          owner: key(user),
          target: input.to,
          displayName: target?.displayName || input.to,
        });
        for (const [id, row] of invites)
          if (
            row.a.org === user.org &&
            [row.a.sub, row.b.sub].includes(user.sub) &&
            [row.a.sub, row.b.sub].includes(input.to)
          ) {
            invites.delete(id);
            emit(row.a, { type: 'declined', inviteId: id });
            emit(row.b, { type: 'withdrawn', inviteId: id });
          }
        for (const [id, row] of sessions)
          if (
            row.a.org === user.org &&
            [row.a.sub, row.b.sub].includes(user.sub) &&
            [row.a.sub, row.b.sub].includes(input.to)
          ) {
            sessions.delete(id);
            emit(row.a, { type: 'ended', sessionId: id });
            emit(row.b, { type: 'ended', sessionId: id });
          }
        // Remove queued invitations/signals from this pair, keeping the termination events.
        for (const who of [key(user), `${user.org}\0${input.to}`]) {
          const rows = inboxes.get(who) || [];
          inboxes.set(
            who,
            rows.filter(
              (row) =>
                !(
                  ['invite', 'accepted'].includes(row.type) &&
                  (row.from?.id === input.to ||
                    row.from?.id === user.sub ||
                    row.peer?.id === input.to ||
                    row.peer?.id === user.sub)
                ) && !(row.type === 'signal' && !sessions.has(row.sessionId)),
            ),
          );
        }
        if (action === 'report') {
          const reportId = randomUUID();
          reports.set(reportId, {
            reporter: key(user),
            target: input.to,
            category: 'harassment',
            time: now(),
          });
          return {
            blocked: true,
            reportId,
            policeContacted: false,
            reviewStatus: 'stored-not-reviewed',
          };
        }
        return { blocked: true };
      }
      if (action === 'presence') {
        if (
          typeof input.discoverable !== 'boolean' ||
          (input.area !== undefined && !text(input.area))
        )
          throw fail(400, 'Invalid presence.');
        if (!input.discoverable) peers.delete(key(user));
        else {
          if (!peers.has(key(user)) && peers.size >= 200)
            throw fail(503, 'Directory at capacity.');
          peers.set(key(user), {
            user,
            area: input.area || '',
            expiresAt: Math.min(now() + 90000, user.exp * 1000),
          });
        }
        return { discoverable: input.discoverable };
      }
      if (action === 'directory')
        return {
          peers: [...peers.values()]
            .filter(
              (row) =>
                row.user.org === user.org &&
                row.user.sub !== user.sub &&
                !blocked(user, row.user),
            )
            .map((row) => ({ ...identity(row.user), area: row.area })),
        };
      if (action === 'inbox') {
        const after = Number(input.after || 0);
        if (!Number.isSafeInteger(after) || after < 0)
          throw fail(400, 'Invalid cursor.');
        const rows = inboxes.get(key(user)) || [];
        return {
          events: rows.filter((row) => row.seq > after),
          cursor: sequence,
        };
      }
      if (action === 'invite') {
        if (
          !['text', 'audio', 'video'].includes(input.media) ||
          !text(input.to) ||
          input.to === user.sub
        )
          throw fail(400, 'Invalid invitation.');
        const target = peers.get(`${user.org}\0${input.to}`);
        if (!target || blocked(user, target.user))
          throw fail(404, 'Contact unavailable or not discoverable.');
        if (invites.size >= 200 || sessions.size >= 200)
          throw fail(503, 'Service at capacity.');
        if (
          [...invites.values()].some(
            (row) =>
              key(row.a) === key(user) && key(row.b) === key(target.user),
          )
        )
          throw fail(409, 'Invitation already pending.');
        const inviteId = randomUUID(),
          expiresAt = Math.min(
            now() + 60000,
            user.exp * 1000,
            target.user.exp * 1000,
          );
        invites.set(inviteId, {
          a: user,
          b: target.user,
          media: input.media,
          expiresAt,
        });
        emit(target.user, {
          type: 'invite',
          inviteId,
          from: identity(user),
          media: input.media,
          expiresAt,
        });
        return { inviteId, expiresAt };
      }
      if (action === 'respond') {
        const invite = invites.get(input.inviteId);
        if (!invite || key(invite.b) !== key(user))
          throw fail(404, 'Invitation unavailable.');
        if (typeof input.accept !== 'boolean')
          throw fail(400, 'Acceptance required.');
        invites.delete(input.inviteId);
        if (!input.accept) {
          emit(invite.a, { type: 'declined', inviteId: input.inviteId });
          return { accepted: false };
        }
        const sessionId = randomUUID();
        sessions.set(sessionId, {
          ...invite,
          expiresAt: Math.min(
            now() + 900000,
            invite.a.exp * 1000,
            invite.b.exp * 1000,
          ),
          offered: false,
          answered: false,
        });
        for (const [self, peer, initiator] of [
          [invite.a, invite.b, true],
          [invite.b, invite.a, false],
        ])
          emit(self, {
            type: 'accepted',
            sessionId,
            inviteId: input.inviteId,
            peer: identity(peer),
            initiator,
            media: invite.media,
          });
        return { accepted: true, sessionId };
      }
      if (action === 'hangup') {
        const session = sessionFor(user, input.sessionId);
        sessions.delete(input.sessionId);
        emit(session.a, { type: 'ended', sessionId: input.sessionId });
        emit(session.b, { type: 'ended', sessionId: input.sessionId });
        return { ended: true };
      }
      if (action === 'signal') {
        const session = sessionFor(user, input.sessionId),
          initiator = key(session.a) === key(user);
        const event = { type: 'signal', sessionId: input.sessionId };
        if (input.description !== undefined && input.candidate === undefined) {
          const description = input.description;
          if (
            !description ||
            !['offer', 'answer'].includes(description.type) ||
            typeof description.sdp !== 'string' ||
            description.sdp.length > 24000 ||
            (description.type === 'offer' && (!initiator || session.offered)) ||
            (description.type === 'answer' &&
              (initiator || !session.offered || session.answered))
          )
            throw fail(400, 'Invalid session description.');
          if (
            (session.media === 'text' &&
              /^m=(audio|video) /m.test(description.sdp)) ||
            (session.media === 'audio' && /^m=video /m.test(description.sdp))
          )
            throw fail(403, 'Media exceeds accepted invitation.');
          event.description = { type: description.type, sdp: description.sdp };
          if (description.type === 'offer') session.offered = true;
          else session.answered = true;
        } else if (
          input.description === undefined &&
          Object.hasOwn(input, 'candidate')
        ) {
          const c = input.candidate;
          if (
            c !== null &&
            (typeof c !== 'object' ||
              typeof c.candidate !== 'string' ||
              c.candidate.length > 1500 ||
              (c.sdpMid != null && !text(c.sdpMid, 64)) ||
              (c.sdpMLineIndex != null &&
                (!Number.isInteger(c.sdpMLineIndex) ||
                  c.sdpMLineIndex < 0 ||
                  c.sdpMLineIndex > 20)) ||
              (c.usernameFragment != null && !text(c.usernameFragment, 256)))
          )
            throw fail(400, 'Invalid ICE candidate.');
          event.candidate =
            c === null
              ? null
              : {
                  candidate: c.candidate,
                  sdpMid: c.sdpMid ?? null,
                  sdpMLineIndex: c.sdpMLineIndex ?? null,
                  usernameFragment: c.usernameFragment ?? null,
                };
        } else throw fail(400, 'One signal required.');
        emit(initiator ? session.b : session.a, event);
        return { sent: true };
      }
      throw fail(404, 'Unknown peer action.');
    },
  };
}

export function createPeerSignalingHandler({
  env = process.env,
  store,
  now = Date.now,
} = {}) {
  const secret = env.LEEWAY_PEER_SIGNING_SECRET || '';
  const enabled =
    env.LEEWAY_PEER_SIGNALING_ENABLED === '1' &&
    secret.length >= 32 &&
    (!env.VERCEL || !!store);
  store ||= createPeerSignalingStore({ now });
  const allow = makeRateLimiter({ windowMs: 60000, max: 240, globalMax: 3000 });
  const loginAllow = makeRateLimiter({
    windowMs: 60000,
    max: 5,
    globalMax: 30,
  });
  const inviteAllow = makeRateLimiter({
    windowMs: 60000,
    max: 6,
    globalMax: 100,
  });
  let pendingPasswords = 0;
  return async function peerSignaling(req, res) {
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const action = url.pathname
        .replace(/^\/api\/peers/, '')
        .replace(/^\//, '');
      if (!allow(clientKey(req))) throw fail(429, 'Too many requests.');
      if (req.method === 'GET' && action === 'status')
        return send(200, {
          available: enabled,
          loginAvailable:
            enabled &&
            !!(env.LEEWAY_PEER_USERS_FILE || env.LEEWAY_PEER_USERS_JSON),
        });
      if (!enabled)
        throw fail(503, 'Private communication server is not configured.');
      let input = {};
      if (req.method === 'POST') {
        if (
          !String(req.headers['content-type'] || '').startsWith(
            'application/json',
          )
        )
          throw fail(415, 'JSON required.');
        let timer;
        try {
          input = JSON.parse(
            await Promise.race([
              readRequestBody(req, 32768),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(fail(408, 'Request expired.')),
                  10000,
                );
              }),
            ]),
          );
        } finally {
          clearTimeout(timer);
        }
        if (!input || Array.isArray(input) || typeof input !== 'object')
          throw fail(400, 'Invalid request.');
      }
      if (action === 'login' && req.method === 'POST') {
        if (!loginAllow(clientKey(req)))
          throw fail(429, 'Too many sign-in attempts. Try later.');
        if (!env.LEEWAY_PEER_USERS_FILE && !env.LEEWAY_PEER_USERS_JSON)
          throw fail(503, 'Account login is not configured.');
        if (
          !text(input.username) ||
          typeof input.password !== 'string' ||
          input.password.length < 1 ||
          input.password.length > 256
        )
          throw fail(401, 'Invalid username or password.');
        if (pendingPasswords >= 2) throw fail(429, 'Sign-in service busy.');
        pendingPasswords++;
        try {
          if (
            env.LEEWAY_PEER_USERS_FILE &&
            (await stat(env.LEEWAY_PEER_USERS_FILE)).size > 131072
          )
            throw fail(503, 'Account configuration unavailable.');
          const accountText =
            env.LEEWAY_PEER_USERS_JSON ||
            (await readFile(env.LEEWAY_PEER_USERS_FILE, 'utf8'));
          if (Buffer.byteLength(accountText) > 131072)
            throw fail(503, 'Account configuration unavailable.');
          const accounts = JSON.parse(accountText);
          if (
            accounts.schemaVersion !== 1 ||
            !Array.isArray(accounts.users) ||
            accounts.users.length > 200
          )
            throw fail(503, 'Account configuration unavailable.');
          const account = accounts.users.find(
            (row) => row.username === input.username && row.disabled !== true,
          );
          const valid =
            account &&
            text(account.subject) &&
            text(account.org) &&
            text(account.displayName) &&
            roles.includes(account.role) &&
            (account.directoryPolicy === undefined ||
              ['company', 'opt-in'].includes(account.directoryPolicy)) &&
            /^[a-f0-9]{32}$/.test(account.salt) &&
            /^[a-f0-9]{128}$/.test(account.passwordHash);
          const actual = Buffer.from(
            await hashPeerPassword(
              input.password,
              valid ? account.salt : '00000000000000000000000000000000',
            ),
            'hex',
          );
          const expected = Buffer.from(
            valid ? account.passwordHash : '0'.repeat(128),
            'hex',
          );
          if (!timingSafeEqual(actual, expected) || !valid)
            throw fail(401, 'Invalid username or password.');
          const ticket = createPeerTicket(account, secret, { now: now() });
          const user = verifyPeerTicket(ticket, secret, now());
          return send(200, {
            ticket,
            user: identity(user),
            expiresAt: user.exp * 1000,
          });
        } finally {
          pendingPasswords--;
        }
      }
      const user = verifyPeerTicket(
        String(req.headers.authorization || '').replace(/^Bearer /, ''),
        secret,
        now(),
      );
      if (action === 'me' && req.method === 'GET') {
        let iceServers = [];
        try {
          iceServers = JSON.parse(env.LEEWAY_PEER_ICE_SERVERS || '[]');
        } catch {
          throw fail(503, 'ICE configuration invalid.');
        }
        if (!Array.isArray(iceServers))
          throw fail(503, 'ICE configuration invalid.');
        return send(200, {
          user: identity(user),
          expiresAt: user.exp * 1000,
          iceServers,
          turnConfigured: iceServers.some((row) =>
            [row.urls].flat().some((value) => /^turns?:/.test(value)),
          ),
        });
      }
      const read = ['directory', 'inbox', 'blocked'].includes(action);
      if (req.method !== (read ? 'GET' : 'POST'))
        throw fail(405, 'Method not allowed.');
      if (action === 'invite' && !inviteAllow(key(user)))
        throw fail(429, 'Too many invitations.');
      return send(
        200,
        await store.act(
          user,
          action,
          read ? Object.fromEntries(url.searchParams) : input,
        ),
      );
    } catch (error) {
      return send(
        error.status ||
          (error instanceof SyntaxError
            ? 400
            : error.code === 'BODY_TOO_LARGE'
              ? 413
              : 503),
        {
          error: error.status ? error.message : 'Peer service request failed.',
        },
      );
    }
  };
}
export function peerSignalingPlugin(options = {}) {
  const handler = createPeerSignalingHandler(options);
  const install = (server) => {
    server.middlewares.use('/api/peers', handler);
  };
  return {
    name: 'leeway-peer-signaling',
    configureServer: install,
    configurePreviewServer: install,
  };
}
