import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOperations,mountOverview} from '../operation/overview.mjs';
const order=(id,status,extra={})=>({id,company_id:'a',branch_id:'b',status,volumes:2,...extra});
test('summary groups authoritative stages, deduplicates orders and ignores another company or branch',()=>{
  const orders=[order('1','pending'),order('1','pending'),order('2','in_progress'),order('3','collected'),order('4','received'),order('5','received'),order('6','received'),order('7','pending',{company_id:'foreign'}),order('8','pending',{branch_id:'other'})];
  const cargos=[{company_id:'a',branch_id:'b',order_id:'5',status:'shipped'},{company_id:'a',branch_id:'b',order_id:'6',status:'delivered'},{company_id:'foreign',branch_id:'b',order_id:'1',status:'delivered'}];
  const result=summarizeOperations({orders,cargos},'a','b');
  assert.equal(result.total,6);
  assert.deepEqual(result.counters,{pending:1,inProgress:1,collected:1,received:1,inTransit:1,delivered:1,other:0});
});
function root(){
  const elements={'[data-overview-body]':{innerHTML:''},'[data-overview-status]':{textContent:''},'[data-overview-refresh]':{disabled:false}};
  return {isConnected:true,innerHTML:'',events:{},elements,querySelector(selector){return elements[selector];},addEventListener(name,fn){this.events[name]=fn;}};
}
test('client overview never queries internal collections',async()=>{
  const r=root();let navigated;
  await mountOverview(r,{companyId:'a',membership:{role:'client'},branchList:[],request:async()=>{throw Error('Must not query');},onNavigate:id=>navigated=id});
  assert(r.innerHTML.includes('Acompanhe suas cargas'));
  r.events.click({target:{closest:()=>true}});assert.equal(navigated,'relations');
});
test('dashboard escapes labels, shows scope limits and clears data when authorization is revoked',async()=>{
  const r=root();let denied=false;
  await mountOverview(r,{companyId:'a',membership:{role:'owner'},branchList:[{id:'b',active:true,name:'<script>bad</script>'}],onNavigate:()=>{},request:async()=>{
    if(denied){const error=Error('denied');error.status=403;throw error;}
    return {result:{orders:[order('<img>','pending')],cargos:[]}};
  }});
  const body=r.elements['[data-overview-body]'];assert(body.innerHTML.includes('&lt;script&gt;'));assert(!body.innerHTML.includes('<script>'));assert(body.innerHTML.includes('100 ordens'));
  denied=true;r.events.click({target:{closest:selector=>selector==='[data-overview-refresh]'}});
  await new Promise(setImmediate);
  assert.equal(body.innerHTML,'');assert(r.elements['[data-overview-status]'].textContent.includes('indisponível'));
});
test('network failure preserves the prior summary with a visible stale warning',async()=>{
  const r=root();let failed=false;
  await mountOverview(r,{companyId:'a',membership:{role:'driver'},branchList:[],onNavigate:()=>{},request:async()=>{
    if(failed)throw Error('network');return {result:{orders:[order('1','assigned')],cargos:[]}};
  }});
  const before=r.elements['[data-overview-body]'].innerHTML;failed=true;
  r.events.click({target:{closest:selector=>selector==='[data-overview-refresh]'}});await new Promise(setImmediate);
  assert.equal(r.elements['[data-overview-body]'].innerHTML,before);assert(r.elements['[data-overview-status]'].textContent.includes('desatualizado'));
});

test('Hoje links open the exact assignment or receiving record without inferring a business action',async()=>{
  const r=root(),navigations=[];
  await mountOverview(r,{companyId:'a',membership:{role:'owner'},branchList:[],request:async()=>({result:{orders:[order('assign-me','pending'),order('receive-me','collected')],cargos:[]}}),onNavigate:(...args)=>navigations.push(args)});
  const html=r.elements['[data-overview-body]'].innerHTML;
  assert(html.includes('data-overview-order="assign-me" data-overview-task="collections"'));
  assert(html.includes('data-overview-order="receive-me" data-overview-task="receiving"'));
  for(const [id,task] of [['assign-me','collections'],['receive-me','receiving']])r.events.click({target:{closest:selector=>selector==='[data-overview-order]'?{dataset:{overviewOrder:id,overviewTask:task}}:null}});
  assert.deepEqual(navigations,[['collections',{orderId:'assign-me'}],['receiving',{orderId:'receive-me'}]]);
});
