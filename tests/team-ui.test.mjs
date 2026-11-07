import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountTeam} from '../operation/team.mjs';
const root=()=>({isConnected:true,innerHTML:'',events:{},addEventListener(name,fn){this.events[name]=fn;}});
test('interface de equipe nao solicita lista administrativa para funcionario',async()=>{
 const r=root(),calls=[];
 await mountTeam(r,{companyId:'A',owner:false,branchList:[],request:async(path,input)=>{calls.push(input.action);return {result:[]};}});
 assert.deepEqual(calls,['incoming']);assert(!r.innerHTML.includes('team-invite'));assert(!r.innerHTML.includes('Salvar acesso'));
});
test('interface escapa convites e separa formularios de acesso protegido',async()=>{
 const r=root();
 await mountTeam(r,{companyId:'A',owner:true,branchList:[],request:async(path,input)=>({result:input.action==='incoming'?[{id:'x',company_id:'A',company_name:'<img src=x>',role:'driver',expires_at:'2026-11-10T00:00:00Z'}]:{members:[{id:'owner',email:'<script>',role:'owner',active:true,branch_ids:[]}],invites:[]}})});
 assert(r.innerHTML.includes('&lt;img src=x&gt;'));assert(r.innerHTML.includes('&lt;script&gt;'));assert(!r.innerHTML.includes('data-member="owner"'));assert(r.innerHTML.includes('team-invite'));assert(r.innerHTML.includes('Não há envio automático'));
});
test('falha da migration nao libera acesso ficticio',async()=>{
 const r=root();await mountTeam(r,{owner:true,request:async()=>{throw Error('SQL PRIVATE');}});
 assert(r.innerHTML.includes('Equipe indisponível'));assert(!r.innerHTML.includes('SQL PRIVATE'));assert(!r.innerHTML.includes('team-invite'));
});
