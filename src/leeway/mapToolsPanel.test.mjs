import test from 'node:test';
import assert from 'node:assert/strict';
import { mountMapToolsPanel } from './mapToolsPanel.js';

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.hidden = false;
    const classes = new Set(); this.classList = {contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key)}; }
  setAttribute(key,value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  prepend(node) { this.insertBefore(node,this.children[0]); }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { node.remove(); this.children.push(node);node.parentNode=this;return node; }
  insertBefore(node,next) { node.remove();const index=this.children.indexOf(next);this.children.splice(index<0?this.children.length:index,0,node);node.parentNode=this; }
  remove() { if(this.parentNode){const list=this.parentNode.children;list.splice(list.indexOf(this),1);this.parentNode=null;} }
  get nextSibling() { const list=this.parentNode?.children||[];return list[list.indexOf(this)+1]||null; }
  querySelector(selector) { return this.selectors?.[selector] || null; }
  click() { this.onclick?.(); }
  focus() { this.focused=true; }
}
function setup() {
 const head=new Node(),body=new Node(),dock=new Node(),shell=new Node();shell.selectors={'.lws-dock':dock};
 const panels = {},parents=[];
 for(const [id,selector] of [['control-panel','#control-panel-toggle'],['data-panel','[data-collapse-target="data-panel"]'],['scene-panel','[data-collapse-target="scene-panel"]'],['pp-toggles','[data-collapse-target="pp-toggles"]']]) {
   const parent=new Node(),panel=new Node(),following=new Node();panel.id=id;panel.classList.add('collapsed');
   const toggle=new Node('button');toggle.onclick=()=>panel.classList.contains('collapsed')?panel.classList.remove('collapsed'):panel.classList.add('collapsed');panel.selectors={[selector]:toggle};
   panel.appendChild(toggle);parent.append(panel,following);parents.push({parent,panel,following});panels[id]=panel;
 }
 body.classList = {add(){assert.fail('host mode changed');},remove(){assert.fail('host mode changed');},toggle(){assert.fail('host mode changed');}};
 const doc={head,body,createElement:tag=>new Node(tag),getElementById:id=>panels[id]};
 return {panels,parents,dock,doc,shell};
}
test('settings reuses actual controls and their listeners without changing the workspace mode',()=>{
 const h=setup();let clicks=0;const originalButton=new Node('button');originalButton.onclick=()=>clicks++;
 h.panels['control-panel'].appendChild(originalButton);
 const settings=mountMapToolsPanel({shell:h.shell,documentRef:h.doc});
 assert.equal(h.dock.children[0].textContent,'Map display');settings.open('views');originalButton.click();assert.equal(clicks,1);
 assert.equal(h.panels['pp-toggles'].parentNode.id,'map-tools-views');assert.equal(h.panels['pp-toggles'].classList.contains('collapsed'),false);
 assert.equal(h.panels['control-panel'].parentNode.id,'map-tools-views');assert.equal(h.panels['control-panel'].classList.contains('collapsed'),false);
 settings.open('layers');assert.equal(h.panels['data-panel'].parentNode.hidden,false);assert.equal(h.panels['control-panel'].parentNode.hidden,true);
 settings.close();assert.equal(settings.root.hidden,true);settings.destroy();
 for(const {parent,panel,following} of h.parents){assert.equal(parent.children[0],panel);assert.equal(parent.children[1],following);assert.equal(panel.classList.contains('collapsed'),true);}
 assert.equal(h.dock.children.length,0);assert.equal(h.doc.head.children.length,0);
 originalButton.click();assert.equal(clicks,2);
});
test('tab keyboard navigation and escape preserve normal map shell',()=>{
 const h=setup(),settings=mountMapToolsPanel({shell:h.shell,documentRef:h.doc});settings.open('views');
 const tabs=settings.root.children[1].children;let prevented=false;
 settings.root.onkeydown({key:'ArrowRight',target:tabs[0],preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(tabs[1].getAttribute('aria-selected'),'true');assert.equal(tabs[1].focused,true);
 settings.root.onkeydown({key:'Escape',target:tabs[1],stopPropagation(){}});assert.equal(settings.root.hidden,true);
 assert.equal(h.dock.children[0].focused,true);settings.destroy();
});

test('rendering quality provides an explicit full-resolution opt out',()=>{
 const h=setup(), events=[];h.doc.dispatchEvent=event=>events.push(event);
 const settings=mountMapToolsPanel({shell:h.shell,documentRef:h.doc});
 const label=h.panels['control-panel'].parentNode.children[0],select=label.children[0];
 assert.equal(select.getAttribute('aria-label'),'Rendering quality');
 assert.deepEqual(select.children.map(option=>option.value),['auto','full']);
 select.value='full';select.onchange();assert.equal(events[0].type,'leeway:render-quality');assert.deepEqual(events[0].detail,{mode:'full'});settings.destroy();
});

test('optional launcher keeps the personal dock clean',()=>{
 const h=setup();
 const settings=mountMapToolsPanel({shell:h.shell,documentRef:h.doc,addLauncher:false});
 assert.equal(h.dock.children.length,0);
 settings.open('views');
 assert.equal(settings.root.hidden,false);
 settings.close();
 settings.destroy();
 assert.equal(h.dock.children.length,0);
});
