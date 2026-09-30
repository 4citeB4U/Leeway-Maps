import { createPipelinesLayer } from '../../layers/pipelines/index.js';

export function createApplicationPipelines({ source }) {
  return createPipelinesLayer({ source });
}
