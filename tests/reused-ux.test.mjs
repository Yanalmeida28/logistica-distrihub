import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';
import {filterPage,createNotifier} from '../operation/view-tools.mjs';
import {buildCollectionPdf} from '../operation/order-pdf.mjs';
import {mountCollections} from '../operation/collections.mjs';

test('search is accent insensitive, combines branch/status and clamps pagination',()=>{
  const rows=Array.from({length:25},(_,i)=>({id:i,name:'São Paulo '+i,branch_id:i%2?'a':'b',status:i%2?'pending':'received'}));
  const result=filterPage(rows,{term:'sao paulo',branch:'a',status:'pending',page:99},row=>row.name);
  assert.equal(result.total,12);assert.equal(result.page,2);assert.equal(result.rows.length,2);
  assert(result.rows.every(row=>row.branch_id==='a'&&row.status==='pending'));
  assert.equal(filterPage(rows,{term:'not found'},row=>row.name).total,0);
});

test('success floats for 5 seconds; replacement cancels previous timer and errors remain visible',()=>{
  const timers=new Map();let id=0;
  const element={dataset:{},setAttribute(k,v){this[k]=v;}};
  const notify=createNotifier(element,{setTimer:(fn,ms)=>{assert.equal(ms,5000);timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});
  notify('Coleta confirmada.');assert.equal(element.hidden,false);assert.equal(element.role,'status');
  notify('Outra confirmação');assert.equal(timers.size,1);
  timers.values().next().value();assert.equal(element.hidden,true);
  notify('Acesso negado',{error:true});assert.equal(element.hidden,false);assert.equal(element.role,'alert');assert.equal(timers.size,0);
});

test('collection PDF is a real multipage document and rejects another company',()=>{
  const order={id:'os-1',company_id:'company-a',pickup_address:'Endereço de coleta '.repeat(1000),destination:'Destino',volumes:3};
  assert.throws(()=>buildCollectionPdf(order,{companyId:'company-b'},jsPDF),/empresa/);
  const {pdf,filename}=buildCollectionPdf(order,{companyId:'company-a',companyName:'Transportadora',branchName:'Centro',customerName:'Cliente'},jsPDF);
  assert.equal(filename,'ordem-coleta-os-1.pdf');assert(pdf.getNumberOfPages()>1);
  assert(Buffer.from(pdf.output('arraybuffer')).toString().startsWith('%PDF-'));
});

test('unchanged refresh does not rebuild collection forms and local search does not request more data',async()=>{
  let markup='',writes=0,calls=0,task;
  const root={isConnected:true,events:{},querySelector(){return null;},addEventListener(name,fn){this.events[name]=fn;},
    get innerHTML(){return markup;},set innerHTML(value){markup=value;writes++;}};
  const data={orders:[{id:'one',company_id:'a',branch_id:'branch',pickup_address:'Rua A',destination:'Destino',status:'pending',version:1,volumes:1}],cargos:[],workers:[],events:[]};
  await mountCollections(root,{companyId:'a',companyName:'A',membership:{role:'driver'},branchList:[],customers:[],vehicles:[],
    request:async()=>{calls++;return {result:data};},run:fn=>{task=fn();}});
  const initial=writes;
  root.events.click({target:{closest:selector=>selector==='[data-refresh-collections]'?{}:null}});await task;
  assert.equal(writes,initial);assert.equal(calls,2);
  root.events.input({target:{value:'inexistente',matches:selector=>selector==='[data-collection-search]'}});
  await Promise.resolve();
  assert.equal(calls,2);assert(!markup.includes('data-order-card="one"'));
});
