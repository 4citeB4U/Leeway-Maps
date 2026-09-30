import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {test} from 'node:test';
import {agentLeeTools} from './agentLeeTools.js';
test('Maps is independent and excludes business stores and tools',async()=>{
 const root=new URL('../../',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('public/manifest.webmanifest',root),'utf8'));
 assert.equal(manifest.name,'LeeWay Maps'); assert.equal(manifest.scope,'./'); assert.equal(manifest.start_url,'./');
 for(const file of ['src/leeway/enterpriseStore.js','src/leeway/enterpriseWorkspace.js','src/leeway/onboardingRequirements.js','personal/index.html']) await assert.rejects(access(new URL(file,root)),{code:'ENOENT'});
 assert.ok(!agentLeeTools().some(t=>/enterprise|onboarding|dispatch/.test(t.function.name)));
 const shell=await readFile(new URL('src/leeway/mapsShell.js',root),'utf8'); assert.doesNotMatch(shell,/readEnterpriseState|mountEnterpriseWorkspace/);
});
