const LAYERS = ['transit-routes','transit-stops','transit-vehicles','transit','flights','traffic','weather-radar','weather-alerts','cctv'];
export async function mountPersonalTravelPanel(application) {
  const manager=application.getComponents().data.dataManager;
  const root=document.createElement('aside'); root.id='leeway-transit-world';
  root.style.cssText='background:#071722;color:#eaffff;padding:18px;overflow:auto';
  root.innerHTML='<button aria-label="Close travel panel" style="float:right">×</button><h2>Travel awareness</h2><p>Explore public transit routes and stops, flights, traffic, cameras and weather through Layers.</p><p>Mapped routes, scheduled departures and live GPS are separate sources. Missing or stale information is labeled in each layer.</p><button data-world>Enable travel layers</button><p role="status"></p>';
  document.body.appendChild(root);
  root.querySelector('[aria-label]').onclick=()=>root.dispatchEvent(new CustomEvent('leeway:right-panel-close',{bubbles:true}));
  root.querySelector('[data-world]').onclick=async()=>{
    const results=await Promise.allSettled(LAYERS.filter(id=>manager.layers.has(id)).map(id=>manager.setEnabled(id,true,{origin:'user'})));
    root.querySelector('[role="status"]').textContent=`Requested ${results.length} layers. Inspect individual feed status; enabled does not mean data is available.`;
  };
  return {root,destroy(){root.remove();}};
}
