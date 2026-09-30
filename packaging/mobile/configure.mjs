import { writeFile, access, readFile } from 'node:fs/promises';
const variant = process.argv[2];
if (!['maps', 'logistics'].includes(variant))
  throw Error('Choose maps or logistics');
const app = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);
if ((app.name === '@leeway/maps' ? 'maps' : 'logistics') !== variant)
  throw Error('Build mobile assets from the matching application repository');
await access(new URL('../../dist/index.html', import.meta.url));
await writeFile(
  new URL('capacitor.config.json', import.meta.url),
  JSON.stringify(
    {
      appId: `com.leeway.${variant}`,
      appName: variant === 'maps' ? 'LeeWay Maps' : 'LeeWay Logistics',
      webDir: '../../dist',
      server: { androidScheme: 'https' },
    },
    null,
    2,
  ),
);
