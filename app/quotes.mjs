import {demoCompany,branches} from './domain.mjs';
import {requestQuote,proposeQuote,respondQuote,quoteStatus,visibleQuotes} from './quotes-domain.mjs';
let quotes=[],side='client',clientId='client-example-1',adminBranch='unidade-a';
const clients=[{id:'client-profile-1',clientId:'client-example-1',companyId:demoCompany,role:'client',active:true,name:'Indústria Exemplo'},{id:'client-profile-2',clientId:'client-example-2',companyId:demoCompany,role:'client',active:true,name:'Distribuidora Modelo'}];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unit=b=>b==='unidade-a'?'Unidade A':'Unidade B';
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const names={requested:'Aguardando proposta',proposed:'Proposta disponível',accepted:'Aceita no exemplo',declined:'Recusada no exemplo',expired:'Validade encerrada'};
const date=v=>new Date(v).toLocaleString('pt-BR');
const field=(name,label,type='text',attrs='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" required '+attrs+'></label>';
export function mountQuotes(root,{branch,notify}){
  if(branch!=='all')adminBranch=branch;
  const actor=side==='client'?clients.find(c=>c.clientId===clientId):{id:'admin-quote-'+adminBranch,companyId:demoCompany,role:'administrative',branchId:adminBranch,active:true,name:'Central exemplo'};
  const rows=visibleQuotes(quotes,actor,branch);
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">COTAÇÃO / CLIENTE / TRANSPORTADORA</p><h1>Uma solicitação, uma proposta clara.</h1><p>Fluxo de teste com valor manual. Sem cálculo automático, cobrança ou envio real.</p></div></div>'+
    '<div class="filters quote-profiles"><label>Simular visão<select id="quote-side"><option value="client"'+(side==='client'?' selected':'')+'>Cliente da transportadora</option><option value="administrative"'+(side==='administrative'?' selected':'')+'>Administrativo da transportadora</option></select></label>'+
    (side==='client'?'<label>Cliente fictício<select id="quote-client">'+clients.map(c=>'<option value="'+c.clientId+'"'+(clientId===c.clientId?' selected':'')+'>'+c.name+'</option>').join('')+'</select></label>':'<label>Unidade administrativa<select id="quote-admin-branch">'+branches.filter(b=>branch==='all'||branch===b).map(b=>'<option value="'+b+'"'+(adminBranch===b?' selected':'')+'>'+unit(b)+'</option>').join('')+'</select></label>')+'</div><p class="fine">Troca de perfis apenas demonstrativa. Não é autenticação ou isolamento de produção.</p>'+
    (side==='client'?'<section class="card"><h2>Solicitar cotação de teste</h2><form id="quote-request"><div class="form-grid"><label>Unidade da transportadora<select name="branchId">'+branches.filter(b=>branch==='all'||branch===b).map(b=>'<option value="'+b+'">'+unit(b)+'</option>').join('')+'</select></label>'+field('origin','Origem fictícia','text','maxlength="120"')+field('destination','Destino fictício','text','maxlength="120"')+field('volumes','Quantidade de volumes','number','min="1" max="100000" step="1"')+field('weightKg','Peso total (kg)','number','min="0.001" max="1000000" step="0.001"')+field('goodsValue','Valor declarado da mercadoria (R$)','text','inputmode="decimal" maxlength="12" placeholder="Ex.: 100,00"')+'<label class="wide">Descrição fictícia<textarea name="description" maxlength="400" required></textarea></label></div><button class="primary" type="submit">Solicitar cotação · teste</button><p class="fine">Peso, volumes e valor declarado não calculam o frete. A transportadora fará a análise manual.</p></form></section>':'<div class="tip horizontal"><strong>Resposta manual da transportadora</strong><p>Informe o valor final, as condições e a validade. Prazo estimado não é compromisso de entrega. Ainda precisamos validar tarifas, cubagem, impostos, adicionais, seguros e regras de aprovação antes de automatizar preços.</p></div>')+
    '<div class="section-title"><h2>'+(side==='client'?'Minhas cotações fictícias':'Solicitações da unidade')+'</h2><span>'+rows.length+' no exemplo</span></div><div class="quote-list">'+rows.map(q=>{
      const state=quoteStatus(q,new Date().toISOString()),p=q.proposal;
      return '<article class="card quote-card"><div class="section-title"><div><p class="eyebrow">'+esc(q.code)+' / '+unit(q.branchId)+'</p><h3>'+esc(q.clientName)+'</h3></div><span class="status '+(state==='accepted'?'delivered':state==='expired'?'blocked':'received')+'">'+names[state]+'</span></div><p><strong>'+esc(q.origin)+' → '+esc(q.destination)+'</strong></p><p>'+q.volumes+' volumes · '+q.weightKg+' kg · Mercadoria declarada: '+money(q.goodsValueCents)+'</p><p>'+esc(q.description)+'</p>'+
        (p?'<div class="proposal-summary"><h3>Proposta da transportadora</h3><strong class="freight-value">'+money(p.freightCents)+'</strong><p>Prazo estimado: '+p.estimatedDays+' dias corridos · Validade: '+esc(date(p.validUntil))+'</p><p>'+esc(p.terms)+'</p><small>'+esc(p.source)+'</small></div>':'')+
        (side==='administrative'&&state==='requested'?'<form data-proposal="'+esc(q.id)+'"><div class="form-grid">'+field('freight','Frete total proposto (R$)','text','inputmode="decimal" maxlength="12" placeholder="Valor definido pela transportadora"')+field('estimatedDays','Prazo estimado (dias corridos)','number','min="1" max="365" step="1"')+field('validUntil','Válida até','datetime-local')+'<label class="wide">Condições da proposta<textarea name="terms" maxlength="500" required placeholder="Informe condições e o que está incluído no valor. Use apenas dados fictícios."></textarea></label></div><button class="primary" type="submit">Registrar proposta · teste</button></form>':'')+
        (side==='client'&&state==='proposed'?'<div class="quote-actions"><button type="button" class="primary" data-decision="accepted" data-quote="'+esc(q.id)+'">Aceitar proposta · teste</button><button type="button" class="secondary" data-decision="declined" data-quote="'+esc(q.id)+'">Recusar · teste</button></div>':'')+
        '<details><summary>Histórico da cotação</summary><ol class="timeline">'+q.history.map(h=>'<li><strong>'+esc(names[h.event])+'</strong><p>'+esc(h.detail)+'</p><small>'+esc(date(h.at))+' · Perfil: '+(h.role==='client'?'cliente':'administrativo')+'</small></li>').join('')+'</ol></details><p class="fine">Aceite de teste não agenda coleta, não registra pagamento e não gera faturamento.</p></article>';
    }).join('')+(rows.length?'':'<div class="card empty">Nenhuma cotação neste perfil e contexto. Faça uma solicitação fictícia no perfil cliente.</div>')+'</div><p class="form-error" id="quote-error" role="alert"></p>';
  const repaint=()=>mountQuotes(root,{branch,notify});
  const error=e=>{const el=root.querySelector('#quote-error');el.textContent=e.message;el.scrollIntoView({block:'nearest'});};
  root.querySelector('#quote-side').addEventListener('change',e=>{side=e.target.value;repaint();});
  root.querySelector('#quote-client')?.addEventListener('change',e=>{clientId=e.target.value;repaint();});
  root.querySelector('#quote-admin-branch')?.addEventListener('change',e=>{adminBranch=e.target.value;repaint();});
  root.querySelectorAll('form').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();e.stopPropagation();const values=Object.fromEntries(new FormData(form));
    try{
      if(form.id==='quote-request'){
        const id=crypto.randomUUID(),q=requestQuote({...values,id,code:'COT-'+id.slice(0,8).toUpperCase(),companyId:demoCompany,at:new Date().toISOString()},actor);quotes=[q,...quotes];
      }else{
        const q=quotes.find(q=>q.id===form.dataset.proposal);if(!rows.includes(q))throw new Error('Cotação fora do contexto selecionado.');
        const next=proposeQuote(q,{...values,validUntil:values.validUntil?new Date(values.validUntil).toISOString():'',at:new Date().toISOString()},actor);quotes=quotes.map(q=>q.id===next.id?next:q);
      }
      repaint();notify('Cotação de exemplo atualizada. Nenhum envio ou cobrança.');
    }catch(e){error(e);}
  }));
  root.querySelectorAll('[data-decision]').forEach(b=>b.addEventListener('click',()=>{
    try{const q=rows.find(q=>q.id===b.dataset.quote),next=respondQuote(q,{decision:b.dataset.decision,at:new Date().toISOString()},actor);quotes=quotes.map(q=>q.id===next.id?next:q);repaint();notify('Resposta registrada somente no exemplo. Nenhuma coleta ou cobrança criada.');}catch(e){error(e);}
  }));
}
