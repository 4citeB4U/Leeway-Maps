import { createFormulaClient } from './leeway-formula-client.mjs';
// Read-only external authority diagnostics; never infer task execution from health.
// Evaluation remains a server-owned capability with approved measured input.
export function createEcosystemClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  async function formulaHealth() {
    const configured = Boolean(env.LEEWAY_FORMULA_BASE_URL);
    if (!configured) return { configured: false, status: 'unconfigured', taskEvaluation: 'NOT_EXECUTED' };
    try {
      const url = new URL(env.LEEWAY_FORMULA_BASE_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('HTTPS authority endpoint required');
      const response = await fetchImpl(`${url.href.replace(/\/$/, '')}/runtime/formula/v1/health`, {
        redirect: 'error', signal: AbortSignal.timeout(8000), headers: {
          accept: 'application/json',
          ...(env.LEEWAY_FORMULA_TOKEN ? { authorization: `Bearer ${env.LEEWAY_FORMULA_TOKEN}` } : {}),
        },
      });
      if (!response.ok) throw new Error('Authority unavailable');
      const data = await response.json();
      const healthy = data.formula === 'LEEWAY-FORMULA-v1.0' && data.status === 'LEEWAY_FORMULA_V1_PASS' && data.goldenVectorPass === true && data.specValid === true && data.adapterRegistryPass === true;
      return { configured, status: healthy ? 'diagnostic-pass' : 'identity-failed', taskEvaluation: 'NOT_EXECUTED', formula: healthy ? data.formula : null };
    } catch { return { configured, status: 'unavailable', taskEvaluation: 'NOT_EXECUTED' }; }
  }
  return { formulaHealth,
    // Server-only; do not expose arbitrary public evaluation or fabricate a mapping.
    async evaluate(request, provenance) {
      const health = await formulaHealth();
      if (health.status !== 'diagnostic-pass') throw new Error('Formula authority is unavailable');
      const client = createFormulaClient({ baseUrl: env.LEEWAY_FORMULA_BASE_URL,
        fetchImpl: (url, init) => fetchImpl(url, { ...init, headers: { ...init.headers,
          ...(env.LEEWAY_FORMULA_TOKEN ? { authorization: `Bearer ${env.LEEWAY_FORMULA_TOKEN}` } : {}),
        } }),
      });
      return client.evaluate(request, provenance);
    },
    async status() { return {
    formula: await formulaHealth(),
    skills: { configured: Boolean(env.LEEWAY_SKILLS_MCP_URL), status: 'NOT_CONNECTED', execution: 'NOT_EXECUTED', transport: 'streamable-http-mcp' },
    voice: { transport: 'external-browser-bridge', url: 'https://4citeb4u.github.io/LeeWay-Voice-Fabric', status: 'client-qualification-required' },
    coreRequiresLlm: false,
  }; } };
}
export function leewayEcosystemProxy(options = {}) {
  const client = createEcosystemClient(options);
  return { name: 'leeway-ecosystem', configureServer(server) {
    server.middlewares.use('/api/leeway/ecosystem/status', async (req, res) => {
      res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
      if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
      res.end(JSON.stringify(await client.status()));
    });
  } };
}
