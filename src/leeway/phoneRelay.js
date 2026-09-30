// Protocol: 4citeB4U/Leeway-live docs/phone-relay.js @ 37c6be7.
// Native capability authority: LEEWAY-DEVICE-BRIDGE. Credentials are session-only.
export const PHONE_RELAY_URL = 'wss://agent-lee-x.vercel.app/api/device-relay';
export class PhoneRelay {
  constructor({
    WebSocketImpl = globalThis.WebSocket,
    url = PHONE_RELAY_URL,
  } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.url = url;
    this.pending = new Map();
    this.ws = null;
    this.connected = false;
    this.phoneOnline = false;
    this.epoch = 0;
  }
  disconnect() {
    this.epoch++;
    this.connected = false;
    this.phoneOnline = false;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.rejectConnection?.(new Error('Phone connection cancelled'));
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Phone disconnected'));
    }
    this.pending.clear();
  }
  async connect(deviceId, token) {
    this.disconnect();
    if (deviceId.trim().length < 8 || token.trim().length < 20)
      throw new Error('Enter the Device Bridge device ID and pairing token.');
    const epoch = this.epoch;
    return new Promise((resolve, reject) => {
      const ws = new this.WebSocketImpl(this.url);
      this.ws = ws;
      const finish = (error, value) => {
        clearTimeout(timer);
        this.rejectConnection = null;
        error ? reject(error) : resolve(value);
      };
      this.rejectConnection = (error) => finish(error);
      const timer = setTimeout(() => {
        finish(new Error('Phone relay timed out'));
        this.disconnect();
      }, 10000);
      ws.onopen = () => {
        if (epoch === this.epoch)
          ws.send(
            JSON.stringify({
              type: 'hello',
              role: 'client',
              deviceId: deviceId.trim(),
              token: token.trim(),
            }),
          );
      };
      ws.onmessage = (event) => {
        if (epoch !== this.epoch) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'hello-ack') {
          this.connected = true;
          this.phoneOnline = !!msg.phoneOnline;
          finish(null, { connected: true, phoneOnline: this.phoneOnline });
        }
        if (msg.type === 'error') {
          finish(new Error(msg.error || 'Phone relay error'));
          this.disconnect();
        }
        if (msg.type === 'result' && this.pending.has(msg.id)) {
          // Relay has no presence broadcasts. Derive presence only from the
          // current command result, and allow explicit rechecks after offline.
          if (msg.ok) this.phoneOnline = true;
          else if (msg.error === 'PHONE_OFFLINE') this.phoneOnline = false;
          const pending = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          clearTimeout(pending.timer);
          msg.ok
            ? pending.resolve(msg.result)
            : pending.reject(new Error(msg.error || 'Phone command failed'));
        }
      };
      ws.onerror = () => {
        if (epoch === this.epoch) {
          finish(new Error('Phone relay connection failed'));
          this.disconnect();
        }
      };
      ws.onclose = () => {
        if (epoch === this.epoch) {
          finish(new Error('Phone relay closed'));
          this.disconnect();
        }
      };
    });
  }
  command(capability, args = {}, timeoutMs = 30000) {
    if (!this.connected || this.ws?.readyState !== 1)
      return Promise.reject(
        new Error(
          'Phone relay disconnected. Tap Connect / recheck phone to reconnect.',
        ),
      );
    const id = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Phone command timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(
          JSON.stringify({ type: 'command', id, capability, arguments: args }),
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  modelStatus() {
    return this.command('model.status');
  }
  async infer(prompt) {
    const inventory = await this.modelStatus();
    const status = inventory?.status || inventory;
    if (status?.verified !== true)
      throw new Error(
        'Phone model is not verified. Prepare it in Device Bridge first.',
      );
    const result = await this.command('model.inference', { prompt }, 180000);
    if (result?.ok === false || !String(result?.response || '').trim())
      throw new Error(result?.error || 'Phone model returned no text.');
    return result;
  }
}
