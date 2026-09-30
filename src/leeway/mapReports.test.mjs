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
test('missing incident coverage and stale feeds never report clear roads',()=>{
  assert.match(trafficReport([],{lat:40.7,lon:-74}),/coverage unavailable/);
  assert.match(trafficReport([{id:'traffic-incidents',enabled:true,stats:{stale:true,count:0}}],{lat:41.8,lon:-87.6}),/outdated/);
});
