// Portable artifact inspection, not a claim that each OS/store has been tested.
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'public');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
const errors = [];
for (const field of ['id', 'name', 'start_url', 'scope', 'display']) if (!manifest[field]) errors.push(`Manifest ${field} missing`);
for (const size of ['192x192', '512x512']) if (!manifest.icons?.some(icon => icon.sizes === size)) errors.push(`Icon ${size} missing`);
for (const file of [...(manifest.icons || []).map(icon => icon.src), 'sw.js', 'offline.html', 'offlineTripCore.js', 'offlineTripPage.js']) {
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(root + path.sep)) { errors.push('Asset outside package'); continue; }
  try { await access(resolved); } catch { errors.push(`Asset missing: ${file}`); }
}
console.log(JSON.stringify({ product: manifest.name, staticInstallArtifacts: errors.length ? 'FAIL' : 'PASS', errors,
  offlineCapability: 'saved-trip-viewer; live routing, imagery, traffic and telemetry require network',
  nativePackage: 'NOT_BUILT', storePublication: 'NOT_SUBMITTED', deviceQualification: 'NOT_TESTED_BY_THIS_CHECK' }, null, 2));
process.exitCode = errors.length ? 1 : 0;
