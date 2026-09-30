import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDieselRss} from '../../scripts/refresh-fuel-benchmark.mjs';
test('weekly fuel data retains report date and never becomes station pricing',()=>{
  const xml='<title>Data For 09/21/26</title>On-Highway Diesel Fuel Retail Price<br>6.529 .. U.S.<br>6.268 ... East Coast<br>6.68 ... Midwest<br>6.177 ... Gulf Coast<br>6.34 ... Rocky Mountain<br>]]>';
  const result=parseDieselRss(xml,'2026-09-28T00:00:00Z');
  assert.equal(result.asOf,'2026-09-21');assert.equal(result.regions[0].priceUsdPerGallon,6.529);assert.equal(result.kind,'WEEKLY_REGIONAL_DIESEL_AVERAGE');
  assert.throws(()=>parseDieselRss('<rss>bad</rss>'),/format changed/);
});
