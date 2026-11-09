import {test} from 'node:test';
import assert from 'node:assert/strict';
import {administrativeSections,mountAdministrativeArea} from '../operation/admin-area.mjs';

// Minimal DOM transport: verifies movement/identity and navigation, not layout.
class Node {
  constructor(doc){this.ownerDocument=doc;this.dataset={};this.children=[];this.attributes={};this.hidden=false;this.classList={add(){},remove(){}};}
  append(node){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);node.parent=this;this.children.push(node);}
  get firstChild(){return this.children[0];}
  set innerHTML(value){this.children=[];for(const [,id] of value.matchAll(/data-admin-go="([^"]+)"/g)){const button=new Node(this.ownerDocument);button.dataset.adminGo=id;this.append(button);}}
  querySelectorAll(selector){const match=selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);if(!match)throw Error(selector);const key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.children.flatMap(child=>[...(Object.hasOwn(child.dataset,key)&&(match[2]===undefined||child.dataset[key]===match[2])?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  addEventListener(){}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];}
  focus(){this.focused=true;}
}

test('reserved area rejects ordinary roles and preserves owner-only permission management contract',()=>{
  for(const role of ['driver','collector','client',null])assert.deepEqual(administrativeSections(role),[]);
  assert(administrativeSections('owner').some(([id,label])=>id==='team'&&label==='Equipe e convites'));
  assert(administrativeSections('administrative').some(([id,label])=>id==='team'&&label==='Meus convites'));
  assert.equal(mountAdministrativeArea({querySelector:()=>null},{role:'client'}),null);
});

test('administration moves real modules and preserves drafts while nested navigation stays inside reserved area',()=>{
  const doc={createElement:()=>new Node(doc)},panels=new Node(doc),host=new Node(doc),summary=new Node(doc);
  host.dataset.operationPanel='administrative';host.append(summary);panels.append(host);
  const customers=new Node(doc);customers.dataset.operationPanel='customers';customers.draft='Unsaved customer';panels.append(customers);
  const settings=new Node(doc);settings.dataset.operationPanel='settings';panels.append(settings);
  let busy=true,selected;
  const area=mountAdministrativeArea(panels,{role:'owner',selected:'home',canNavigate:()=>!busy,onSelect:id=>selected=id});
  assert.equal(customers.hidden,true);assert.equal(settings.hidden,true);assert.equal(summary.parent.dataset.adminView,'home');
  assert.equal(customers.dataset.operationPanel,undefined);assert.equal(customers.parent.parent,host);
  assert.equal(area.select('customers'),false);busy=false;
  assert.equal(area.select('customers'),true);assert.equal(selected,'customers');assert.equal(customers.hidden,false);
  assert.equal(area.select('settings'),true);assert.equal(customers.hidden,true);
  area.select('customers');assert.equal(customers.draft,'Unsaved customer');assert.equal(customers.focused,true);
  assert.equal(area.select('unknown'),false);assert.equal(customers.hidden,false);
});
