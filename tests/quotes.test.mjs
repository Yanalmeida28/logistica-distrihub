import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestQuote,proposeQuote,respondQuote,visibleQuotes,quoteStatus,moneyCents,saasDraft} from '../app/quotes-domain.mjs';
import {demoCompany} from '../app/domain.mjs';
const client={id:'profile',clientId:'client-1',companyId:demoCompany,role:'client',active:true,name:'Cliente fictício'};
const admin={id:'admin',companyId:demoCompany,branchId:'unidade-a',role:'administrative',active:true};
const input={id:'quote-1',code:'COT-TESTE',companyId:demoCompany,branchId:'unidade-a',origin:'Origem fictícia',destination:'Destino fictício',description:'Volumes fictícios',volumes:2,weightKg:4,goodsValue:'100,00',at:'2026-11-06T12:00:00Z'};
const proposal={freight:'25,90',estimatedDays:3,validUntil:'2026-11-07T12:00:00Z',terms:'Condições de teste',at:input.at};
test('solicitação não inventa tarifa; só administrativo propõe valor manual',()=>{
  const q=requestQuote(input,client);assert.equal(q.status,'requested');assert.equal(q.proposal,null);assert.equal(q.goodsValueCents,10000);
  assert.throws(()=>proposeQuote(q,proposal,client));const p=proposeQuote(q,proposal,admin);assert.equal(p.proposal.freightCents,2590);assert.equal(q.proposal,null);
});
test('cliente aceita só sua proposta válida; aceite não cria coleta ou pagamento',()=>{
  const p=proposeQuote(requestQuote(input,client),proposal,admin),a=respondQuote(p,{decision:'accepted',at:input.at},client);
  assert.equal(a.status,'accepted');assert.equal(a.history.length,3);assert.equal(a.cargoId,undefined);assert.equal(a.paymentId,undefined);
  assert.throws(()=>respondQuote(a,{decision:'accepted',at:input.at},client));assert.throws(()=>respondQuote(p,{decision:'accepted',at:input.at},admin));
});
test('empresa, cliente, unidade e perfil inativo não atravessam contexto',()=>{
  const q=requestQuote(input,client),p=proposeQuote(q,proposal,admin);
  for(const wrong of [{...admin,companyId:'outra'},{...admin,branchId:'unidade-b'},{...admin,active:false}])assert.throws(()=>proposeQuote(q,proposal,wrong));
  for(const wrong of [{...client,clientId:'outro'},{...client,companyId:'outra'},{...client,active:false}]){assert.throws(()=>respondQuote(p,{decision:'declined',at:input.at},wrong));assert.equal(visibleQuotes([p],wrong).length,0);}
  assert.equal(visibleQuotes([q],client,'unidade-b').length,0);
});
test('proposta expirada não pode ser aceita nem recusada como válida',()=>{
  const p=proposeQuote(requestQuote(input,client),proposal,admin),at='2026-11-07T12:00:00Z';assert.equal(quoteStatus(p,at),'expired');
  assert.throws(()=>respondQuote(p,{decision:'accepted',at},client));assert.throws(()=>proposeQuote(requestQuote(input,client),{...proposal,validUntil:input.at},admin));
});
test('valores inválidos, negativos, zero para frete e precisão excessiva são rejeitados',()=>{
  for(const value of ['-1','NaN','Infinity','1.001','1e3','', '9999999999'])assert.throws(()=>moneyCents(value));
  for(const patch of [{volumes:0},{volumes:1.5},{weightKg:-1},{weightKg:Infinity},{goodsValue:'-1'},{origin:''}])assert.throws(()=>requestQuote({...input,...patch},client));
  for(const patch of [{freight:'0'},{freight:'1,234'},{estimatedDays:0},{estimatedDays:1.5},{terms:''}])assert.throws(()=>proposeQuote(requestQuote(input,client),{...proposal,...patch},admin));
});
test('assinatura pertence à transportadora e permanece sem preço ou cobrança',()=>{
  assert.equal(saasDraft.payer,'transport_company');assert.equal(saasDraft.billingCycle,'monthly');assert.equal(saasDraft.monthlyPriceCents,null);assert.equal(saasDraft.planId,null);assert.equal(saasDraft.automaticCharging,false);
});
