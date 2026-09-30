// HTTP consumer only. Canonical Formula mathematics remain in the authority runtime.
export const FORMULA_ID = 'LEEWAY-FORMULA-v1.0';
const PREFIX = '/runtime/formula/v1';

export function resolveBaseUrl(explicit, environment = process.env) {
  const url = new URL(explicit || environment.LEEWAY_FORMULA_BASE_URL || 'http://127.0.0.1:4001');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Formula base URL must be HTTP(S), without credentials, query or fragment');
  }
  return url.href.replace(/\/+$/, '');
}

function rows(value, integer = false) {
  return Array.isArray(value) && value.length === 16 && value.every(row =>
    Array.isArray(row) && row.length === 6 && row.every(cell =>
      typeof cell === 'number' && Number.isFinite(cell) &&
      (!integer || (Number.isInteger(cell) && cell >= 0 && cell <= 69))));
}

export function validateRequest(request) {
  if (!request || typeof request !== 'object' || !request.input) throw new Error('Formula input required');
  if (request.adapterId === 'raw-base64-v1') {
    if (!rows(request.input.matrix, true)) throw new Error('Expected a 16x6 integer matrix in 0..69');
  } else if (request.adapterId === 'runtime-state-v1') {
    if (!rows(request.input.stateRows)) throw new Error('Expected 16x6 finite runtime observations');
    if (request.input.matrix !== undefined) {
      if (!rows(request.input.matrix, true)) throw new Error('Expected a 16x6 integer matrix in 0..69');
    } else {
      const ranges = request.input.ranges;
      if (!Array.isArray(ranges) || ranges.length !== 6 || !ranges.every(range =>
        Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] < range[1])) {
        throw new Error('Expected six finite increasing ranges');
      }
    }
  } else throw new Error('Unsupported Formula adapter');
  for (const key of ['caller', 'traceId']) {
    if (request[key] !== undefined && typeof request[key] !== 'string') throw new Error(`${key} must be a string`);
  }
}

export function createFormulaClient({ baseUrl, timeoutMs = 10000, fetchImpl = globalThis.fetch } = {}) {
  const runtimeTarget = resolveBaseUrl(baseUrl);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Positive timeout required');
  async function call(endpoint, body) {
    const response = await fetchImpl(`${runtimeTarget}${PREFIX}/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`Formula ${endpoint} HTTP ${response.status}`);
    return response.json();
  }
  async function health() {
    const result = await call('health');
    if (result.formula !== FORMULA_ID || result.status !== 'LEEWAY_FORMULA_V1_PASS' ||
        result.goldenVectorPass !== true || result.specValid !== true || result.adapterRegistryPass !== true) {
      throw new Error('Formula identity or diagnostic health gate failed');
    }
    return result;
  }
  return {
    runtimeTarget,
    health,
    async evaluate(request, provenance) {
      validateRequest(request);
      if (!provenance || !['source', 'mapping', 'authorization'].every(key =>
        typeof provenance[key] === 'string' && provenance[key].trim())) {
        throw new Error('Input provenance requires source, mapping and authorization');
      }
      const diagnostic = await health();
      const result = await call('evaluate', request);
      if (result.formulaId !== FORMULA_ID || result.adapterId !== request.adapterId ||
          !['inputHash', 'resultHash', 'receiptPath', 'evaluatedAt'].every(key =>
            typeof result[key] === 'string' && result[key].length > 0) ||
          !Array.isArray(result.decimalState) || result.decimalState.length !== 6 ||
          !result.decimalState.every(value => Number.isInteger(value) && value >= 0 && value <= 69) ||
          !Array.isArray(result.base64State) || result.base64State.length !== 6 ||
          !result.base64State.every(value => typeof value === 'string')) {
        throw new Error('Formula response identity or execution evidence missing');
      }
      return {
        authoritySource: '4citeB4U/Leeway-formula-live', runtimeTarget,
        observedAt: new Date().toISOString(), inputProvenance: { ...provenance },
        runtimeExecutionState: 'EXECUTED', verificationStatus: 'UNVERIFIED',
        diagnostic, result
      };
    }
  };
}
