import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountCollections} from '../operation/collections.mjs';
const id='00000000-0000-4000-8000-000000000001';
const root=()=>({isConnected:true,innerHTML:'',addEventListener(){},querySelector(){return null;}});
const base={companyId:id,branchList:[{id,name:'Filial',active:true}],customers:[],vehicles:[],request:async()=>({result:{orders:[],cargos:[],events:[],workers:[]}})};
test('motorista ve apenas acoes sequenciais proprias e nao confirma recebimento',async()=>{
 const r=root();await mountCollections(r,{...base,membership:{id,role:'driver'},request:async()=>({result:{orders:[{id,branch_id:id,status:'assigned',assignee_id:id,version:2,volumes:2,pickup_address:'<img>',destination:'Destino'}],cargos:[],events:[],workers:[]}})});
 assert(r.innerHTML.includes('Aceitar coleta'));assert(!r.innerHTML.includes('Nova ordem'));assert(!r.innerHTML.includes('Confirmar recebimento na central'));assert(r.innerHTML.includes('&lt;img&gt;'));assert(!r.innerHTML.includes('Iniciar coleta'));
});
test('central recebe somente coleta confirmada e nao antecipa entrega',async()=>{
 const r=root();await mountCollections(r,{...base,membership:{id,role:'owner'},request:async()=>({result:{orders:[{id,branch_id:id,status:'collected',assignee_id:'driver',version:5,volumes:2,pickup_address:'Rua',destination:'Destino'}],cargos:[],events:[],workers:[]}})});
 assert(r.innerHTML.includes('Confirmar recebimento na central'));assert(!r.innerHTML.includes('Confirmar: Entrega'));assert(!r.innerHTML.includes('Liberar atribuição'));
});
test('migration indisponivel nao faz fallback para dados demonstrativos',async()=>{
 const r=root();await mountCollections(r,{...base,membership:{role:'owner'},request:async()=>{throw Error('SQL PRIVATE');}});
 assert(r.innerHTML.includes('Coletas indisponíveis'));assert(!r.innerHTML.includes('SQL PRIVATE'));assert(!r.innerHTML.includes('Nova ordem'));
});
