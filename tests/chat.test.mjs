import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatContacts,sendInternalMessage,conversation} from '../app/chat-domain.mjs';
const admin={id:'central',name:'Central exemplo',companyId:'demo',branchId:'a',role:'administrative',active:true};
const staff={id:'coletor',name:'Coletor exemplo',companyId:'demo',branchId:'a',role:'collector',active:true};
const input={id:'m',body:'Mensagem fictícia',at:'2026-11-06T12:00:00Z'};
test('central e coletor veem os dois lados da mesma conversa',()=>{
  const a=sendInternalMessage(input,admin,staff),b=sendInternalMessage({...input,id:'m2',body:'Confirmação fictícia'},staff,admin);
  assert.equal(conversation([a,b],admin,staff).length,2);assert.equal(conversation([a,b],staff,admin).length,2);assert.equal(a.senderId,'central');
});
test('outra empresa/unidade, coletor diferente e inativo não acessam a conversa',()=>{
  const m=sendInternalMessage(input,admin,staff);
  for(const wrong of [{...staff,companyId:'outra'},{...staff,branchId:'b'},{...staff,active:false}]){assert.equal(chatContacts(admin,[wrong]).length,0);assert.equal(conversation([m],admin,wrong).length,0);assert.throws(()=>sendInternalMessage(input,admin,wrong));}
  assert.equal(conversation([m],admin,{...staff,id:'outro'}).length,0);assert.throws(()=>sendInternalMessage(input,staff,{...staff,id:'outro'}));
});
test('mensagem inválida e referência a carga de outro coletor são rejeitadas',()=>{
  for(const body of ['', ' '.repeat(3), 'a'.repeat(2001)])assert.throws(()=>sendInternalMessage({...input,body},admin,staff));
  const cargo={id:'c',companyId:'demo',branchId:'a',collectorId:'coletor'};assert.equal(sendInternalMessage({...input,cargoId:'c'},admin,staff,cargo).cargoId,'c');
  assert.throws(()=>sendInternalMessage({...input,cargoId:'c'},admin,staff,{...cargo,collectorId:'outro'}));assert.throws(()=>sendInternalMessage({...input,cargoId:'c'},admin,staff));
});
