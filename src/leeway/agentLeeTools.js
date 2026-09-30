import { createGevActionRunner } from '../voice/gevActions.js';
import { GEV_ACTION_SCHEMAS } from '../voice/actionSchemas.js';

const SPATIAL_TOOL_NAMES = Object.freeze([
  'fly_to_location',
  'adjust_camera_zoom',
  'zoom_to_globe',
  'set_layer_visibility',
  'show_data_layers_menu',
  'get_entity_context',
  'get_current_view_state',
  'set_map_stack',
  'control_cctv',
  'track_entity',
  'stop_tracking',
  'frame_overhead',
  'annotate_map',
  'clear_annotations',
  'move_camera',
  'fly_route',
  'analyst_query',
]);

const descriptions = Object.freeze({
  fly_to_location:
    'Fly the LeeWay Transit World camera to a named place, address, facility, city, region, landmark, or coordinates.',
  adjust_camera_zoom:
    'Zoom the current map view in or out without changing the selected operating context.',
  zoom_to_globe: 'Return to a full-world globe view.',
  set_layer_visibility:
    'Enable or disable a registered world-awareness data layer such as traffic, CCTV, vessels, flights, satellites, fires, transit, or infrastructure.',
  show_data_layers_menu:
    'Open the map data-layer chooser and optionally focus one layer.',
  get_entity_context:
    'Read the selected asset or current map context before answering what the operator is looking at.',
  get_current_view_state:
    'Read current camera, layer, feed-provenance, map-stack, and scene state.',
  set_map_stack: 'Switch the map source or 3D stack.',
  control_cctv:
    'Operate public CCTV coverage: enable, find nearest, select, focus, cycle, or show coverage.',
  track_entity:
    'Track or follow a specific loaded vehicle, vessel, aircraft, or satellite entity.',
  stop_tracking: 'Stop following the currently tracked entity.',
  frame_overhead:
    'Frame loaded flights, vessels, satellites, or military traffic above the current area.',
  annotate_map:
    'Mark locations, draw areas, connect places, or draw walking/driving/cycling routes on the world.',
  clear_annotations:
    'Clear map annotations only when the operator explicitly requests it.',
  move_camera: 'Orbit, pan, tilt, rotate, or stop map camera motion.',
  fly_route: 'Fly the camera along an existing route annotation.',
  analyst_query:
    'Analyze currently loaded world-layer records by scope, filters, sort order, or proximity without moving the map.',
});


function toOllamaTool(schema) {
  return {
    type: 'function',
    function: {
      name: schema.name,
      description:
        descriptions[schema.name] || schema.description || schema.name,
      parameters: schema.parameters || { type: 'object', properties: {} },
    },
  };
}

export function agentLeeTools() {
  const spatial = GEV_ACTION_SCHEMAS.filter((schema) =>
    SPATIAL_TOOL_NAMES.includes(schema.name),
  ).map(toOllamaTool);
  return spatial;
}

export function createAgentLeeToolRuntime(application, shell) {
  const components = application.getComponents();
  const scene = components.scene;
  const controls = components.controls;
  const data = components.data;
  const tools = components.tools;

  const spatialRunner = createGevActionRunner({
    viewer: scene.viewer,
    styleManager: controls.styleManager,
    dataManager: data.dataManager,
    sceneDirector: tools.sceneDirector,
    annotations: tools.annotations,
    floorServices: scene.operations.surface.groundFloor,
    annotationResolver: scene.operations.annotationResolver,
    searchNavigation: scene.operations.searchAndFlyTo,
  });

  return {
    tools: agentLeeTools(),
    async execute(name, args = {}) {

      if (!SPATIAL_TOOL_NAMES.includes(name)) {
        throw new Error(`Tool is not authorized for Agent Lee: ${name}`);
      }
      return spatialRunner(name, args, { isCurrent: () => true });
    },
  };
}
