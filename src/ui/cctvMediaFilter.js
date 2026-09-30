export function cameraMatchesMediaFilter(camera, filter = 'all') {
  if (filter === 'video')
    return (
      camera.mediaCapabilities?.video ??
      ['hls', 'mp4', 'webm'].includes(camera.feedType)
    );
  if (filter === 'snapshot')
    return (
      camera.mediaCapabilities?.snapshot ??
      !['hls', 'mp4', 'webm'].includes(camera.feedType)
    );
  return true;
}
export function cameraMediaLabel(camera) {
  if (camera.mediaCapabilities?.locationOnly) return 'LOCATION ONLY';
  if (cameraMatchesMediaFilter(camera, 'video'))
    return camera.feedType === 'hls' ? 'LIVE VIDEO' : 'VIDEO CLIP';
  return 'SNAPSHOT';
}
