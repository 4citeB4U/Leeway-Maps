import {getLocationProvider, locationError} from './locationProvider.js';
import * as Cesium from 'cesium';

export function validDeviceFix(position, now = Date.now()) {
  const c = position?.coords;
  if (!c || ![c.latitude,c.longitude,c.accuracy,position.timestamp].every(Number.isFinite) || Math.abs(c.latitude)>90 || Math.abs(c.longitude)>180 || c.accuracy<0 || position.timestamp>now+10000 || now-position.timestamp>120000) return null;
  return {lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,at:position.timestamp};
}

/** Device consent remains browser-owned. Fixes live only in memory. */
export function mountDeviceLocation({viewer,button,onChange=()=>{},notify=()=>{},geolocation=getLocationProvider(),navigate=(fly)=>fly()}) {
  let fix=null,marker=null,watch=null,destroyed=false,requestEpoch=0;
  function accept(position) {
    const next=validDeviceFix(position);if(!next||destroyed)return false;
    fix=next;
    const at=Cesium.Cartesian3.fromDegrees(next.lon,next.lat);
    if(!marker) marker=viewer.entities.add({name:'Your device location',position:at,point:{pixelSize:13,color:Cesium.Color.fromCssColorString('#269cff'),outlineColor:Cesium.Color.WHITE,outlineWidth:3,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND},ellipse:{semiMajorAxis:Math.max(1,next.accuracy),semiMinorAxis:Math.max(1,next.accuracy),material:Cesium.Color.fromCssColorString('#269cff').withAlpha(.15),heightReference:Cesium.HeightReference.CLAMP_TO_GROUND}});
    else {marker.position=at;marker.ellipse.semiMajorAxis=Math.max(1,next.accuracy);marker.ellipse.semiMinorAxis=Math.max(1,next.accuracy);}
    if(button){button.title=`Device location · accuracy about ${Math.round(next.accuracy)} m`;button.dataset.locationState='available';delete button.dataset.locationError;}
    viewer.scene.requestRender?.();onChange(next);return true;
  }
  function failure(error) {
    if(destroyed)return;
    fix=null;if(marker){viewer.entities.remove(marker);marker=null;viewer.scene.requestRender?.();}onChange(null);
    if(button){button.dataset.locationState='unavailable';button.dataset.locationError=String(locationError(error).code);button.title=locationError(error).message;}
    if(error.code===1)notify('Location access is off. Reports use the map area until you allow location.');
  }
  if(geolocation)watch=geolocation.watchPosition(accept,failure,{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
  async function recenter() {
    if(destroyed)return;
    const epoch=++requestEpoch;
    if(!geolocation){notify('This browser does not provide device location.');return;}
    // Every explicit press asks the device again. Never reuse the map center or
    // an earlier browser/IP-derived fix as an exact current position.
    {
      notify('Finding your device location…');
      try{const position=await new Promise((resolve,reject)=>geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));if(destroyed||epoch!==requestEpoch)return;if(!accept(position)){failure({code:2});notify('The device returned an outdated or invalid location. Please retry.');return;}}
      catch(error){if(destroyed||epoch!==requestEpoch)return;failure(error);notify(locationError(error).message);return;}
    }
    if(!fix)return;
    if(fix.accuracy>10000){notify(`The device only returned an approximate location (within ${Math.round(fix.accuracy/1000)} km). Enable precise location in your device and browser settings, then retry. The map has not been moved.`);return;}
    const moved = await navigate(() => { viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(fix.lon,fix.lat,Math.max(500,fix.accuracy*5)),orientation:{heading:0,pitch:-Math.PI/2,roll:0},duration:1}); return true; });
    if (moved === false) { notify('Location is available, but another camera view prevented recentering.'); return false; }
    notify(`Your device location · accuracy about ${Math.round(fix.accuracy)} m`);
  }
  return {recenter,getPoint:()=>fix && Date.now()-fix.at<120000 ? fix : null,destroy(){destroyed=true;requestEpoch++;if(watch!==null)geolocation.clearWatch(watch);if(marker)viewer.entities.remove(marker);}};
}
