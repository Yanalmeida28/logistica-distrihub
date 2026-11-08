const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountInternalChat(root,{request,companyId,membership,branchList,run,notify=()=>{}}){
 if(!companyId||!['owner','administrative','driver','collector'].includes(membership?.role))return;
 let branch='',recipient='',key=crypto.randomUUID(),loading=false;
 root.innerHTML='<section class="card"><h2>Chat interno</h2><p>Central ↔ motoristas e coletores da mesma filial. Até 100 mensagens recentes por conversa. Sem anexos ou confirmação de leitura.</p><label>Filial<select data-chat-branch><option value="">Selecione</option>'+branchList.filter(b=>b.active).map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label><label>Conversar com<select data-chat-peer><option value="">Selecione a filial</option></select></label><div data-chat-history role="log" aria-live="polite"></div><form data-chat-form><label>Mensagem<textarea name="body" required maxlength="2000" rows="3"></textarea></label><button>Enviar mensagem interna</button></form><button type="button" data-chat-refresh>Atualizar conversa</button><p data-chat-status role="status"></p></section>';
 async function history(){
  if(!branch||!recipient||loading)return;loading=true;const b=branch,p=recipient;
  try{
   const data=(await request('chat',{company_id:companyId,action:'list',branch_id:b,recipient_id:p})).result;
   if(root.isConnected&&b===branch&&p===recipient){root.querySelector('[data-chat-history]').innerHTML=data.map(m=>'<p><strong>'+(m.sender_id===membership.id?'Você':'Contato')+'</strong> · '+esc(new Date(m.at).toLocaleString('pt-BR'))+'<br>'+esc(m.body)+'</p>').join('')||'<p>Sem mensagens nesta conversa.</p>';root.querySelector('[data-chat-status]').textContent='';}
  }catch{if(root.isConnected){root.querySelector('[data-chat-history]').innerHTML='';root.querySelector('[data-chat-status]').textContent='Conversa indisponível ou acesso revogado.';}}
  finally{loading=false;}
 }
 root.addEventListener('change',e=>{if(e.target.matches('[data-chat-branch]')){
  branch=e.target.value;recipient='';root.querySelector('[data-chat-history]').innerHTML='';const selected=branch;
  run(async()=>{const data=branch?(await request('chat',{company_id:companyId,action:'contacts',branch_id:branch})).result:[];if(selected!==branch||!root.isConnected)return;root.querySelector('[data-chat-peer]').innerHTML='<option value="">Selecione o contato</option>'+data.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>').join('');});
 }else if(e.target.matches('[data-chat-peer]')){recipient=e.target.value;key=crypto.randomUUID();root.querySelector('[data-chat-history]').innerHTML='';run(history);}});
 root.addEventListener('submit',e=>{if(!e.target.matches('[data-chat-form]'))return;e.preventDefault();e.stopPropagation();const form=e.target;run(async()=>{
  if(!branch||!recipient)throw Error('Selecione a filial e o contato.');
  await request('chat',{company_id:companyId,action:'send',branch_id:branch,recipient_id:recipient,request_id:key,body:new FormData(form).get('body')});
  key=crypto.randomUUID();form.reset();notify('Mensagem enviada.');await history();
 });});
 root.addEventListener('click',e=>{if(e.target.closest('[data-chat-refresh]'))run(history);});
 if(globalThis.document){const poll=async()=>{if(!root.isConnected)return;if(!document.hidden&&!root.hidden)await history();setTimeout(poll,10000);};setTimeout(poll,10000);}
}
