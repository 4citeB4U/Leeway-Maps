import test from 'node:test';
import assert from 'node:assert/strict';
import { createEcosystemClient } from './leeway-ecosystem.js';
test('unconfigured deployment never contacts localhost', async()=>{
 const client=createEcosystemClient({env:{},fetchImpl:()=>assert.fail('unexpected fetch')});
 assert.equal((await client.status()).formula.status,'unconfigured');
 await assert.rejects(client.evaluate({},{}),/unavailable/);
});
test('diagnostic health preserves execution boundary and hides secrets',async()=>{
 const client=createEcosystemClient({env:{LEEWAY_FORMULA_BASE_URL:'https://authority.example',LEEWAY_FORMULA_TOKEN:'private'},fetchImpl:async(url,init)=>{
 assert.equal(init.headers.authorization,'Bearer private'); assert.equal(init.redirect,'error');
 return Response.json({formula:'LEEWAY-FORMULA-v1.0',status:'LEEWAY_FORMULA_V1_PASS',goldenVectorPass:true,specValid:true,adapterRegistryPass:true});
 }});
 const status=await client.status();assert.equal(status.formula.status,'diagnostic-pass');assert.equal(status.formula.taskEvaluation,'NOT_EXECUTED'); assert.ok(!JSON.stringify(status).includes('private'));
});
