import {
  createVercelWorldHandler,
  restoreVercelApiPath,
} from '../server/deployment/vercelWorld.js';

const handler = createVercelWorldHandler();

// Standalone Vercel Node functions do not provide Next.js catch-all semantics.
// vercel.json explicitly routes nested APIs here and carries the original path.
export default async function world(req, res) {
  const original = req.url;
  req.url = restoreVercelApiPath(req.url, req.query);
  try {
    return await handler(req, res);
  } finally {
    req.url = original;
  }
}
