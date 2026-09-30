import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrames } from './frames.js';
const securityError=()=>Object.assign(new Error('Canvas is tainted'),{name:'SecurityError'});
test('CORS rejected signature cannot be treated as a drawable changed frame',()=>{
  const frames=createFrames({state:{},parts:{}});
  const runtime={image:{},imageReady:true,signatureCanvas:{width:64},signatureCtx:{clearRect(){},drawImage(){},getImageData(){throw securityError();}}};
  assert.equal(frames.projectionFrameSignature(runtime),null);
  assert.equal(runtime.imageOriginBlocked,true);
  assert.equal(runtime.imageReady,false);
});
test('tainted buffer is rejected before becoming a Cesium material image',()=>{
  const frames=createFrames({state:{},parts:{}});
  const buffer={width:10,height:10,getContext:()=>({clearRect(){},drawImage(){},getImageData(){throw securityError();}})};
  const material={image:'last-clean-frame'};
  const runtime={canvas:{},buffers:[buffer,buffer],bufferIndex:0,planeMaterial:material};
  assert.equal(frames.paintNextProjectionBuffer(runtime),null);
  assert.equal(material.image,'last-clean-frame');
  assert.equal(runtime.imageOriginBlocked,true);
});
test('video fallback and ambient image loaders opt into CORS before assigning their URLs',()=>{
  const projection=readFileSync(new URL('./projection.js',import.meta.url),'utf8');
  assert.match(projection,/runtime\.image = new Image\(\);\s*runtime\.image\.crossOrigin = 'anonymous';/);
  const cards=readFileSync(new URL('./cards.js',import.meta.url),'utf8');
  assert.match(cards,/const image = new Image\(\);\s*image\.crossOrigin = 'anonymous';/);
});
