// Prototype contracts only. Client-side checks are not real authentication.
import {demoCompany,branches} from './domain.mjs';
function text(value,max=120){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('Confira os campos obrigatórios e seus limites.');return value.trim();}
function at(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Data inválida.');return new Date(value).toISOString();}
export function moneyCents(value){
  if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/.test(value.trim()))throw new Error('Informe um valor válido com até duas casas decimais.');
  const cents=Math.round(Number(value.trim().replace(',','.'))*100);
  if(!Number.isSafeInteger(cents))throw new Error('Valor fora do limite.');return cents;
}
function identity(actor,company,branch,role){if(!actor||actor.companyId!==company||actor.role!==role||actor.active!==true||(role==='administrative'&&actor.branchId!==branch))throw new Error('Perfil fora do contexto demonstrativo.');}
function scope(quote,actor,role){if(!quote)throw new Error('Cotação indisponível.');identity(actor,quote.companyId,quote.branchId,role);if(role==='client'&&quote.clientId!==actor.clientId)throw new Error('Cotação de outro cliente.');}
function history(quote,actor,when,event,detail){const now=at(when);if(quote.history.length&&Date.parse(now)<Date.parse(quote.history.at(-1).at))throw new Error('Horário anterior ao último evento.');return [...quote.history,{event,at:now,actorId:actor.id,role:actor.role,detail}];}
export function requestQuote(input,actor){
  if(input.companyId!==demoCompany||!branches.includes(input.branchId))throw new Error('Transportadora ou unidade inválida.');
  identity(actor,input.companyId,input.branchId,'client');
  const volumes=Number(input.volumes),weightKg=Number(input.weightKg);
  if(!Number.isInteger(volumes)||volumes<1||volumes>100000||!Number.isFinite(weightKg)||weightKg<=0||weightKg>1000000)throw new Error('Informe volumes inteiros e peso positivo dentro dos limites.');
  const quote={id:text(input.id,80),code:text(input.code,40),companyId:input.companyId,branchId:input.branchId,clientId:text(actor.clientId,80),clientName:text(actor.name,100),origin:text(input.origin),destination:text(input.destination),description:text(input.description,400),volumes,weightKg,goodsValueCents:moneyCents(input.goodsValue),status:'requested',createdAt:at(input.at),proposal:null,history:[]};
  quote.history=history(quote,actor,input.at,'requested','Solicitação fictícia de cotação');return quote;
}
export function proposeQuote(quote,input,actor){
  scope(quote,actor,'administrative');if(quote.status!=='requested')throw new Error('A cotação já recebeu uma proposta ou foi encerrada.');
  const freightCents=moneyCents(input.freight),days=Number(input.estimatedDays),validUntil=at(input.validUntil),now=at(input.at);
  if(freightCents<=0||!Number.isInteger(days)||days<1||days>365||Date.parse(validUntil)<=Date.parse(now))throw new Error('Informe frete positivo, prazo estimado de 1 a 365 dias e validade futura.');
  const proposal={freightCents,currency:'BRL',estimatedDays:days,validUntil,terms:text(input.terms,500),source:'Valor manual informado pela transportadora — demonstração'};
  return {...quote,status:'proposed',proposal,history:history(quote,actor,now,'proposed','Proposta manual fictícia registrada')};
}
export function respondQuote(quote,input,actor){
  scope(quote,actor,'client');if(quote.status!=='proposed'||!quote.proposal)throw new Error('Não há proposta disponível para resposta.');
  if(!['accepted','declined'].includes(input.decision))throw new Error('Resposta inválida.');
  const now=at(input.at);if(Date.parse(now)>=Date.parse(quote.proposal.validUntil))throw new Error('A validade da proposta terminou. Solicite nova análise.');
  return {...quote,status:input.decision,history:history(quote,actor,now,input.decision,'Resposta fictícia do cliente; não gera coleta ou cobrança')};
}
export function quoteStatus(quote,now){return quote.status==='proposed'&&quote.proposal&&Date.parse(at(now))>=Date.parse(quote.proposal.validUntil)?'expired':quote.status;}
export function visibleQuotes(quotes,actor,branch='all'){
  if(!actor||actor.active!==true||!['client','administrative'].includes(actor.role))return [];
  return quotes.filter(q=>q.companyId===actor.companyId&&(branch==='all'||q.branchId===branch)&&(actor.role==='client'?q.clientId===actor.clientId:q.branchId===actor.branchId));
}
export const saasDraft=Object.freeze({billingCycle:'monthly',payer:'transport_company',currency:'BRL',monthlyPriceCents:null,planId:null,status:'not_configured',automaticCharging:false});
