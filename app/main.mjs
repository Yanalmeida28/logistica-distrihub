import {mountDispatch} from './dispatch.mjs';
import {mountPortal,observePortal} from './portal.mjs';
import {mountFinance} from './finance.mjs';
import {mountChat} from './chat.mjs';
import {mountQuotes} from './quotes.mjs';
import {mountSaas} from './saas.mjs';
import {mountTeam} from './team.mjs';
import {steps,demoCompany,visibleCargo,metrics,receiveCargo,advanceCargo,recordOccurrence,occurrenceTypes,resolveIssue,linkDocument} from './domain.mjs';
import {initialCargo} from './demo.mjs';
let cargos=initialCargo(),view='dashboard',branch='all',query='',status='',selected=null,noticeTimer;
const content=document.getElementById('content'),dialog=document.getElementById('detail');
const menu=document.getElementById('module-menu'),mobileMenu=window.matchMedia('(max-width:720px)');
menu.open=!mobileMenu.matches;
mobileMenu.addEventListener('change',()=>{menu.open=!mobileMenu.matches;});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unit=id=>id==='unidade-a'?'Unidade A':'Unidade B';
const label=id=>steps.find(s=>s.id===id)?.label??({occurrence_noted:'Ocorrência informativa',issue_opened:'Pendência registrada',issue_resolved:'Pendência resolvida',document_linked:'Referência vinculada'}[id]??id);
const date=value=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const visible=()=>visibleCargo(cargos,demoCompany,branch);
function saveCargos(next){observePortal(cargos,next);cargos=next;}
function context(){return {companyId:demoCompany,branchId:branch,actor:'Operador demonstrativo',at:new Date().toISOString()};}
function toast(message){const notice=document.getElementById('notice');clearTimeout(noticeTimer);notice.textContent=message;notice.hidden=false;noticeTimer=setTimeout(()=>{notice.hidden=true;},5000);}
function heading(kicker,title,description,button=true){return '<div class="page-heading"><div><p class="eyebrow">'+kicker+'</p><h1>'+title+'</h1><p>'+description+'</p></div>'+(button?'<button type="button" class="primary" data-go="receiving">+ Registrar recebimento</button>':'')+'</div>';}
function pill(c){return '<span class="status '+esc(c.status)+'">'+esc(label(c.status))+'</span>';}
function table(rows){return '<div class="table-wrap"><table><thead><tr><th>Carga / cliente</th><th>Rota</th><th>Unidade</th><th>Volumes</th><th>Situação</th><th></th></tr></thead><tbody>'+rows.map(c=>'<tr><td><strong>'+esc(c.code)+'</strong><small>'+esc(c.customer)+'</small></td><td>'+esc(c.origin)+'<small>→ '+esc(c.destination)+'</small></td><td>'+unit(c.branchId)+'</td><td>'+c.volumes+'</td><td>'+pill(c)+(c.issues.some(i=>!i.resolvedAt)?'<small class="attention">Há pendência aberta</small>':'')+'</td><td><button type="button" class="row-button" data-cargo="'+esc(c.id)+'" aria-label="Abrir carga '+esc(c.code)+'">Ver detalhes ↗</button></td></tr>').join('')+'</tbody></table>'+(rows.length?'':'<div class="empty">Nenhuma carga encontrada neste contexto.</div>')+'</div>';}
function issues(rows){return rows.flatMap(c=>c.issues.filter(i=>!i.resolvedAt).map(i=>'<article class="issue-card"><span class="issue-icon">!</span><div><p class="eyebrow">'+esc(c.code)+' / '+unit(c.branchId)+'</p><h3>'+esc(occurrenceTypes[i.category]?.label??'Pendência')+'</h3><p>'+esc(i.description)+'</p><p>Responsável: '+esc(i.responsible)+'</p><span class="status '+(i.blocking?'blocked':'received')+'">'+(i.blocking?'Bloqueante nesta simulação':'Acompanhamento')+'</span></div><button type="button" class="secondary" data-cargo="'+esc(c.id)+'">Tratar pendência</button></article>')).join('')||'<div class="empty">Nenhuma pendência aberta nesta unidade.</div>';}
function recentOccurrences(rows){
 const events=rows.flatMap(c=>c.events.filter(e=>['issue_opened','issue_resolved','occurrence_noted'].includes(e.kind)).map(e=>({c,e}))).sort((a,b)=>b.e.at.localeCompare(a.e.at)).slice(0,30);
 return '<div class="section-title"><h2>Histórico recente de ocorrências</h2><span>Até 30 registros do exemplo</span></div>'+events.map(({c,e})=>'<article class="issue-card"><div><p class="eyebrow">'+esc(c.code)+' / '+unit(c.branchId)+'</p><h3>'+esc(label(e.kind))+'</h3><p>'+esc(e.detail)+'</p><p>'+esc(date(e.at))+' · '+esc(e.actor)+(e.responsible?' · Acompanhamento: '+esc(e.responsible):'')+'</p></div><button type="button" class="secondary" data-cargo="'+esc(c.id)+'">Ver carga</button></article>').join('')+(events.length?'':'<div class="card empty">Nenhuma ocorrência registrada neste contexto.</div>');
}
function render(){
  document.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const activeModule=document.querySelector('[data-view][aria-current="page"]');
  document.getElementById('current-module').textContent=activeModule?Array.from(activeModule.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' '):'Módulos';
  const rows=visible(),m=metrics(rows);
  if(view==='portal'){mountPortal(content,{branch,getCargo:()=>cargos,notify:toast});return;}
  if(view==='dispatch'){mountDispatch(content,{branch,getCargo:()=>cargos,saveCargo:saveCargos,notify:toast});return;}
  if(view==='chat'){mountChat(content,{branch,getCargo:()=>cargos,notify:toast});return;}
  if(['administration','billing','expenses'].includes(view)){mountFinance(content,{branch,mode:view,notify:toast});return;}
  if(view==='quotes'){mountQuotes(content,{branch,notify:toast});return;}
  if(view==='saas'){mountSaas(content);return;}
  if(view==='team'){mountTeam(content,{branch,getCargo:()=>cargos,saveCargo:saveCargos,notify:toast});return;}
  if(view==='dashboard'){
    content.innerHTML=heading('ACOMPANHAMENTO / DEMONSTRAÇÃO','Toda carga precisa de contexto.','Uma visão dos recebimentos, movimentações e pendências do exemplo.')+
      '<div class="metrics">'+[['Cargas em andamento',m.active,'Em acompanhamento'],['Aguardando embarque',m.received,'Recebidas na unidade'],['Pendências abertas',m.issues,'Com responsável definido'],['Entregas confirmadas',m.delivered,'No conjunto de exemplo']].map(([title,value,note])=>'<article><span>'+title+'</span><strong>'+value+'</strong><small>'+note+'</small></article>').join('')+'</div>'+
      '<div class="section-title"><h2>Visibilidade das cargas</h2><button type="button" class="text-button" data-go="cargo">Ver todas →</button></div>'+table(rows)+
      '<div class="section-title"><h2>O que precisa de atenção</h2><span>Ocorrências do exemplo</span></div>'+issues(rows);
  }else if(view==='cargo'){
    content.innerHTML=heading('CARGAS','Do recebimento à entrega.','Cada etapa deve ser confirmada; nenhuma movimentação é inferida.')+
      '<div class="filters"><label>Buscar carga<input id="search" type="search" placeholder="Código, cliente ou destino fictício" maxlength="100" value="'+esc(query)+'"></label><label>Etapa<select id="status"><option value="">Todas as etapas</option>'+steps.map(s=>'<option value="'+s.id+'"'+(status===s.id?' selected':'')+'>'+s.label+'</option>').join('')+'</select></label></div><div id="cargo-results"></div>';
    renderResults();
  }else if(view==='issues')content.innerHTML=heading('OCORRÊNCIAS','Cada exceção tem registro e responsável.','Abra uma carga para apontar uma ocorrência. Endereço localizado não confirma entrega.')+issues(rows)+recentOccurrences(rows);
  else if(view==='receiving'){
    content.innerHTML=heading('RECEBIMENTO','A informação começa na chegada.','Registro interno de teste. Não emite CT-e e não autoriza transporte.',false)+
      '<div class="form-layout"><form id="receive-form" class="card"><div class="section-title"><h2>Nova carga fictícia</h2><span class="badge">Simulação</span></div><div class="form-grid">'+
      '<label>Unidade de recebimento<select name="branchId" required><option value="">Selecione</option>'+['unidade-a','unidade-b'].filter(b=>branch==='all'||branch===b).map(b=>'<option value="'+b+'"'+(branch===b?' selected':'')+'>'+unit(b)+'</option>').join('')+'</select></label>'+field('customer','Cliente de exemplo','Ex.: Indústria Modelo',100)+field('origin','Origem','Ex.: Campinas / SP',100)+field('destination','Destino','Ex.: Curitiba / PR',100)+
      '<label>Quantidade de volumes<input name="volumes" type="number" min="1" max="100000" step="1" required value="1"></label><label class="wide">Descrição dos volumes<textarea name="description" maxlength="300" required placeholder="Descreva apenas mercadorias fictícias"></textarea></label></div><p class="form-error" role="alert" id="receive-error"></p><button class="primary" type="submit">Registrar recebimento de teste</button></form><aside class="tip"><span>01 / PRIMEIRO REGISTRO</span><h2>Sem CT-e ainda?<br>A carga pode ter um código interno.</h2><p>O exemplo começa no recebimento. Não cria uma coleta anterior nem confirma embarque automaticamente.</p><p>A referência documental pode ser vinculada depois. Este protótipo não confere documentos ou obrigações fiscais.</p><small>Somente dados fictícios. Nada será salvo em servidor.</small></aside></div>';
  }else if(view==='communication')content.innerHTML=heading('ATENDIMENTO','Cliente informado, com eventos confirmados.','Portal e preferencia WhatsApp disponiveis no demonstrativo.',false)+
    '<div class="card"><h2>Portal do cliente e WhatsApp</h2><p>Acompanhe cargas vinculadas, ocorrencias resumidas e referencias documentais liberadas pela central. A preferencia WhatsApp pode ser autorizada ou revogada pelo contato ficticio.</p><button type="button" class="primary" data-go="portal">Abrir portal demonstrativo</button><p class="fine">As atualizacoes automaticas sao apenas previas locais. Nenhuma mensagem e enviada. Nao existe login real, integracao Meta, numero conectado ou compartilhamento com o WhatsApp do DistriHub.</p></div>';
  else content.innerHTML=heading('PROJETO','Um espaço separado para validar.','Nome e arquitetura operacional ainda em definição.',false)+
    '<div class="card"><h2>Estado dos componentes</h2><dl class="settings-list">'+[['Interface e navegação','Protótipo local'],['Dados','Fictícios, somente na memória'],['Autenticação / permissões reais','Não implementadas'],['Banco de dados','Não conectado'],['TMS / CT-e / documentos fiscais','Sem integração ou emissão'],['WhatsApp / e-mail / IA','Não conectados'],['Dados e recursos do DistriHub','Não compartilhados'],['Publicação / hospedagem','Não configuradas']].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl><p>Para transformar a demonstração em sistema, precisamos validar o TMS, responsáveis pelos eventos, divisões de carga e autorização por empresa/unidade.</p></div>';
}
function field(name,title,placeholder,max){return '<label>'+title+'<input name="'+name+'" maxlength="'+max+'" placeholder="'+placeholder+'" required></label>';}
function renderResults(){const q=query.toLocaleLowerCase('pt-BR');document.getElementById('cargo-results').innerHTML=table(visible().filter(c=>(!status||c.status===status)&&[c.code,c.customer,c.destination,c.origin].some(v=>v.toLocaleLowerCase('pt-BR').includes(q))));}
function openCargo(id){const c=visible().find(c=>c.id===id);if(!c)return;selected=id;renderDetail(c);if(!dialog.open)dialog.showModal();}
function renderDetail(c){
  const step=steps.find(s=>s.id===c.status),open=c.issues.filter(i=>!i.resolvedAt);
  document.getElementById('detail-body').innerHTML='<p class="eyebrow">CARGA FICTÍCIA / '+unit(c.branchId)+'</p><h2 id="detail-title">'+esc(c.code)+'</h2>'+pill(c)+'<p>'+esc(c.customer)+' · '+c.volumes+' volumes</p><p>'+esc(c.origin)+' → '+esc(c.destination)+'</p><p class="muted">'+esc(c.description)+'</p>'+
    '<div class="detail-columns"><section><h3>Histórico do exemplo</h3><ol class="timeline">'+c.events.map(e=>'<li><strong>'+esc(label(e.kind))+'</strong><p>'+esc(e.detail)+'</p><small>'+esc(date(e.at))+' · '+esc(e.actor)+'<br>'+esc(e.source)+'</small></li>').join('')+'</ol></section><section><h3>Próxima ação</h3>'+
    (step.action?'<form data-form="advance"><label>Registro da confirmação<textarea name="note" maxlength="300" required placeholder="Como a operação confirmou essa etapa?"></textarea></label><input type="hidden" name="expectedStatus" value="'+esc(c.status)+'"><button class="primary" type="submit"'+(open.some(i=>i.blocking)?' disabled':'')+'>'+step.action+' · teste</button></form>':(c.status==='delivered'?'<p class="success-text">Fluxo demonstrativo concluído.</p>':'<p class="muted">Confirme a coleta atribuída na área do coletor em Equipe e coletas.</p>'))+
    (open.some(i=>i.blocking)?'<p class="attention">Há pendência bloqueante. Resolva antes de avançar neste exemplo.</p>':'')+
    '<h3>Pendências</h3>'+open.map(i=>'<form data-form="resolve" class="mini-card"><strong>'+esc(i.description)+'</strong><p>Responsável: '+esc(i.responsible)+'</p><input type="hidden" name="issueId" value="'+esc(i.id)+'"><label>Como foi resolvida?<input name="note" maxlength="300" required></label><button class="secondary" type="submit">Resolver · teste</button></form>').join('')+
    '<details><summary>+ Apontar ocorrência</summary><form data-form="issue"><label>Tipo de ocorrência<select name="category" id="occurrence-category">'+Object.entries(occurrenceTypes).map(([key,type])=>'<option value="'+key+'">'+type.label+'</option>').join('')+'</select></label>'+field('description','Detalhes fictícios','Descreva o que ocorreu, sem dados reais',300)+field('responsible','Responsável pelo acompanhamento','Ex.: Equipe da unidade',80)+'<label class="checkbox" id="occurrence-block"><input type="checkbox" name="blocking"> Bloquear avanço nesta simulação</label><p class="fine" id="occurrence-hint">A ocorrência fica no histórico e abre uma pendência. Não altera automaticamente a etapa da carga.</p><button class="secondary" type="submit">Registrar ocorrência · teste</button></form></details>'+
    '<h3>Referências documentais</h3>'+(c.documents.length?'<ul>'+c.documents.map(d=>'<li>'+esc(d.type.toUpperCase())+' · '+esc(d.reference)+'</li>').join('')+'</ul>':'<p class="muted">Sem referências vinculadas.</p>')+
    '<details><summary>+ Vincular referência fictícia</summary><form data-form="document"><label>Tipo<select name="type"><option value="triagem">Triagem</option><option value="nf">Nota fiscal — referência</option><option value="cte">CT-e — referência</option><option value="outro">Outro</option></select></label>'+field('reference','Referência de exemplo','Ex.: TRIAGEM-TESTE-01',80)+'<button class="secondary" type="submit">Vincular · teste</button></form></details><p class="fine">Somente referência textual; nenhum documento é enviado, validado ou autorizado.</p></section></div><p class="form-error" id="detail-error" role="alert"></p>';
}
function go(next){view=next;render();if(mobileMenu.matches)menu.open=false;content.focus();window.scrollTo({top:0,behavior:'auto'});}
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.view)go(button.dataset.view);
  if(button.dataset.go)go(button.dataset.go);
  if(button.dataset.cargo)openCargo(button.dataset.cargo);
});
document.getElementById('branch').addEventListener('change',e=>{branch=e.target.value;dialog.close();selected=null;query='';status='';render();});
document.getElementById('close-detail').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{selected=null;});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;renderResults();}});
document.addEventListener('change',e=>{if(e.target.id==='occurrence-category'){const info=occurrenceTypes[e.target.value]?.informational===true;document.getElementById('occurrence-block').hidden=info;document.querySelector('[data-form=issue] [name=blocking]').checked=false;document.getElementById('occurrence-hint').textContent=info?'Registro informativo: não abre ou resolve pendência e não confirma entrega.':'Abre uma pendência sem alterar automaticamente a etapa da carga.';}if(e.target.id==='status'){status=e.target.value;renderResults();}});
document.addEventListener('submit',e=>{
  e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));
  if(form.id==='receive-form'){
    try{const id=crypto.randomUUID();const cargo=receiveCargo({...values,...context(),branchId:values.branchId,id,code:'LAB-'+id.slice(0,8).toUpperCase()});saveCargos([cargo,...cargos]);view='cargo';query='';status='';render();openCargo(cargo.id);toast('Recebimento fictício registrado. Nenhuma operação real foi realizada.');}
    catch(error){document.getElementById('receive-error').textContent=error.message;}return;
  }
  if(!form.dataset.form)return;
  try{
    const cargo=visible().find(c=>c.id===selected);if(!cargo)throw new Error('Carga indisponível neste contexto.');
    const input={...values,...context(),id:crypto.randomUUID(),blocking:values.blocking==='on'};
    const actions={advance:advanceCargo,issue:recordOccurrence,resolve:resolveIssue,document:linkDocument};
    const next=actions[form.dataset.form](cargo,input);saveCargos(cargos.map(c=>c.id===next.id?next:c));render();renderDetail(next);toast('Alteração aplicada somente ao exemplo local.');
  }catch(error){document.getElementById('detail-error').textContent=error.message;}
});
render();
