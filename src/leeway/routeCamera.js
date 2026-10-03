/** Route both planner destinations through the workspace's camera authority. */
export function createRouteCamera(viewer, navigate = fly => fly()) {
  return {
    point(options) { return navigate(() => { viewer.camera.flyTo(options); return true; }); },
    route(entities) { return navigate(() => viewer.flyTo(entities, { duration: 1 })); },
  };
}
