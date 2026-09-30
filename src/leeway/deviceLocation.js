import * as Cesium from 'cesium';

export function validDeviceFix(position, now = Date.now()) {
  const c = position?.coords;
  if (!c || ![c.latitude,c.longitude,c.accuracy,position.timestamp].every(Number.isFinite) || Math.abs(c.latitude)>90 || Math.abs(c.longitude)>180 || c.accuracy<0 || now-position.timestamp>120000) return null;
  return {lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,at:position.timestamp};
}

/** Device consent remains browser-owned. Fixes live only in memory. */
export function mountDeviceLocation({viewer,button,onChange=()=>{},notify=()=>{},geolocation=globalThis.navigator?.geolocation}) {
  let fix=null,marker=null,watch=null,destroyed=false;
  function accept(position) {
    const next=validDeviceFix(position);if(!next||destroyed)return;
    fix=next;
    const at=Cesium.Cartesian3.fromDegrees(next.lon,next.lat);
    if(!marker) marker=viewer.entities.add({name:'Your device location',position:at,point:{pixelSize:13,color:Cesium.Color.fromCssColorString('#269cff'),outlineColor:Cesium.Color.WHITE,outlineWidth:3,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND},ellipse:{semiMajorAxis:Math.max(1,next.accuracy),semiMinorAxis:Math.max(1,next.accuracy),material:Cesium.Color.fromCssColorString('#269cff').withAlpha(.15),heightReference:Cesium.HeightReference.CLAMP_TO_GROUND}});
    else {marker.position=at;marker.ellipse.semiMajorAxis=Math.max(1,next.accuracy);marker.ellipse.semiMinorAxis=Math.max(1,next.accuracy);}
    if(button){button.title=`Device location · accuracy about ${Math.round(next.accuracy)} m`;button.dataset.locationState='available';}
    viewer.scene.requestRender?.();onChange(next);
  }
  function failure(error) {
    if(destroyed)return;
    if(button){button.dataset.locationState='unavailable';button.title=error.code===1?'Allow location access to use your device location':'Device location unavailable; press to retry';}
    if(error.code===1)notify('Location access is off. Reports use the map area until you allow location.');
  }
  if(geolocation)watch=geolocation.watchPosition(accept,failure,{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
  async function recenter() {
    if(!geolocation){notify('This browser does not provide device location.');return;}
    if(!fix || Date.now()-fix.at>30000) {
      notify('Finding your device location…');
      try{accept(await new Promise((resolve,reject)=>geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000})));}
      catch(error){failure(error);notify(error.code===1?'Allow location access in your browser to center the map.':'Unable to get a fresh device location.');return;}
    }
    if(!fix)return;
    viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(fix.lon,fix.lat,Math.max(500,fix.accuracy*5)),orientation:{heading:0,pitch:-Math.PI/2,roll:0},duration:1});
    notify(`Your device location · accuracy about ${Math.round(fix.accuracy)} m`);
  }
  return {recenter,getPoint:()=>fix && Date.now()-fix.at<120000 ? fix : null,destroy(){destroyed=true;if(watch!==null)geolocation.clearWatch(watch);if(marker)viewer.entities.remove(marker);}};
}
