import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMapViewActions } from './mapViewControls.js';

test('cockpit activates original Contacts before entering the selected aircraft', async () => {
  const calls = [],
    target = { layerId: 'flights', id: 'abc123' };
  const actions = createMapViewActions({
    styleManager: {
      getAircraftTrackingTarget: () => target,
      setContextMode: async (mode) => {
        calls.push(['context', mode]);
        return { ok: true };
      },
      controlCockpit: (action, options) => {
        calls.push([action, options]);
        return { ok: true };
      },
    },
  });
  assert.equal((await actions.cockpit()).ok, true);
  assert.deepEqual(calls, [
    ['context', 'flights'],
    ['enter', { selectedTarget: target }],
  ]);
});
test('missing selection or failed Contacts cannot produce a half-entered cockpit', async () => {
  const absent = createMapViewActions({
    styleManager: {
      getAircraftTrackingTarget: () => null,
      controlCockpit: () => assert.fail(),
    },
  });
  assert.match((await absent.cockpit()).error, /Select an aircraft/);
  const failed = createMapViewActions({
    styleManager: {
      getAircraftTrackingTarget: () => ({ id: 'abc123' }),
      setContextMode: async () => ({ ok: false, error: 'Feed offline' }),
      controlCockpit: () => assert.fail(),
    },
  });
  assert.equal((await failed.cockpit()).error, 'Feed offline');
});
test('follow uses canonical tracked camera refocus; exit restores workspace', () => {
  const calls = [],
    target = { layerId: 'military', id: 'def456' };
  const actions = createMapViewActions({
    styleManager: {
      controlCockpit: (action) => calls.push(action),
      getAircraftTrackingTarget: () => target,
    },
    catalog: {
      get: (id) => {
        assert.equal(id, 'military');
        return {
          refocusTrackedById: (id, options) => {
            calls.push([id, options]);
            return true;
          },
        };
      },
    },
  });
  assert.equal(actions.follow().ok, true);
  actions.exit();
  assert.deepEqual(calls, [
    'exit',
    ['def456', { origin: 'user' }],
    'exit',
  ]);
});
test('cockpit button exits an active cockpit without requiring a new aircraft selection', async()=>{
 const calls=[];
 const actions=createMapViewActions({styleManager:{getCockpitState:()=>({active:true}),controlCockpit:action=>{calls.push(action);return {ok:true};}}});
 assert.equal((await actions.cockpit()).ok,true);assert.deepEqual(calls,['exit']);
 assert.equal(actions.advanced,undefined);
});

test('mount keeps workspace navigation present through cockpit and offers no separate mode', async t=>{
 const {mountMapViewControls}=await import('./mapViewControls.js');
 t.mock.timers.enable({apis:['setInterval']});
 const nodes=[];
 function element(tag){
  const classes=new Set();
  const node={tag,children:[],attributes:{},textContent:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
   append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},setAttribute(k,v){this.attributes[k]=v;},remove(){this.removed=true;}};
  nodes.push(node);return node;
 }
 const body=element('body'),head=element('head'),dock=element('nav');
 body.classList.add('leeway-gods-eye');
 let active=false;
 const styleManager={getCockpitState:()=>({active}),getAircraftTrackingTarget:()=>null};
 const events=new EventTarget();
 const mounted=mountMapViewControls({application:{getComponents:()=>({controls:{styleManager},data:{catalog:new Map()}})},shell:{querySelector:()=>dock},documentRef:{body,head,createElement:element},eventTarget:events});
 assert.equal(body.classList.contains('leeway-enterprise-shell'),true);
 assert.equal(body.classList.contains('leeway-gods-eye'),false);
 assert.deepEqual(dock.children.map(n=>n.textContent),['Cockpit']);
 active=true;events.dispatchEvent(new Event('gev:cockpit-mode-changed'));
 assert.equal(body.classList.contains('leeway-enterprise-shell'),true);
 assert.equal(dock.children[0].textContent,'Exit cockpit');
 assert.equal(dock.children[0].attributes['aria-pressed'],'true');
 assert.ok(!head.children[0].textContent.includes('#leeway-world-shell'));
 assert.ok(!nodes.some(n=>/God.s Eye|Back to map workspace/.test(n.textContent)));
 mounted.destroy();assert.equal(body.classList.contains('leeway-enterprise-shell'),true);
 assert.ok(dock.children[0].removed);
});


test('an available state accessor returning undefined does not break cockpit selection',async()=>{
 const actions=createMapViewActions({styleManager:{getCockpitState:()=>undefined,getAircraftTrackingTarget:()=>null}});
 assert.match((await actions.cockpit()).error,/Select an aircraft/);
});
