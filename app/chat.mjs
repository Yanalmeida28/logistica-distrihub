import {demoEmployees} from './team.mjs';
import {chatContacts,sendInternalMessage,conversation} from './chat-domain.mjs';
import {demoCompany} from './domain.mjs';
let messages=[],actorId='admin-a',recipientId='collector-a';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unit=b=>b==='unidade-a'?'Unidade A':'Unidade B';
export function mountChat(root,{branch,getCargo,notify}){
  const staff=demoEmployees().filter(e=>e.companyId===demoCompany&&e.active&&(branch==='all'||e.branchId===branch));
  const actor=staff.find(e=>e.id===actorId)??staff[0];actorId=actor?.id??'';
  const contacts=chatContacts(actor,staff),recipient=contacts.find(e=>e.id===recipientId)??contacts[0];recipientId=recipient?.id??'';
  const history=conversation(messages,actor,recipient),collector=[actor,recipient].find(e=>['collector','driver'].includes(e?.role));
  const cargos=actor&&recipient?getCargo().filter(c=>c.companyId===actor.companyId&&c.branchId===actor.branchId&&(c.collectorId===collector?.id||c.driverId===collector?.id)):[];
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">CHAT INTERNO / EQUIPE</p><h1>Central e operação na mesma conversa.</h1><p>Simulação local de mensagens por funcionário, unidade e coleta atribuída.</p></div></div>'+
    '<div class="tip horizontal"><strong>Sem envio entre aparelhos</strong><p>Troque o perfil de teste para visualizar os dois lados. As mensagens ficam somente na memória desta página. Não há login, entrega real, notificação push ou sincronização.</p></div>'+
    '<div class="filters team-panels"><label>Simular perfil<select id="chat-actor">'+staff.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===actorId?' selected':'')+'>'+esc(e.name)+' · '+({collector:'Coleta',driver:'Motorista',administrative:'Central'}[e.role])+' · '+unit(e.branchId)+'</option>').join('')+'</select></label><label>Conversa com<select id="chat-recipient">'+contacts.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===recipientId?' selected':'')+'>'+esc(e.name)+'</option>').join('')+'</select></label></div>'+
    '<section class="card chat-panel"><div class="section-title"><h2>'+esc(recipient?.name??'Nenhum contato disponível')+'</h2><span class="badge">Somente teste</span></div><div class="chat-history" role="log" aria-live="polite" aria-label="Histórico fictício da conversa">'+history.map(m=>'<article class="chat-bubble '+(m.senderId===actor.id?'outgoing':'incoming')+'"><strong>'+esc(staff.find(e=>e.id===m.senderId)?.name??'Funcionário do exemplo')+'</strong><p>'+esc(m.body)+'</p>'+(m.cargoId?'<small>Referência: '+esc(getCargo().find(c=>c.id===m.cargoId)?.code??'Carga do exemplo')+'</small>':'')+'<time datetime="'+esc(m.at)+'">'+esc(new Date(m.at).toLocaleString('pt-BR'))+'</time></article>').join('')+(history.length?'':'<p class="empty">Conversa sem mensagens. Envie uma mensagem fictícia para testar.</p>')+'</div>'+
    '<form id="chat-form"><label>Referência de coleta (opcional)<select name="cargoId"><option value="">Sem referência</option>'+cargos.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.code)+'</option>').join('')+'</select></label><label>Mensagem fictícia<textarea name="body" required maxlength="2000" placeholder="Ex.: Confirmei os volumes na origem. Não utilize dados reais."></textarea></label><button class="primary" type="submit"'+(!actor||!recipient?' disabled':'')+'>Enviar na simulação</button><p class="form-error" id="chat-error" role="alert"></p></form></section>';
  const repaint=()=>mountChat(root,{branch,getCargo,notify});
  root.querySelector('#chat-actor').addEventListener('change',e=>{actorId=e.target.value;recipientId='';repaint();});
  root.querySelector('#chat-recipient').addEventListener('change',e=>{recipientId=e.target.value;repaint();});
  const log=root.querySelector('.chat-history');log.scrollTop=log.scrollHeight;
  root.querySelector('#chat-form').addEventListener('submit',e=>{
    e.preventDefault();e.stopPropagation();const form=e.target,values=Object.fromEntries(new FormData(form));
    try{const m=sendInternalMessage({...values,id:crypto.randomUUID(),at:new Date().toISOString()},actor,recipient,getCargo().find(c=>c.id===values.cargoId));messages=[...messages,m];repaint();root.querySelector('[name=body]').focus();notify('Mensagem adicionada ao exemplo local. Nenhum envio externo.');}
    catch(error){root.querySelector('#chat-error').textContent=error.message;}
  });
}
