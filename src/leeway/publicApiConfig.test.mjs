import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicWorldApiConfig as config} from './publicApiConfig.js';
test('Pages never directs a viewer to loopback or insecure API',()=>{
 for(const value of ['http://127.0.0.1:4173','https://localhost:4000','http://example.com','https://user:pass@example.com','broken']) assert.equal(config(value,'4citeb4u.github.io').state,'invalid');
 assert.equal(config('','4citeb4u.github.io').state,'missing');
 assert.equal(config('https://world.example.com/','4citeb4u.github.io').base,'https://world.example.com');
 assert.equal(config('','maps.vercel.app').state,'same-origin');
});
