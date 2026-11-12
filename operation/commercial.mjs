const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number.isSafeInteger(Number(v))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)/100):'Valor fora do limite';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const field=(name,label,attrs='')=>'<label>'+label+'<input name="'+name+'" required '+attrs+'></label>';
const states={requested:'Aguardando proposta',proposed:'Proposta disponível',accepted:'Aceita',declined:'Recusada',open:'Em aberto',settled:'Quitada',cancelled:'Cancelada'};
export function amountCents(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,8})([.,]\d{1,2})?$/.test(value.trim()))throw Error('Informe um valor com até duas casas decimais, sem separador de milhar.');return Math.round(Number(value.trim().replace(',','.'))*100);}
export function commercialFields(kind,values){
 const input={...values};
 if(input.amount!==undefined){input.amount_cents=amountCents(input.amount);delete input.amount;}
 if(input.expected_version!==undefined)input.expected_version=Number(input.expected_version);
 if(input.valid_until)input.valid_until=new Date(input.valid_until).toISOString();
 if(input.action==='create'){
  input.details=kind==='quotes'?{origin:input.origin,destination:input.destination,volumes:Number(input.volumes),weight_kg:Number(input.weight_kg)}:{issued_date:input.issued_date,due_date:input.due_date,reference:input.reference??''};
  for(const key of ['origin','destination','volumes','weight_kg','issued_date','due_date','reference'])delete input[key];
 }
 return input;
}
export function mountCommercial(root,{request,companyId,userId,kind,branches,customers,notify=()=>{}}){
 let page=1,branch='',data=null,loading=false,mutating=false;
 const storageKey='logistics:commercial:'+userId+':'+companyId+':'+kind;
 let pending=null,storageError=false;
 try{pending=JSON.parse(sessionStorage.getItem(storageKey)??'null');if(pending&&(!pending.request_id||pending.company_id!==companyId||pending.kind!==kind))throw Error('Invalid pending command');}catch{storageError=true;}
 const title={quotes:'Cotações',income:'Faturamento',expense:'Despesas',finance:'Financeiro'}[kind];
 const selectBranches=(name,all=false)=>'<label>Filial<select name="'+name+'">'+(all?'<option value="">Todas as autorizadas</option>':'')+branches.filter(b=>b.active).map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label>';
 const categories=kind==='expense'?[['food','Alimentação'],['fuel','Combustível'],['toll','Pedágio'],['maintenance','Manutenção'],['staff','Pessoal'],['office','Administrativo'],['other','Outras despesas']]:[['freight','Frete'],['other','Outras receitas']];
 function paint(){
  const summary=data?.summary??{},rows=data?.rows??[];
  root.innerHTML='<section class="card"><h2>'+title+'</h2><p>'+(kind==='quotes'?'Solicitações e propostas manuais. O aceite não cria coleta nem cobrança automaticamente.':kind==='finance'?'Consolidado dos títulos autorizados da transportadora. Valores baixados são registros manuais, sem conexão bancária.':'Controle de títulos e baixas manuais da transportadora. A mensalidade do aplicativo é separada destes registros.')+'</p><div class="filters">'+selectBranches('filter_branch',true)+'<button type="button" class="secondary" data-commercial-refresh>Atualizar</button></div><p data-commercial-error role="alert"></p>'+
   (storageError?'<p role="alert">Não foi possível recuperar as confirmações deste navegador. Confira os lançamentos antes de continuar; novos envios estão bloqueados.</p>':'')+
   (pending?'<div class="tip"><p>Há uma confirmação pendente. Recupere a mesma tentativa antes de enviar outra operação.</p><button type="button" class="primary" data-commercial-recover>Recuperar confirmação</button></div>':'')+
   (kind==='finance'?'<div class="overview-metrics">'+[['A receber',summary.receivable],['A pagar',summary.payable],['Recebido',summary.received],['Pago',summary.spent]].map(([label,value])=>'<article class="overview-metric"><span>'+label+'</span><strong>'+money(value??0)+'</strong></article>').join('')+'</div>':'')+
   (kind!=='finance'?'<details><summary>+ '+(kind==='quotes'?'Nova solicitação de cotação':'Novo título')+'</summary><form data-commercial-action="create"><div class="form-grid">'+selectBranches('branch_id')+
    (kind==='quotes'?'<label>Cliente<select name="customer_id" required>'+customers.filter(c=>c.active).map(c=>'<option value="'+esc(c.id)+'" data-name="'+esc(c.name)+'">'+esc(c.name)+'</option>').join('')+'</select></label>'+field('origin','Origem','minlength="3" maxlength="300"')+field('destination','Destino','minlength="3" maxlength="300"')+field('volumes','Volumes','type="number" min="1" max="100000" step="1"')+field('weight_kg','Peso total (kg)','type="number" min="0.001" max="1000000" step="0.001"'):
     field('party',kind==='expense'?'Fornecedor / favorecido':'Cliente / pagador','minlength="2" maxlength="120"')+'<label>Categoria<select name="category">'+categories.map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('')+'</select></label>'+field('amount','Valor (R$)','inputmode="decimal" placeholder="100,00"')+field('issued_date','Data do registro','type="date" value="'+day()+'" max="'+day()+'"')+field('due_date','Vencimento','type="date" value="'+day()+'"')+'<label>Referência do comprovante<input name="reference" maxlength="300"></label>')+
    field('description','Descrição','minlength="3" maxlength="400"')+'</div><button type="submit" class="primary">Salvar '+(kind==='quotes'?'solicitação':'título')+'</button></form></details>':'')+
   '<p>'+esc(data?.total??0)+' registros · página '+page+' de '+esc(data?.pages??1)+'</p>'+rows.map(record=>{
    const quote=record.kind==='quotes',expired=quote&&record.status==='proposed'&&Date.parse(record.details.valid_until)<=Date.now();
    const base='<input type="hidden" name="id" value="'+esc(record.id)+'"><input type="hidden" name="expected_version" value="'+record.version+'">';
    return '<article class="mini-card"><h3>'+esc(record.party)+'</h3><p>'+esc(record.description)+'</p><span class="status">'+(expired?'Validade encerrada':states[record.status])+'</span><p>'+esc(branches.find(b=>b.id===record.branch_id)?.name??'Filial')+' · '+(quote?'Proposta: ':'Valor: ')+money(record.amount_cents)+(quote?'':' · Baixado: '+money(record.paid_cents)+' · Saldo: '+money(record.status==='cancelled'?0:record.amount_cents-record.paid_cents))+'</p>'+
     (quote?'<p>'+esc(record.details.origin)+' → '+esc(record.details.destination)+' · '+record.details.volumes+' volumes · '+record.details.weight_kg+' kg</p>'+(record.details.terms?'<p>'+esc(record.details.terms)+' · Validade: '+esc(new Date(record.details.valid_until).toLocaleString('pt-BR'))+'</p>':''):'<p>Registro: '+esc(record.details.issued_date)+' · Vencimento: '+esc(record.details.due_date)+'</p><p>'+esc(record.details.reference??'')+'</p>')+
     (kind!=='finance'&&quote&&record.status==='requested'?'<form data-commercial-action="propose">'+base+'<div class="form-grid">'+field('amount','Frete proposto (R$)','inputmode="decimal"')+field('estimated_days','Prazo estimado (dias)','type="number" min="1" max="365" step="1"')+field('valid_until','Válida até','type="datetime-local"')+field('note','Condições da proposta','minlength="3" maxlength="500"')+'</div><button class="primary">Registrar proposta</button></form>':'')+
     (kind!=='finance'&&quote&&record.status==='proposed'&&!expired?'<form data-commercial-action="decision">'+base+'<label>Resposta informada pelo cliente<select name="decision"><option value="accepted">Aceitar</option><option value="declined">Recusar</option></select></label>'+field('note','Registro da confirmação do cliente','minlength="3" maxlength="500"')+'<button class="secondary">Registrar resposta do cliente</button></form>':'')+
     (kind!=='finance'&&!quote&&record.status==='open'?'<details><summary>Registrar baixa</summary><form data-commercial-action="pay">'+base+field('amount','Valor da baixa (R$)','inputmode="decimal"')+field('date','Data da baixa','type="date" value="'+day()+'" max="'+day()+'"')+'<label>Forma<select name="method"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="transfer">Transferência</option><option value="card">Cartão</option><option value="other">Outra</option></select></label><button class="primary">Confirmar baixa manual</button></form></details>'+(record.paid_cents===0?'<details><summary>Cancelar título sem baixa</summary><form data-commercial-action="cancel">'+base+field('note','Motivo','minlength="3" maxlength="500"')+'<button class="secondary">Cancelar título</button></form></details>':''):'')+
     '<button type="button" class="text-button" data-commercial-history="'+esc(record.id)+'" data-kind="'+record.kind+'">Ver histórico</button><div data-history="'+esc(record.id)+'"></div></article>';
   }).join('')+(rows.length?'':'<p>Nenhum registro nesta seleção.</p>')+'<button class="secondary" data-commercial-prev '+(page<=1?'disabled':'')+'>Anterior</button> <button class="secondary" data-commercial-next '+(page>=(data?.pages??1)?'disabled':'')+'>Próxima</button></section>';
  root.querySelector('[name=filter_branch]').value=branch;
  if(pending||storageError)root.querySelectorAll('form input,form select,form button').forEach(el=>el.disabled=true);
 }
 function error(failure){const el=root.querySelector('[data-commercial-error]');if(el)el.textContent=failure.message;notify(failure.message,{error:true});}
 async function load(){if(loading||root.dataset.hasDraft)return;loading=true;try{const response=await request('commercial',{company_id:companyId,kind,action:'list',page,branch_id:branch});if(!root.isConnected)return;data=response.result;paint();}catch(failure){if(root.isConnected){if(!data)paint();error(failure);}}finally{loading=false;}}
 async function send(){if(!pending||mutating||!root.isConnected)return;mutating=true;
  root.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  try{await request('commercial',pending);sessionStorage.removeItem(storageKey);pending=null;if(root.isConnected){delete root.dataset.hasDraft;notify('Registro confirmado e salvo.');await load();}}
  catch(failure){if(failure.code==='commercial_rejected'||failure.code==='commercial_schema_pending'){try{sessionStorage.removeItem(storageKey);pending=null;}catch{storageError=true;}}
   if(root.isConnected){delete root.dataset.hasDraft;paint();error(failure);}}
  finally{mutating=false;if(root.isConnected)root.querySelector('[data-commercial-recover]')?.removeAttribute('disabled');}
 }
 root.innerHTML='<section class="card"><h2>'+title+'</h2><p>Abra o módulo para consultar os registros.</p></section>';
 root.addEventListener('input',event=>{if(event.target.closest('form'))root.dataset.hasDraft='true';});
 root.addEventListener('submit',event=>{const form=event.target.closest('[data-commercial-action]');if(!form)return;event.preventDefault();event.stopPropagation();if(pending||storageError||mutating)return;
  try{const values=Object.fromEntries(new FormData(form));values.action=form.dataset.commercialAction;if(kind==='quotes'&&values.action==='create')values.party=customers.find(c=>c.id===values.customer_id)?.name??'';
   pending={...commercialFields(kind,values),company_id:companyId,kind,request_id:crypto.randomUUID()};sessionStorage.setItem(storageKey,JSON.stringify(pending));void send();
  }catch(failure){pending=null;error(failure);}
 });
 root.addEventListener('change',event=>{if(event.target.name==='filter_branch'){branch=event.target.value;page=1;void load();}});
 root.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button||mutating)return;
  if(button.hasAttribute('data-commercial-recover')){void send();return;}
  if(button.hasAttribute('data-commercial-prev')){page--;void load();}if(button.hasAttribute('data-commercial-next')){page++;void load();}if(button.hasAttribute('data-commercial-refresh'))void load();
  if(button.dataset.commercialHistory){button.disabled=true;try{const result=await request('commercial',{company_id:companyId,kind:button.dataset.kind,action:'history',id:button.dataset.commercialHistory});if(root.isConnected){root.querySelector('[data-history="'+button.dataset.commercialHistory+'"]').innerHTML='<ol>'+result.result.map(e=>'<li>'+esc(new Date(e.at).toLocaleString('pt-BR'))+' · '+esc(e.action)+' · '+esc(e.details.note??e.details.method??'Registro confirmado')+'</li>').join('')+'</ol>';}}catch(failure){error(failure);}finally{button.disabled=false;}}
 });
 return {show:load};
}
