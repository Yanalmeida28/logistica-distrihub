import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationTabs,operationPanelId} from '../operation/navigation.mjs';
import {taskRows} from '../operation/task-data.mjs';
import {mountCollections} from '../operation/collections.mjs';
const order=(id,status,extra={})=>({id,company_id:'a',branch_id:'b',status,assignee_id:'worker',version:1,volumes:1,...extra});
const data={orders:[order('new','pending'),order('own','assigned'),order('confirmed','collected'),order('cargo','received'),order('foreign','pending',{company_id:'other'})],cargos:[{company_id:'a',branch_id:'b',order_id:'cargo',status:'shipped'},{company_id:'other',branch_id:'b',order_id:'confirmed',status:'delivered'}],workers:[],events:[]};

test('menus prioritize tasks by role; operational routes reuse one collections panel',()=>{
  for(const role of ['owner','administrative'])assert.deepEqual(operationTabs(role,true).map(([,label])=>label),['Hoje','Coletas','Alocação e motoristas','Recebimento','Cargas','Ocorrências e pendências','Cotações','Financeiro','Faturamento','Despesas','Gestão','Portal e documentos','Chat da central']);
  for(const role of ['driver','collector'])assert.deepEqual(operationTabs(role,true)[0],['collections','Minhas coletas']);
  assert.deepEqual(operationTabs('client',true)[0],['relations','Minhas cargas']);
  for(const task of ['collections','receiving'])assert.equal(operationPanelId(task),'collections');
});
test('task queues use confirmed stages and matching company/cargo; no invented pendencies',()=>{
  const ids=task=>taskRows(data,'a',task,{role:'owner'}).map(o=>o.id);
  assert.deepEqual(ids('collections'),['new','own']);assert.deepEqual(ids('receiving'),['confirmed']);assert.deepEqual(ids('cargos'),['cargo']);assert.deepEqual(ids('pending'),[]);assert.equal(operationPanelId('pending'),'pending');
  assert.equal(taskRows(data,'a','cargos',{role:'administrative'})[0].status,'shipped');
  assert.deepEqual(taskRows(data,'a','receiving',{role:'driver',id:'worker'}),[]);
  assert.deepEqual(taskRows(data,'a','collections',{role:'client'}),[]);
  assert.deepEqual(taskRows(data,'a','collections',{role:'collector',id:'someone-else'}),[]);
});
test('record deep link and return keep list filters; task switching does not query again or submit writes',async()=>{
  const calls=[];const root={innerHTML:'',isConnected:true,events:{},querySelector(){return null;},addEventListener(name,fn){this.events[name]=fn;}};
  const controller=await mountCollections(root,{companyId:'a',membership:{role:'owner'},branchList:[],customers:[],vehicles:[],request:async(path,payload)=>{calls.push({path,action:payload.action});return path==='pickup-addresses'?{records:[]}:{result:data};}});
  await controller.setTask('receiving',{orderId:'confirmed'});
  assert(root.innerHTML.includes('data-collection-back'));assert(root.innerHTML.includes('data-order-card="confirmed"'));assert(!root.innerHTML.includes('data-order-card="new"'));
  root.events.click({target:{closest:selector=>selector==='[data-collection-back]'?{}:null}});await new Promise(setImmediate);
  assert(!root.innerHTML.includes('data-collection-back'));assert(root.innerHTML.includes('data-order-card="confirmed"'));
  assert.equal(await controller.setTask('cargos'),false);assert(!root.innerHTML.includes('data-collection="advance"'));
  await controller.setTask('receiving',{orderId:'outside-window'});assert(root.innerHTML.includes('Registro fora deste recorte ou sem acesso'));assert.deepEqual(calls,[{path:'collections',action:'list'},{path:'pickup-addresses',action:'list'},{path:'destination-addresses',action:'list'}]);
});
