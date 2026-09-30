import path from 'node:path';
import { readRequestBody } from './common/request.js';

const DEFAULT_VOICE_KERNEL_URL = 'http://127.0.0.1:8092';
const MAX_TEXT_CHARS = 1400;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const VOICE_REQUEST_TIMEOUT_MS = 120_000;
const CLONE_ID = 'LEEWAY_VOICE::AGENT_LEE::DEFAULT_CLONE';

function voiceKernelBase() {
  return String(
    process.env.LEEWAY_VOICE_KERNEL_URL || DEFAULT_VOICE_KERNEL_URL,
  ).replace(/\/$/, '');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function safeOutputFilename(audioPath) {
  const value = String(audioPath || '')
    .trim()
    .replace(/\\/g, '/');
  if (!value.startsWith('/app/output/')) return '';
  const filename = path.posix.basename(value);
  return /^[a-z0-9._-]+\.wav$/i.test(filename) ? filename : '';
}

async function synthesizeAgentLee(
  text,
  {
    fetchImpl = globalThis.fetch,
    kernelBase = voiceKernelBase(),
    language = 'en',
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_REQUEST_TIMEOUT_MS);
  try {
    const identityResponse = await fetchImpl(`${kernelBase}/voice-identity`, {
      signal: controller.signal,
      redirect: 'error',
    });
    if (!identityResponse.ok) throw new Error('Voice identity unavailable');
    const identity = await identityResponse.json();
    if (
      identity.voiceId !== CLONE_ID ||
      identity.voice_loaded !== true ||
      !identity.supportedLanguages?.includes(language)
    )
      throw new Error('Selected clone or language is unavailable');
    const response = await fetchImpl(`${kernelBase}/tts`, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice: CLONE_ID,
        language,
        speed: 1.0,
      }),
    });
    const result = await response.json().catch(() => null);
    if (
      !response.ok ||
      result?.status !== 'success' ||
      result.voice !== CLONE_ID
    ) {
      throw new Error(`Agent Lee voice kernel HTTP ${response.status}`);
    }

    const filename = safeOutputFilename(result.audio_path);
    if (!filename)
      throw new Error('Voice kernel returned an invalid audio path');

    const audio = await fetchImpl(
      `${kernelBase}/audio/${encodeURIComponent(filename)}`,
      {
        signal: controller.signal,
        headers: { Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1' },
        redirect: 'error',
      },
    );
    if (!audio.headers.get('content-type')?.startsWith('audio/'))
      throw new Error('Voice service did not return audio');
    if (!audio.ok) {
      throw new Error(`Agent Lee audio HTTP ${audio.status}`);
    }
    const bytes = Buffer.from(await audio.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) {
      throw new Error(
        'Agent Lee audio response is empty or exceeds the safety limit',
      );
    }

    return {
      bytes,
      contentType: audio.headers.get('content-type') || 'audio/wav',
      voiceId: result.voice,
      synthesisSeconds: Number(result.duration) || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function agentLeeVoiceProxy(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const kernelBase = options.kernelBase || voiceKernelBase();

  async function handle(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const raw = await readRequestBody(req, 16 * 1024);
      const body = JSON.parse(raw || '{}');
      const text = String(body?.text || '').trim();
      if (!text) {
        sendJson(res, 400, { error: 'Text is required' });
        return;
      }
      if (text.length > MAX_TEXT_CHARS) {
        sendJson(res, 413, {
          error: `Agent Lee speech text exceeds ${MAX_TEXT_CHARS} characters`,
        });
        return;
      }

      const language = String(body.language || 'en');
      const result = await synthesizeAgentLee(text, {
        fetchImpl,
        kernelBase,
        language,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', String(result.bytes.length));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-LeeWay-Voice-ID', result.voiceId);
      if (result.synthesisSeconds !== null)
        res.setHeader(
          'X-LeeWay-Voice-Synthesis-Seconds',
          String(result.synthesisSeconds),
        );
      res.end(result.bytes);
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      console.warn(
        '[AgentLeeVoice] synthesis failed:',
        error?.message || error,
      );
      sendJson(res, timedOut ? 504 : 502, {
        error: timedOut
          ? 'Agent Lee voice synthesis timed out'
          : 'Agent Lee voice synthesis failed',
      });
    }
  }

  async function identity(req, res) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      const response = await fetchImpl(`${kernelBase}/voice-identity`, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Voice identity unavailable');
      const value = await response.json();
      // Expose capability identity only, never the host speaker-reference path.
      sendJson(res, 200, {
        voiceId: value.voiceId,
        voice_loaded: value.voice_loaded === true,
        engine: value.engine,
        supportedLanguages: value.supportedLanguages || [],
      });
    } catch {
      sendJson(res, 502, { error: 'Voice identity unavailable' });
    }
  }

  return {
    name: 'leeway-agent-lee-voice-proxy',
    configureServer(server) {
      server.middlewares.use('/api/agent-lee/tts', handle);
      server.middlewares.use('/api/agent-lee/voice-identity', identity);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/agent-lee/tts', handle);
      server.middlewares.use('/api/agent-lee/voice-identity', identity);
    },
  };
}

export {
  DEFAULT_VOICE_KERNEL_URL,
  MAX_AUDIO_BYTES,
  MAX_TEXT_CHARS,
  agentLeeVoiceProxy,
  safeOutputFilename,
  synthesizeAgentLee,
};
