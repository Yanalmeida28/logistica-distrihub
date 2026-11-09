const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states={pending:'Aguardando coleta',assigned:'Coleta atribuída',accepted:'Coleta aceita',in_progress:'Coleta em andamento',collected:'Coletada no cliente',received:'Recebida na central',collect:'Coleta confirmada',receive:'Recebimento confirmado',shipped:'Embarque confirmado',destination:'Chegada ao destino',out_for_delivery:'Saiu para entrega',delivered:'Entrega confirmada'};
async function download(companyId,id,filename){
 const response=await fetch('/api/documents',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({company_id:companyId,action:'download',id}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('Download recusado ou documento indisponível.');
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const fileBase64=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('Arquivo não pôde ser lido.'));r.readAsDataURL(file);});
export async function mountRelations(root,{request,companyId,membership,run,reload,notify=()=>{},resource=null}){
 const admin=['owner','administrative','manager'].includes(membership?.role),client=membership?.role==='client';
 let orderId=resource?.order_id??resource?.cargo_id??'',downloads=new Map(),uploadKey=crypto.randomUUID();
 const resourcePayload=()=>resource??{order_id:orderId};
 root.innerHTML='<section class="card"><h2>Portal e documentos</h2><p>Carregando…</p></section>';
 try{
  const incoming=(await request('portal',{action:'incoming'})).result;
  if(!root.isConnected)return;
  root.innerHTML='<section class="card"><h2>Convites do portal do cliente</h2>'+incoming.map(i=>'<p>'+esc(i.company_name)+' · até '+esc(new Date(i.expires_at).toLocaleDateString('pt-BR'))+' <button type="button" data-client-accept="'+esc(i.id)+'" data-company="'+esc(i.company_id)+'">Aceitar acesso à carga</button></p>').join('')+(incoming.length?'':'<p>Nenhum convite pendente para seu e-mail confirmado.</p>')+'</section>';
  if(client&&companyId){
   const orders=(await request('portal',{company_id:companyId,action:'list'})).result;
   if(!root.isConnected)return;
   root.innerHTML+='<section class="card"><h2>Minhas cargas</h2><p>Somente cargas explicitamente liberadas ao seu contato. Até 100 cargas recentes.</p>'+orders.map(o=>'<article class="card"><h3>Carga / OS '+esc(o.id.slice(0,8))+'</h3><p><strong>'+esc(states[o.status]??o.status)+'</strong> · '+o.volumes+' volumes</p><p>Destino: '+esc(o.destination)+'</p><details><summary>Acompanhamento</summary>'+o.events.map(e=>'<p>'+esc(states[e.action]??'Atualização confirmada')+' · '+esc(new Date(e.at).toLocaleString('pt-BR'))+'</p>').join('')+'</details><h4>Documentos liberados</h4>'+o.documents.map(d=>{downloads.set(d.id,d.filename);return '<p>'+esc(d.filename)+' · '+Math.ceil(d.byte_size/1024)+' KB <button type="button" data-document-download="'+esc(d.id)+'">Baixar</button></p>';}).join('')+(o.documents.length?'':'<p>Nenhum documento liberado.</p>')+'</article>').join('')+(orders.length?'':'<p>Nenhuma carga liberada. Solicite autorização à central.</p>')+'</section>';
  }
  if(admin&&companyId&&resource){root.innerHTML='<section class="card"><h2>Documentos e portal desta carga</h2><div data-relation-detail></div></section>';}
  else if(admin&&companyId){
   const data=(await request('collections',{company_id:companyId,action:'list'})).result;
   if(!root.isConnected)return;
   root.innerHTML+='<section class="card"><h2>Documentos e acesso do cliente</h2><label>Carga / OS<select data-relation-order><option value="">Selecione</option>'+data.orders.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.id.slice(0,8))+' · '+esc(o.destination)+'</option>').join('')+'</select></label><div data-relation-detail></div></section>';
  }
 }catch{if(root.isConnected)root.innerHTML='<section class="card"><h2>Portal e documentos indisponíveis</h2><p>Instale as migrations próprias no ambiente separado e valide seu acesso. Não usamos dados da demonstração.</p></section>';return;}
 async function detail(){
  const panel=root.querySelector('[data-relation-detail]');if(!panel)return;if(!orderId){panel.innerHTML='';return;}
  const selected=orderId;
  const [access,docs]=await Promise.all([request('portal',{company_id:companyId,action:'manage',...resourcePayload()}),request('documents',{company_id:companyId,action:'list',...resourcePayload()})]);
  if(!root.isConnected||selected!==orderId)return;
  downloads=new Map(docs.result.filter(d=>d.state==='ready').map(d=>[d.id,d.filename]));
  panel.innerHTML='<h3>Convidar contato do cliente</h3><p>A autorização vale somente para esta carga/OS. Convite por sete dias, sem envio automático de e-mail. O contato entra com conta de e-mail confirmado para aceitar.</p><form data-relation="invite"><label>E-mail<input name="email" type="email" required maxlength="254"></label><button>Convidar cliente</button></form>'+access.result.invites.map(i=>'<p>'+esc(i.email)+' <button type="button" data-invite-revoke="'+esc(i.id)+'">Revogar convite</button></p>').join('')+'<h3>Contatos autorizados</h3>'+access.result.grants.map(g=>'<p>'+esc(g.email)+' <button type="button" data-client-revoke="'+esc(g.membership_id)+'">Revogar acesso à carga</button></p>').join('')+
   '<h3>Anexar documento privado</h3><p>PDF, PNG ou JPG de até 5 MB. O anexo não comprova pagamento nem validade fiscal. Fica privado até liberação individual. Não há antivírus integrado.</p><form data-relation="upload"><label>Arquivo<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required></label><button>Anexar privadamente</button></form>'+docs.result.map(d=>'<article class="operation-list"><strong>'+esc(d.filename)+'</strong> · '+(d.state==='ready'?'Disponível':'Upload pendente')+(d.state==='ready'?' <button type="button" data-document-download="'+esc(d.id)+'">Baixar</button>':'')+' <button type="button" data-document-revoke="'+esc(d.id)+'">Revogar documento</button>'+(d.state==='ready'?access.result.grants.map(g=>'<p>'+esc(g.email)+' <button type="button" data-document-share="'+esc(d.id)+'" data-member="'+esc(g.membership_id)+'" data-share-action="'+(d.shared_with.includes(g.membership_id)?'unshare':'share')+'">'+(d.shared_with.includes(g.membership_id)?'Retirar documento':'Liberar documento')+'</button></p>').join(''):'')+'</article>').join('');
 }
 root.addEventListener('change',e=>{if(e.target.matches('[data-relation-order]')){orderId=e.target.value;uploadKey=crypto.randomUUID();root.querySelector('[data-relation-detail]').innerHTML='';run(detail);}});
 root.addEventListener('submit',e=>{const f=e.target;if(!f.dataset.relation)return;e.preventDefault();e.stopPropagation();run(async()=>{
  if(f.dataset.relation==='invite')await request('portal',{company_id:companyId,action:'invite',...resourcePayload(),email:new FormData(f).get('email')});
  else{
   const file=f.elements.file.files[0];if(!file||file.size>5*1024*1024||file.size===0)throw Error('Arquivo vazio ou maior que 5 MB.');
   await request('documents',{company_id:companyId,action:'upload',...resourcePayload(),request_id:uploadKey,filename:file.name,mime:file.type,base64:await fileBase64(file)});uploadKey=crypto.randomUUID();
  }
  notify('Alteração confirmada.');await detail();
 });});
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!['clientAccept','documentDownload','inviteRevoke','clientRevoke','documentRevoke','documentShare'].some(k=>b.dataset[k]))return;run(async()=>{
  if(b.dataset.clientAccept){await request('portal',{action:'accept',company_id:b.dataset.company,id:b.dataset.clientAccept});notify('Acesso aceito.');await reload();return;}
  if(b.dataset.documentDownload){await download(companyId,b.dataset.documentDownload,downloads.get(b.dataset.documentDownload)??'documento');return;}
  if(b.dataset.inviteRevoke)await request('portal',{company_id:companyId,...resourcePayload(),action:'revoke_invite',id:b.dataset.inviteRevoke});
  else if(b.dataset.clientRevoke)await request('portal',{company_id:companyId,...resourcePayload(),action:'revoke',membership_id:b.dataset.clientRevoke});
  else if(b.dataset.documentRevoke)await request('documents',{company_id:companyId,...resourcePayload(),action:'revoke',id:b.dataset.documentRevoke});
  else if(b.dataset.documentShare)await request('documents',{company_id:companyId,...resourcePayload(),action:b.dataset.shareAction,id:b.dataset.documentShare,membership_id:b.dataset.member});
  else return;
  await detail();
 });});
 if(resource&&admin)await detail();
}
