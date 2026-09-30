import { writeFile } from 'node:fs/promises';
import { build, Platform } from 'electron-builder';
const variant = process.argv[2];
const variants = {
  maps: { name: 'LeeWay Maps', url: 'https://4citeb4u.github.io/Leeway-Maps/' },
  logistics: {
    name: 'LeeWay Logistics',
    url: 'https://leewaylogistics.vercel.app/',
  },
};
if (!variants[variant])
  throw Error('Usage: npm run build -- maps|logistics [win|mac|linux]');
const platform =
  process.argv[3] ||
  { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
if (!['win', 'mac', 'linux'].includes(platform))
  throw Error('Unsupported build target');
await writeFile(
  new URL('app-config.json', import.meta.url),
  JSON.stringify(variants[variant]),
);
await build({
  targets: { win: Platform.WINDOWS, mac: Platform.MAC, linux: Platform.LINUX }[
    platform
  ].createTarget(),
  publish: 'never',
  config: {
    appId: `com.leeway.${variant}`,
    productName: variants[variant].name,
    directories: { output: `release/${variant}` },
    files: ['main.cjs', 'app-config.json', 'package.json'],
    asar: true,
    win: { target: 'portable' },
    mac: { target: ['dmg', 'zip'], hardenedRuntime: true },
    linux: { target: 'AppImage', category: 'Utility' },
  },
});
