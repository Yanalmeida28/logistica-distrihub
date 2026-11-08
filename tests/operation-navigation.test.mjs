import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationTabs,selectOperationPanel} from '../operation/navigation.mjs';

test('navigation preserves invitation acceptance before company creation and limits internal modules by role',()=>{
  assert.deepEqual(operationTabs(null,false).map(([id])=>id),['overview','team']);
  const owner=operationTabs('owner',true).map(([id])=>id);
  for(const id of ['branches','customers','vehicles','team','collections','relations','chat'])assert(owner.includes(id));
  for(const role of ['client',null]){
    const tabs=operationTabs(role,true).map(([id])=>id);
    assert(!tabs.includes('collections'));assert(!tabs.includes('chat'));assert(tabs.includes('relations'));
  }
  assert(operationTabs('driver',true).some(([id])=>id==='collections'));
});

test('switching panels preserves nodes and drafts, updates current navigation and rejects unknown panels',()=>{
  const panels=['overview','customers'].map(id=>({id,hidden:false,draft:'Unsaved value'}));
  const buttons=panels.map(({id})=>({id,attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}}));
  const layout={
    querySelector(selector){const id=selector.match(/="([^"]+)"/)[1];return (selector.includes('operation-panel')?panels:buttons).find(item=>item.id===id);},
    querySelectorAll(selector){return selector.includes('operation-panel')?panels:buttons;},
  };
  const customerPanel=panels[1];
  assert.equal(selectOperationPanel(layout,'customers'),true);
  assert.equal(panels[0].hidden,true);assert.equal(panels[1].hidden,false);
  assert.equal(buttons[1].attributes['aria-current'],'page');
  selectOperationPanel(layout,'overview');selectOperationPanel(layout,'customers');
  assert.equal(panels[1],customerPanel);assert.equal(panels[1].draft,'Unsaved value');
  assert.equal(buttons[0].attributes['aria-current'],undefined);
  assert.equal(selectOperationPanel(layout,'unavailable'),false);assert.equal(panels[1].hidden,false);
});
