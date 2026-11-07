import {createAccount,postPayment,cancelAccount,visibleAccounts,financialSummary,localDay,balance,paid,accountState,expenseCategories,incomeCategories} from './finance-domain.mjs';
import {demoCompany,branches} from './domain.mjs';
import {mountExpense} from './expense.mjs';
const actor={id:'finance-demo-admin',companyId:demoCompany,branchId:'all',role:'administrative',active:true,canAccessAllBranches:true};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const unit=b=>b==='unidade-a'?'Unidade A':'Unidade B';
const names={open:'Em aberto',partial:'Baixa parcial',settled:'Quitado no exemplo',overdue:'Vencido',cancelled:'Cancelado'};
const methods={pix:'Pix — registro manual',cash:'Dinheiro',transfer:'Transferência',card:'Cartão',other:'Outro'};
let lastScope='',accounts=[],selected=null,from=localDay().slice(0,7)+'-01',to=localDay();
function seed(){
  if(accounts.length)return;
  const now=new Date();let seq=0;
  for(let offset=2;offset>=0;offset--){const d=new Date(now.getFullYear(),now.getMonth()-offset,1),date=localDay(d),branchId=offset%2?'unidade-b':'unidade-a';
    for(const [type,category,amount,description]of [['income','freight',String(1100+offset*100)+',00','Fretes fictícios de demonstração'],['expense','fuel',String(210+offset*20)+',00','Combustível fictício'],['expense','office','90,00','Despesa administrativa fictícia']]){
      const id='finance-example-'+(++seq);let a=createAccount({id,code:'EXEMPLO-'+seq,companyId:demoCompany,branchId,type,category,amount,description,party:type==='income'?'Cliente Exemplo':'Fornecedor Exemplo',issuedDate:date,dueDate:date},actor);
      if(category!=='office')a=postPayment(a,{id:'payment-'+id,amount:type==='income'?String(800+offset*100)+',00':amount,date,method:'transfer'},actor);
      accounts.push(a);
    }
  }
}
function graph(summary){
  const list=summary.months,max=Math.max(1,...list.flatMap(m=>[m.billed,m.received,m.spent])),width=Math.max(540,list.length*100),height=230,bar=18,group=(width-80)/list.length;
  let svg='<svg class="finance-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Gráfico de títulos de frete registrados, recebimentos e despesas pagas por mês"><line x1="45" y1="190" x2="'+(width-15)+'" y2="190" class="chart-axis"/>';
  list.forEach((m,i)=>{const x=50+i*group;for(const [j,key]of ['billed','received','spent'].entries()){const h=m[key]/max*155;svg+='<rect x="'+(x+j*(bar+3))+'" y="'+(190-h)+'" width="'+bar+'" height="'+h+'" rx="3" class="chart-'+key+'"><title>'+m.month+' · '+({billed:'Fretes registrados',received:'Recebido',spent:'Despesas pagas'}[key])+': '+money(m[key])+'</title></rect>';}svg+='<text x="'+(x+25)+'" y="215" text-anchor="middle">'+m.month.split('-').reverse().join('/')+'</text>';});
  svg+='</svg>';
  return '<div class="card"><div class="section-title"><h2>Faturamento operacional e baixas</h2><span>Dados fictícios</span></div><div class="chart-legend"><span class="legend-billed">Fretes registrados</span><span class="legend-received">Recebido</span><span class="legend-spent">Despesas pagas</span></div><div class="chart-scroll">'+svg+'</div><details><summary>Consultar os valores do gráfico</summary><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Fretes registrados</th><th>Recebido</th><th>Despesas pagas</th></tr></thead><tbody>'+list.map(m=>'<tr><td>'+m.month+'</td><td>'+money(m.billed)+'</td><td>'+money(m.received)+'</td><td>'+money(m.spent)+'</td></tr>').join('')+'</tbody></table></div></details><p class="fine">Títulos manuais de frete não são notas fiscais ou propostas de cotação. Não há cálculo de lucro contábil.</p></div>';
}
function expenseGraph(summary){const max=Math.max(1,...summary.categories.map(c=>c.amount));return '<div class="card"><h2>Despesas pagas por categoria</h2><svg class="expense-chart" viewBox="0 0 500 320" role="img" aria-label="Despesas pagas por categoria">'+summary.categories.map((c,i)=>'<text x="0" y="'+(i*43+20)+'">'+esc(c.label)+'</text><rect x="130" y="'+(i*43+5)+'" height="20" width="'+(c.amount/max*210)+'" rx="3" class="chart-spent"/><text x="355" y="'+(i*43+20)+'">'+esc(money(c.amount))+'</text>').join('')+'</svg><p class="fine">Somente baixas de despesas no período selecionado. Despesas em aberto não entram neste gráfico.</p></div>';}
const field=(name,title,type,attrs)=>'<label>'+title+'<input name="'+name+'" type="'+type+'" required '+attrs+'></label>';
export function mountFinance(root,{branch,mode,notify}){
  if(lastScope!==branch+':'+mode){selected=null;lastScope=branch+':'+mode;}
  seed();const today=localDay(),rows=visibleAccounts(accounts,actor,branch);let s;
  try{s=financialSummary(rows,{from,to,today});}catch{from=today.slice(0,7)+'-01';to=today;s=financialSummary(rows,{from,to,today});}
  const type=mode==='expenses'?'expense':'income',categories=type==='expense'?expenseCategories:incomeCategories;
  const periodRows=rows.filter(a=>a.issuedDate>=from&&a.issuedDate<=to&&(mode==='administration'||a.type===type));
  const current=rows.find(a=>a.id===selected),isExpense=current?.type==='expense';
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">ADMINISTRATIVO / TRANSPORTADORA</p><h1>'+({administration:'Os números da operação, separados.',expenses:'Despesas com origem e acompanhamento.',billing:'Fretes cobrados não são recebimentos.'}[mode])+'</h1><p>Gestão financeira demonstrativa, sem cobrança real ou integração bancária.</p></div></div>'+
    '<div class="tip horizontal"><strong>Somente lançamentos fictícios</strong><p>Os valores iniciais são exemplos para visualizar os gráficos. Não representam resultados de uma empresa real. As mensalidades do seu aplicativo ficam na área Modelo SaaS.</p></div>'+
    '<form id="finance-period" class="filters team-panels">'+field('from','Período inicial','date','value="'+from+'"')+field('to','Período final','date','value="'+to+'"')+'<button class="secondary" type="submit">Aplicar período</button><button class="secondary" type="button" id="finance-csv">Exportar resumo CSV</button></form>'+
    '<div class="metrics finance-metrics">'+[['Fretes registrados no período',s.billed,'Títulos operacionais; não notas fiscais'],['Recebido no período',s.received,'Baixas de contas a receber'],['Despesas pagas no período',s.spent,'Baixas de contas a pagar'],['Saldo de movimentações',s.movementBalance,'Recebido menos pago; não é lucro'],['A receber no contexto',s.receivable,'Todos os títulos não cancelados'],['A pagar no contexto',s.payable,'Todos os títulos não cancelados'],['Recebíveis vencidos',s.overdue,'Saldo vencido até hoje']].map(([k,v,n])=>'<article><span>'+k+'</span><strong>'+money(v)+'</strong><small>'+n+'</small></article>').join('')+'</div>'+
    (mode==='administration'?'<div class="finance-graphs">'+graph(s)+expenseGraph(s)+'</div><div class="quote-actions"><button class="primary" type="button" data-go="billing">Gerenciar faturamento</button><button class="secondary" type="button" data-go="expenses">Gerenciar despesas</button></div>':'<section class="card"><h2>'+ (type==='expense'?'Registrar despesa fictícia':'Registrar título de frete fictício')+'</h2><form id="account-form"><div class="form-grid"><label>Unidade<select name="branchId">'+branches.filter(b=>branch==='all'||branch===b).map(b=>'<option value="'+b+'">'+unit(b)+'</option>').join('')+'</select></label><label>Categoria<select name="category">'+Object.entries(categories).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>'+field('party',type==='expense'?'Fornecedor / beneficiário fictício':'Cliente fictício','text','maxlength="100"')+field('amount','Valor total (R$)','text','inputmode="decimal" maxlength="12"')+field('issuedDate','Data de registro','date','value="'+today+'" max="'+today+'"')+field('dueDate','Vencimento','date','value="'+today+'"')+'<label class="wide">Descrição fictícia<textarea name="description" required maxlength="300"></textarea></label></div><button class="primary" type="submit">Registrar · teste</button><p class="fine">Registro manual independente de cotação e coleta. Não emite CT-e, NF-e, boleto ou cobrança Pix.</p></form></section>')+
    (current?'<section class="card collector-area" id="account-detail"><div class="section-title"><h2>'+esc(current.code)+' · '+esc(current.description)+'</h2><button class="text-button" type="button" id="close-account">Fechar</button></div><p>'+esc(current.party)+' · '+unit(current.branchId)+'</p><p>Total: '+money(current.amountCents)+' · Baixado: '+money(paid(current))+' · Saldo: '+money(balance(current))+'</p>'+
      (balance(current)>0&&current.status!=='cancelled'?'<form id="payment-form"><h3>'+ (isExpense?'Registrar pagamento fictício':'Registrar recebimento fictício')+'</h3><div class="form-grid">'+field('amount','Valor da baixa (R$)','text','inputmode="decimal" maxlength="12"')+field('date','Data da baixa','date','value="'+today+'" min="'+current.issuedDate+'" max="'+today+'"')+'<label>Forma<select name="method">'+Object.entries(methods).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label></div><button class="primary" type="submit">Confirmar baixa · teste</button></form>':'')+
      (current.status!=='cancelled'&&paid(current)===0?'<details><summary>Cancelar título sem baixa</summary><form id="cancel-account"><label>Motivo fictício<textarea name="reason" required maxlength="300"></textarea></label><button class="secondary" type="submit">Cancelar no exemplo</button></form></details>':'')+
      '<details><summary>Histórico e baixas</summary>'+current.history.map(h=>'<p>'+esc(h.date)+' · '+esc(h.detail)+'</p>').join('')+current.payments.map(p=>'<p>'+p.date+' · '+money(p.amountCents)+' · '+esc(methods[p.method])+'</p>').join('')+'</details><p class="fine">Cancelamento de título com baixa e estornos ainda precisam de fluxo específico. Nenhuma movimentação bancária é realizada.</p></section>':'')+
    '<div class="section-title"><h2>Títulos no período de registro</h2><span>'+periodRows.length+' registros fictícios</span></div><div class="table-wrap"><table><thead><tr><th>Título / pessoa fictícia</th><th>Tipo / unidade</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Situação</th><th></th></tr></thead><tbody>'+periodRows.map(a=>'<tr><td><strong>'+esc(a.code)+' · '+esc(a.description)+'</strong><small>'+esc(a.party)+'</small></td><td>'+(a.type==='income'?'A receber':'Despesa')+'<small>'+unit(a.branchId)+'</small></td><td>'+a.dueDate.split('-').reverse().join('/')+'</td><td>'+money(a.amountCents)+'</td><td>'+money(balance(a))+'</td><td><span class="status '+(accountState(a,today)==='overdue'?'blocked':'received')+'">'+names[accountState(a,today)]+'</span></td><td><button class="row-button" type="button" data-account="'+esc(a.id)+'">Detalhes / baixa</button></td></tr>').join('')+'</tbody></table>'+(periodRows.length?'':'<p class="empty">Nenhum título neste período e contexto.</p>')+'</div><p id="finance-error" class="form-error" role="alert"></p>';
  const repaint=()=>mountFinance(root,{branch,mode,notify});
  const error=e=>{const node=root.querySelector('#finance-error');node.textContent=e.message;node.scrollIntoView({block:'nearest'});};
  root.querySelectorAll('[data-account]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.account;repaint();root.querySelector('#account-detail')?.scrollIntoView({block:'start'});}));
  root.querySelector('#close-account')?.addEventListener('click',()=>{selected=null;repaint();});
  root.querySelectorAll('form').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();e.stopPropagation();const values=Object.fromEntries(new FormData(form));
    try{
      if(form.id==='finance-period'){financialSummary(rows,{...values,today});from=values.from;to=values.to;repaint();return;}
      if(form.id==='account-form'){const id=crypto.randomUUID(),a=createAccount({...values,id,code:(type==='expense'?'DES-':'FAT-')+id.slice(0,8).toUpperCase(),companyId:demoCompany,type},actor);accounts=[a,...accounts];selected=a.id;}
      else if(form.id==='payment-form'){const next=postPayment(current,{...values,id:crypto.randomUUID()},actor);accounts=accounts.map(a=>a.id===next.id?next:a);}
      else if(form.id==='cancel-account'){const next=cancelAccount(current,{...values,date:today},actor);accounts=accounts.map(a=>a.id===next.id?next:a);}
      repaint();notify('Lançamento atualizado apenas no exemplo. Nenhum dinheiro movimentado.');
    }catch(e){error(e);}
  }));
  root.querySelector('#finance-csv').addEventListener('click',()=>{
    const rows=[['DEMONSTRACAO - SEM DADOS REAIS'],['Periodo',from,to],['Indicador','Valor BRL'],['Fretes registrados',s.billed/100],['Recebido',s.received/100],['Despesas pagas',s.spent/100],['Saldo de movimentacoes - nao lucro',s.movementBalance/100]];
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='resumo-financeiro-ficticio.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  mountExpense(root,{account:current,actor,notify,save:next=>{accounts=accounts.map(a=>a.id===next.id?next:a);repaint();}});
}
