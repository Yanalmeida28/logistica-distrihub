import {demoCompany,branches} from './domain.mjs';
import {moneyCents} from './quotes-domain.mjs';
export const expenseCategories={food:'Alimentação',fuel:'Combustível',toll:'Pedágio',maintenance:'Manutenção',staff:'Pessoal',office:'Administrativo',other:'Outras despesas'};
export const incomeCategories={freight:'Frete',other:'Outras receitas'};
const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error('Preencha os campos obrigatórios dentro dos limites.');return v.trim();};
export function day(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw new Error('Data inválida.');return v;}
export function localDay(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
function authorize(actor,company,branch){if(!actor||actor.active!==true||actor.companyId!==company||actor.role!=='administrative'||(actor.branchId!==branch&&actor.canAccessAllBranches!==true))throw new Error('Lançamento fora do contexto administrativo de teste.');}
export function paid(account){return account.payments.reduce((sum,p)=>sum+p.amountCents,0);}
export function balance(account){return account.status==='cancelled'?0:account.amountCents-paid(account);}
export function accountState(account,today){day(today);if(account.status==='cancelled')return 'cancelled';if(balance(account)===0)return 'settled';if(account.dueDate<today)return 'overdue';return paid(account)>0?'partial':'open';}
export function createAccount(input,actor){
  if(input.companyId!==demoCompany||!branches.includes(input.branchId)||!['income','expense'].includes(input.type))throw new Error('Tipo, empresa ou unidade inválidos.');
  authorize(actor,input.companyId,input.branchId);
  const categories=input.type==='expense'?expenseCategories:incomeCategories;
  if(!Object.hasOwn(categories,input.category))throw new Error('Categoria inválida.');
  const amountCents=moneyCents(input.amount);if(amountCents<=0)throw new Error('O valor precisa ser maior que zero.');
  const issuedDate=day(input.issuedDate),dueDate=day(input.dueDate);if(dueDate<issuedDate||issuedDate>localDay())throw new Error('Confira a data de registro e o vencimento. Registro futuro não é permitido.');
  return {id:text(input.id,80),code:text(input.code,40),companyId:input.companyId,branchId:input.branchId,type:input.type,category:input.category,
    description:text(input.description,300),party:text(input.party,100),amountCents,issuedDate,dueDate,status:'open',payments:[],
    history:[{action:'created',actorId:actor.id,date:issuedDate,detail:'Lançamento manual fictício'}]};
}
export function postPayment(account,input,actor){
  if(!account)throw new Error('Título indisponível.');authorize(actor,account.companyId,account.branchId);
  const id=text(input.id,80),amountCents=moneyCents(input.amount),date=day(input.date),method=input.method;
  if(!['pix','cash','transfer','card','other'].includes(method))throw new Error('Forma de baixa inválida.');
  const previous=account.payments.find(p=>p.id===id);
  if(previous){if(previous.amountCents===amountCents&&previous.date===date&&previous.method===method&&previous.actorId===actor.id)return account;throw new Error('Repetição de baixa com dados diferentes.');}
  if(account.status==='cancelled'||amountCents<=0||amountCents>balance(account)||date<account.issuedDate||date>localDay())throw new Error('Confira valor, saldo e data da baixa. Não são aceitos excessos ou datas futuras.');
  return {...account,payments:[...account.payments,{id,amountCents,date,method,actorId:actor.id}],history:[...account.history,{action:'payment',actorId:actor.id,date,detail:'Baixa manual fictícia'}]};
}
export function cancelAccount(account,input,actor){
  if(!account)throw new Error('Título indisponível.');authorize(actor,account.companyId,account.branchId);
  if(account.status==='cancelled'||paid(account)>0)throw new Error('Não cancelar título já cancelado ou com baixa. Estorno requer um fluxo futuro específico.');
  const date=day(input.date);if(date<account.issuedDate||date>localDay())throw new Error('Data de cancelamento inválida.');
  return {...account,status:'cancelled',history:[...account.history,{action:'cancelled',actorId:actor.id,date,detail:text(input.reason,300)}]};
}
export function visibleAccounts(accounts,actor,branch='all'){
  if(!actor||!actor.active||actor.role!=='administrative')return [];
  return accounts.filter(a=>a.companyId===actor.companyId&&(branch==='all'||a.branchId===branch)&&(actor.canAccessAllBranches===true||a.branchId===actor.branchId));
}
export function financialSummary(accounts,{from,to,today}){
  day(from);day(to);day(today);if(from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw new Error('Escolha um período válido de até 366 dias.');
  const inPeriod=d=>d>=from&&d<=to,active=accounts.filter(a=>a.status!=='cancelled');
  const billed=active.filter(a=>a.type==='income'&&inPeriod(a.issuedDate)).reduce((n,a)=>n+a.amountCents,0);
  const entries=active.flatMap(a=>a.payments.filter(p=>inPeriod(p.date)).map(p=>({...p,type:a.type,category:a.category,accountId:a.id,description:a.description,code:a.code})));
  const received=entries.filter(p=>p.type==='income').reduce((n,p)=>n+p.amountCents,0),spent=entries.filter(p=>p.type==='expense').reduce((n,p)=>n+p.amountCents,0);
  const receivable=active.filter(a=>a.type==='income').reduce((n,a)=>n+balance(a),0),payable=active.filter(a=>a.type==='expense').reduce((n,a)=>n+balance(a),0);
  const overdue=active.filter(a=>a.type==='income'&&a.dueDate<today).reduce((n,a)=>n+balance(a),0);
  const months=[];let cursor=from.slice(0,7);while(cursor<=to.slice(0,7)){months.push({month:cursor,billed:0,received:0,spent:0});const [y,m]=cursor.split('-').map(Number);cursor=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');}
  for(const a of active)if(a.type==='income'&&inPeriod(a.issuedDate))months.find(m=>m.month===a.issuedDate.slice(0,7)).billed+=a.amountCents;
  for(const e of entries)months.find(m=>m.month===e.date.slice(0,7))[e.type==='income'?'received':'spent']+=e.amountCents;
  const categories=Object.entries(expenseCategories).map(([key,label])=>({key,label,amount:entries.filter(e=>e.type==='expense'&&e.category===key).reduce((n,e)=>n+e.amountCents,0)}));
  for(const v of [billed,received,spent,receivable,payable,overdue])if(!Number.isSafeInteger(v))throw new Error('Totais fora do limite seguro.');
  return {billed,received,spent,movementBalance:received-spent,receivable,payable,overdue,entries,months,categories};
}
