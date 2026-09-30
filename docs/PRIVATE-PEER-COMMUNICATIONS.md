# Private driver communications

The optional signaling service authenticates operator-provisioned driver, dispatcher and manager accounts. An opt-in directory exposes only names, roles and an optional typed area label within the same organization. It never publishes GPS automatically. A sender invites; the recipient explicitly accepts before signaling or media is allowed. Text and audio/video belong to the accepted WebRTC connection; this server does not record or relay media itself.

## Account provisioning

Run `node scripts/provision-peer-user.mjs --file /private/peer-users.json --username USER --subject UNIQUE_ID --org FLEET_ID --role driver --name DISPLAY_NAME` from `apps/transit-world`, supplying the password on standard input from a protected password source. Passwords must be 12–256 characters. Do not put passwords in shell arguments/history. Existing usernames or organization identities are rejected. The CLI uses scrypt (N=16384, r=8, p=1, 64-byte hash, random 16-byte salt), atomic replacement and mode 0600 where supported. On Windows configure filesystem ACLs for the service/operator only. No accounts are bundled or created automatically.

Server-only environment:

- `LEEWAY_PEER_SIGNALING_ENABLED=1`
- `LEEWAY_PEER_SIGNING_SECRET`: cryptographically random secret of at least 32 characters, never a VITE variable.
- `LEEWAY_PEER_USERS_FILE`: protected provisioned JSON file; or `LEEWAY_PEER_USERS_JSON`: identical server-only JSON for immutable/cloud deployments.
- `LEEWAY_PEER_ICE_SERVERS`: optional standard RTCPeerConnection ICE server JSON array. Defaults empty. Supply an operated STUN/TURN service for real network traversal. Static TURN credentials are visible to authenticated clients; prefer short-lived scoped credentials in a deployment adapter.

Remote deployments require HTTPS and a configured origin allowlist. Login is capped at 5 attempts/minute/socket peer and 30 globally per process, with at most two concurrent password derivations. General traffic is 240 requests/minute/socket and 3,000 globally; invitations 6/minute/identity and 100 globally. A reverse proxy must enforce a shared deployment-wide rate limit too. The handler deliberately does not trust client-supplied forwarded IP headers.

## REST contract

Mount `peerSignalingPlugin()` for Vite or `createPeerSignalingHandler()` in a server at `/api/peers`.

- `GET /status`: availability and loginAvailable; no secrets.
- `POST /login {username,password}`: `{ticket,user:{id,displayName,role},expiresAt}`. Fifteen-minute HMAC-signed bearer ticket; times are epoch milliseconds.
- Remaining calls require `Authorization: Bearer TICKET`.
- `GET /me`: authenticated user, expiresAt, iceServers, turnConfigured.
- `POST /presence {discoverable:boolean,area?:string}`: directory opt-in for 90 seconds. Renew every 30 seconds only while opted in. Polling does not renew it.
- `GET /directory`: `{peers:[{id,displayName,role,area}]}` for that organization.
- `GET /inbox?after=N`: `{events:[{seq,type,...}],cursor}`. Poll every two seconds, process in order, retain cursor. The newest 64 events per identity expire after two minutes; this is ephemeral signaling, not message history.
- `POST /invite {to,media:'text'|'audio'|'video'}`: `{inviteId,expiresAt}`; recipient receives `invite` with sender identity and media. Invites expire after 60 seconds.
- `POST /respond {inviteId,accept:boolean}`: decline emits `declined`; accept emits `accepted {inviteId,sessionId,peer,initiator,media}` to both parties.
- `POST /signal {sessionId,description|candidate}` relays only to the accepted other party. Offer from initiator, answer from recipient, bounded SDP/ICE and accepted media types are enforced.
- `POST /hangup {sessionId}` emits `ended` to both parties.

Sessions expire after at most 15 minutes or either original ticket's expiry. Client must stop tracks/data channels on expiry, hangup, logout, auth failure or connection failure. Browsers must also verify the accepted inviteId against their current explicit local consent before requesting media. Session renewal requires a new invitation. Disabling an account prevents new logins; existing bearer tickets remain valid up to 15 minutes. Rotate signing secret for immediate global revocation.

## Deployment state

Local default state is one bounded process and disappears on restart. It is not suitable for horizontally scaled deployment. With `VERCEL` set, the handler fails closed unless a shared store is explicitly injected. `createPeerSignalingStore()` exports `act(user,action,input)`, `exportState()` and `importState(snapshot)`. An external adapter must atomically read, import, act, export and write each transaction under Redis CAS or an ownership-safe lock; the handler awaits asynchronous `store.act`. Snapshot version 1 contains bounded map-entry arrays peers, invites, sessions and inboxes plus sequence. Use a dedicated private deployment key and TTL, encrypt transport, do not log SDP/ICE/account data. Snapshot input is trusted server state, never browser input. No durable backend is provisioned by this module.

Directory/invite/session limits are 200 each. Inbox storage is capped at 512 KiB total, evicting oldest signals under pressure; clients must time out and invite again if negotiation does not complete. SDP can contain network metadata and ICE candidates reveal connection addresses to the accepted peer; explain this when requesting a call. No location-based proximity, public directory, arbitrary identity minting, public signup, persistent text history, or fleet-wide broadcast is implemented here.

Verification: `node --test server/providers/peerSignaling.test.mjs` covers password authentication, tamper/expiry rejection, tenant isolation, mutual acceptance, unauthorized signaling, media bounds, snapshot round trip, throttling and cloud fail-closed configuration.
