import { readFile, writeFile } from 'node:fs/promises';
const platform = process.argv[2];
if (platform === 'android') {
  const path = new URL(
    'android/app/src/main/AndroidManifest.xml',
    import.meta.url,
  );
  let text = await readFile(path, 'utf8');
  for (const permission of [
    'RECORD_AUDIO',
    'ACCESS_COARSE_LOCATION',
    'ACCESS_FINE_LOCATION',
  ]) {
    if (!text.includes(`android.permission.${permission}`))
      text = text.replace(
        '</manifest>',
        `<uses-permission android:name="android.permission.${permission}" />\n</manifest>`,
      );
  }
  await writeFile(path, text);
} else if (platform === 'ios') {
  const path = new URL('ios/App/App/Info.plist', import.meta.url);
  let text = await readFile(path, 'utf8');
  for (const [key, value] of [
    [
      'NSMicrophoneUsageDescription',
      'LeeWay uses the microphone only when you start a voice request.',
    ],
    [
      'NSLocationAlwaysAndWhenInUseUsageDescription',
      'LeeWay uses your location to show nearby routes when you request it.',
    ],
    [
      'NSLocationWhenInUseUsageDescription',
      'LeeWay uses your location to show nearby routes when you request it.',
    ],
  ]) {
    if (!text.includes(`<key>${key}</key>`))
      text = text.replace(
        /<\/dict>\s*<\/plist>\s*$/,
        `<key>${key}</key><string>${value}</string>\n</dict>\n</plist>\n`,
      );
  }
  await writeFile(path, text);
} else throw Error('Choose android or ios');
