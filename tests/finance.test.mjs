import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccount,postPayment,cancelAccount,paid,balance,accountState,visibleAccounts,financialSummary,day} from '../app/finance-domain.mjs';
import {demoCompany} from '../app/domain.mjs';
const actor={id:'admin',companyId:demoCompany,branchId:'unidade-a',role:'administrative',active:true};
const input={id:'a',code:'FAT-TESTE',companyId:demoCompany,branchId:'unidade-a',type:'income',category:'freight',description:'Frete fictício',party:'Cliente exemplo',amount:'100,00',issuedDate:'2026-01-01',dueDate:'2026-01-20'};
const period={from:'2026-01-01',to:'2026-01-31',today:'2026-01-31'};
const receipt={id:'p',amount:'40,00',date:'2026-01-10',method:'transfer'};
test('título não é recebido até a baixa; resultado separa faturamento operacional e caixa',()=>{
  const a=createAccount(input,actor),s=financialSummary([a],period);assert.equal(s.billed,10000);assert.equal(s.received,0);assert.equal(s.receivable,10000);assert.equal(s.movementBalance,0);
});
test('baixa parcial mantém saldo; repetição idêntica não duplica; excesso e alteração são recusados',()=>{
  const a=createAccount(input,actor),p=postPayment(a,receipt,actor);assert.equal(paid(p),4000);assert.equal(balance(p),6000);assert.equal(paid(a),0);
  assert.equal(postPayment(p,receipt,actor),p);assert.throws(()=>postPayment(p,{...receipt,amount:'39,00'},actor));assert.throws(()=>postPayment(p,{...receipt,id:'p2',amount:'60,01'},actor));
  const settled=postPayment(p,{...receipt,id:'p2',amount:'60,00'},actor);assert.equal(accountState(settled,'2026-01-10'),'settled');
});
test('despesas pagas e a pagar são separadas; saldo de movimentações não é lucro',()=>{
  const a=postPayment(createAccount(input,actor),receipt,actor);
  const e=postPayment(createAccount({...input,id:'e',type:'expense',category:'fuel',amount:'30,00'},actor),{...receipt,id:'e-p',amount:'20,00'},actor);
  const s=financialSummary([a,e],period);assert.equal(s.received,4000);assert.equal(s.spent,2000);assert.equal(s.payable,1000);assert.equal(s.receivable,6000);assert.equal(s.movementBalance,2000);assert.equal(s.categories.find(c=>c.key==='fuel').amount,2000);
});
test('cancelamento preserva histórico e não é permitido após baixa',()=>{
  const a=createAccount(input,actor),cancelled=cancelAccount(a,{date:'2026-01-10',reason:'Registro fictício incorreto'},actor);
  assert.equal(balance(cancelled),0);assert.equal(cancelled.history.length,2);assert.equal(financialSummary([cancelled],period).billed,0);assert.throws(()=>postPayment(cancelled,receipt,actor));
  assert.throws(()=>cancelAccount(postPayment(a,receipt,actor),{date:'2026-01-10',reason:'Outro motivo'},actor));
});
test('recebimento em outro mês não repete o faturamento; vencido considera somente saldo',()=>{
  const a=postPayment(createAccount(input,actor),{...receipt,date:'2026-02-02'},actor),s=financialSummary([a],{from:'2026-02-01',to:'2026-02-28',today:'2026-02-28'});
  assert.equal(s.billed,0);assert.equal(s.received,4000);assert.equal(s.overdue,6000);assert.equal(accountState(a,'2026-01-15'),'partial');assert.equal(accountState(a,'2026-02-02'),'overdue');
});
test('permissão, empresa e unidade delimitam os dados de exemplo',()=>{
  const a=createAccount(input,actor);for(const wrong of [{...actor,companyId:'outra'},{...actor,branchId:'unidade-b'},{...actor,role:'collector'},{...actor,active:false}]){
    assert.equal(visibleAccounts([a],wrong).length,0);assert.throws(()=>postPayment(a,receipt,wrong));assert.throws(()=>cancelAccount(a,{date:'2026-01-10',reason:'Motivo'},wrong));
  }
});
test('datas, categorias, valores e períodos inválidos são recusados',()=>{
  assert.throws(()=>day('2026-02-31'));assert.throws(()=>financialSummary([],{...period,from:'2026-02-01'}));assert.throws(()=>financialSummary([],{...period,from:'2024-01-01'}));
  for(const patch of [{amount:'0'},{amount:'1,001'},{category:'inventada'},{dueDate:'2025-12-01'},{issuedDate:'2999-01-01',dueDate:'2999-01-02'}])assert.throws(()=>createAccount({...input,...patch},actor));
  assert.throws(()=>postPayment(createAccount(input,actor),{...receipt,date:'2999-01-01'},actor));
});
