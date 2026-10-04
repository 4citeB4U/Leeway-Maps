import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherReport,trafficReport} from './mapReports.js';
test('weather marks stale data and reports actual observations',()=>{
  const now=Date.now();
  const p={weather:{temperatureC:20,weatherCode:0,windKph:16.09,observedAt:new Date(now).toISOString()}};
  assert.equal(weatherReport(p,now),'68°F · CLEAR · Wind 10 mph');
  assert.match(weatherReport(p,now+7200000),/^Older weather/);
  assert.equal(weatherReport({}),'Weather unavailable');
});
test('local traffic truth stays distinct from simulated or unavailable data',()=>{
  assert.match(trafficReport([],{lat:43.04,lon:-87.91}),/Tap for local flow/);
  assert.match(trafficReport([{id:'traffic',enabled:true,stats:{mode:'sim'}}],{lat:43.04,lon:-87.91}),/Simulated flow/);
  assert.match(trafficReport([{id:'traffic',enabled:true,stats:{mode:'live',flowCoveragePct:72}}],{lat:43.04,lon:-87.91}),/Live flow · 72%/);
  assert.match(trafficReport([{id:'traffic-incidents',enabled:true,stats:{stale:true,count:0}}],{lat:41.8,lon:-87.6}),/outdated/);
});
