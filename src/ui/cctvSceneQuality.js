/** Conservative visual warning, never an offline/placeholder classifier.
 * Restrict inspection to the central scene so a bright timestamp/logo cannot
 * make an otherwise black image appear healthy. Legitimate night scenes may
 * also trigger this warning; keep their pixels visible and do not auto-hop.
 */
export function cameraSceneQuality({ data, width, height } = {}) {
  if (!data || width < 8 || height < 8 || data.length < width * height * 4)
    return 'unknown';
  let dark = 0,
    count = 0;
  for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.7); y++) {
    for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.8); x++) {
      const i = (y * width + x) * 4;
      const brightness =
        data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (brightness < 12) dark++;
      count++;
    }
  }
  return count > 0 && dark / count >= 0.985 ? 'dark-or-blank' : 'unverified';
}

export function inspectCameraScene(image, documentImpl = globalThis.document) {
  try {
    const canvas = documentImpl?.createElement?.('canvas');
    if (!canvas) return 'unknown';
    canvas.width = 64;
    canvas.height = 36;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 'unknown';
    context.drawImage(image, 0, 0, 64, 36);
    const pixels = context.getImageData(0, 0, 64, 36);
    return cameraSceneQuality({ data: pixels.data, width: 64, height: 36 });
  } catch {
    // Cross-origin or unsupported canvas inspection does not prove a bad frame.
    return 'unknown';
  }
}
