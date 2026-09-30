import { worldApiBase } from './worldApiBridge.js';
import { readResponseJsonCapped } from '../sources/httpBody.js';
import {
  reportPoint,
  validateReportInput,
  validSharedReport,
} from './hazardReportContract.js';

export function normalizeReportServer(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a valid HTTPS report-server address.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Use an HTTPS report-server origin, or HTTP loopback for local testing.',
    );
  }
  return url.origin;
}

export function createHazardReportsClient({
  serverUrl = worldApiBase(),
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const base = normalizeReportServer(serverUrl);
  async function request(suffix, { body, token, signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.throwIfAborted();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error('Report server timed out. Publication was not confirmed.'),
        ),
      10000,
    );
    try {
      const response = await fetchImpl(`${base}/api/hazard-reports${suffix}`, {
        method: body ? 'POST' : 'GET',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        headers: body
          ? {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            }
          : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const value = await readResponseJsonCapped(
        response,
        256 * 1024,
        controller.signal,
      );
      if (!response.ok)
        throw new Error(
          typeof value?.error === 'string'
            ? value.error
            : `Report service HTTP ${response.status}`,
        );
      return value;
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error(
          'Report service unavailable or returned an invalid response. Publication was not confirmed.',
        );
      if (body && error instanceof TypeError)
        throw new Error(
          'Report server could not confirm publication. Check nearby reports before retrying.',
        );
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    base,
    async status(options) {
      const value = await request('/status', options);
      if (
        typeof value?.available !== 'boolean' ||
        value.storage !== 'shared-process-ttl'
      )
        throw new Error(
          'This server does not provide the shared-report contract.',
        );
      return value;
    },
    async nearby(point, options) {
      const rounded = reportPoint(point);
      const value = await request(
        `?lat=${rounded.lat}&lon=${rounded.lon}&radiusKm=10`,
        options,
      );
      if (
        !Array.isArray(value?.reports) ||
        value.reports.length > 100 ||
        value.source !== 'community' ||
        value.verification !== 'unverified'
      )
        throw new Error('Invalid shared report response.');
      return {
        ...value,
        reports: value.reports.filter((row) => validSharedReport(row)),
      };
    },
    async publish(input, token, options = {}) {
      if (typeof token !== 'string' || token.length < 24 || token.length > 1000)
        throw new Error(
          'Enter the report-server access token before publishing.',
        );
      const value = await request('', {
        ...options,
        body: validateReportInput(input),
        token,
      });
      if (
        value?.published !== true ||
        value.sharedScope !== 'clients-of-this-server' ||
        !validSharedReport(value.report)
      )
        throw new Error(
          'Server did not confirm a valid shared report. Publication is unconfirmed.',
        );
      return value;
    },
  };
}
