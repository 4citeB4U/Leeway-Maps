function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p/100)*sorted.length)-1));
  return sorted[index];
}

const DYNAMIC_IDS = new Set([
  'transit','transit-vehicles','flights','military','ais-live-vessels',
]);

export const STATIC_SPATIAL_DIMENSIONS = Object.freeze([
  'visible_static_candidate_count',
  'rendered_static_label_count',
  'enabled_static_layer_count',
  'camera_height_m',
  'frame_time_ms',
  'interaction_latency_ms',
]);

export function buildStaticSpatialObservation({
  dataManager,
  placesOverlay,
  cameraHeightM,
  frameTimes,
  interactionLatencyMs,
  at=Date.now(),
}={}) {
  const rows=(dataManager?.getAll?.()||[]).filter((row)=>row?.enabled && !DYNAMIC_IDS.has(String(row.id||'')));
  const places=placesOverlay?.getStats?.()||{};
  const candidates=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.stats?.count||0)),0)
    + Math.max(0,Number(places.renderedCount||0));
  const values=[
    candidates,
    Math.max(0,Number(places.renderedCount||0)),
    rows.length,
    Number.isFinite(cameraHeightM)?cameraHeightM:null,
    percentile(frameTimes||[],95),
    Number.isFinite(interactionLatencyMs)?interactionLatencyMs:null,
  ];
  return {
    at,
    contractId:'personal-map-static-spatial-observation-v0',
    complete:values.every(Number.isFinite),
    dimensionOrder:[...STATIC_SPATIAL_DIMENSIONS],
    values,
    context:{
      enabledStaticLayers:rows.map((row)=>row.id),
      places,
    },
  };
}

export function mountStaticSpatialObservationGate({
  shell,dataManager,placesOverlay,viewer,
  windowRef=window,
}={}) {
  const params=new URLSearchParams(windowRef.location?.search||'');
  const enabled=params.get('staticSpatialMeasure')==='1';
  if(!enabled) return {enabled:false,getRows:()=>[],getObservations:()=>[],destroy(){}};

  const frameTimes=[];
  const observations=[];
  let interactionLatencyMs=null;
  let interactionStart=null;
  let lastFrameAt=performance.now();
  let rafId=null;
  let timer=null;
  let destroyed=false;

  function frame(now){
    if(destroyed) return;
    const delta=now-lastFrameAt; lastFrameAt=now;
    if(delta>0&&delta<1000){frameTimes.push(delta);if(frameTimes.length>240)frameTimes.shift();}
    rafId=windowRef.requestAnimationFrame(frame);
  }
  function down(){interactionStart=performance.now();}
  function up(){
    if(!Number.isFinite(interactionStart)) return;
    const started=interactionStart; interactionStart=null;
    windowRef.requestAnimationFrame(()=>{interactionLatencyMs=performance.now()-started;});
  }
  function sample(){
    const row=buildStaticSpatialObservation({
      dataManager,placesOverlay,
      cameraHeightM:Number(viewer?.camera?.positionCartographic?.height),
      frameTimes,interactionLatencyMs,
    });
    observations.push(row);
    if(observations.length>256) observations.shift();
  }
  shell?.addEventListener?.('pointerdown',down,true);
  shell?.addEventListener?.('pointerup',up,true);
  rafId=windowRef.requestAnimationFrame(frame);
  timer=windowRef.setInterval(sample,2000);
  sample();

  const api={
    enabled:true,
    getObservations:()=>observations.map((row)=>structuredClone(row)),
    getRows:()=>observations.filter((row)=>row.complete).map((row)=>row.values.slice()),
    latest:()=>observations.length?structuredClone(observations.at(-1)):null,
    exportTrace:()=>({
      schemaVersion:'1.0.0',
      contractId:'personal-map-static-spatial-observation-v0',
      provenance:'LIVE_BROWSER_STATIC_SPATIAL_MEASUREMENT',
      createdAt:new Date().toISOString(),
      userAgent:navigator.userAgent,
      observations:api.getObservations(),
    }),
    destroy(){
      destroyed=true;
      if(rafId!=null)windowRef.cancelAnimationFrame(rafId);
      if(timer!=null)windowRef.clearInterval(timer);
      shell?.removeEventListener?.('pointerdown',down,true);
      shell?.removeEventListener?.('pointerup',up,true);
    },
  };
  windowRef.__leewayStaticSpatialTelemetry=api;
  return api;
}
