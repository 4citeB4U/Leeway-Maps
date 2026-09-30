import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
/** Return only real nonempty GLB files available to this build's public directory. */
export function aircraftModelInventory(publicDir = path.resolve('public')) {
  if (publicDir === false) return [];
  const dir = path.resolve(publicDir, 'models');
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.glb') &&
          statSync(path.join(dir, entry.name)).size > 20,
      )
      .map((entry) => `/models/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}
