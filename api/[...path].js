import { createVercelWorldHandler } from '../server/deployment/vercelWorld.js';

// Public LeeWay World Runtime for the static GitHub Pages clients.
// Provider credentials remain server-side environment variables.
export default createVercelWorldHandler();
