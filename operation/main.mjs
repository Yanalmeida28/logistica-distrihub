import {mountTeam} from './team.mjs';
import {mountCollections} from './collections.mjs';
import {mountRelations} from './relations.mjs';
import {mountInternalChat} from './internal-chat.mjs';
const root=document.getElementById('operation'),notice=document.getElementById('operation-notice');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let workspace=null,companyId='',configured=false,busy=false,mode='local';
async function request(path,data){
  const response=await fetch('/api/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(path==='documents'?60000:15000)});
  const result=await response.json();if(!response.ok){if(response.status===401)workspace=null;throw Error(result.error??'Serviço indisponível.');}return result;
}
const field=(name,label,attrs='')=>'<label>'+label+'<input name="'+name+'" required '+attrs+'></label>';
function render(){
  const base='<p class="eyebrow">DISTRIHUB LOGÍSTICA / OPERAÇÃO</p><h1>Uma base separada para sua transportadora.</h1>';
  if(!configured){root.innerHTML=base+'<section class="card"><span class="badge">Operação bloqueada</span><h2>Supabase local ainda não configurado</h2><p>Nenhum banco externo é acessado. Esta área exige o projeto local próprio, a migration de fundação e usuários do Auth. Não usa os dados da demonstração nem recursos do DistriHub.</p><p>Consulte docs/BASE_OPERACIONAL.md para preparar o ambiente. Não informe senhas ou chaves no chat.</p><a class="secondary" href="/app/">Continuar na demonstração</a></section>';return;}
  if(!workspace){root.innerHTML=base+'<section class="card login-card"><h2>Entrar no ambiente de teste</h2><p>Use sua conta do ambiente de teste. Não há usuário padrão, seleção de papel ou acesso demonstrativo nesta área.</p><form id="operation-login">'+field('email','E-mail','type="email" maxlength="254" autocomplete="username"')+field('password','Senha','type="password" maxlength="1024" autocomplete="current-password"')+'<button class="primary">Entrar</button></form><p class="fine">A sessão fica em cookie HttpOnly e no servidor local; os tokens não são entregues ao JavaScript. Reiniciar o servidor encerra as sessões desta área.</p></section>';return;}
  const companies=workspace.companies.filter(c=>c.active);
  if(!companies.some(c=>c.id===companyId))companyId=companies[0]?.id??'';
  const membership=workspace.memberships.find(m=>m.company_id===companyId&&m.active),owner=membership?.role==='owner',admin=['owner','administrative'].includes(membership?.role);
  const branches=workspace.branches.filter(b=>b.company_id===companyId),activeBranches=branches.filter(b=>b.active);
  const branchSelect=(shared=false)=>'<label>Filial<select name="branch_id" required>'+(shared&&owner?'<option value="">Compartilhado na empresa</option>':'')+activeBranches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label>';
  const list=(kind,label)=>'<h3>'+label+'</h3>'+workspace[kind].filter(r=>r.company_id===companyId).map(r=>'<div class="operation-list"><strong>'+esc(r.name??r.identifier)+'</strong><small> · '+esc(kind==='branches'?'Filial':r.branch_id==null?'Compartilhado na empresa':branches.find(b=>b.id===r.branch_id)?.name??'Filial vinculada')+(r.active?'':' · Inativo')+'</small></div>').join('');
  root.innerHTML=base+'<div class="tip horizontal"><strong>Ambiente de teste · acesso restrito</strong><p>Estes cadastros usam a API e as permissões reais do banco configurado. Coletas, vendas de frete, portal, chat, despesas e WhatsApp da demonstração ainda não usam esta base. Nenhum dado demonstrativo é importado.</p></div>'+
    '<div class="filters"><p>Conectado: '+esc(workspace.user.email)+'</p><button type="button" class="secondary" id="operation-refresh">Atualizar dados</button><button type="button" class="secondary" id="operation-logout">Sair</button></div>'+
    (companies.length?'<label>Transportadora<select id="operation-company">'+companies.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===companyId?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><p>Papel neste vínculo: <strong>'+esc(membership?.role??'sem vínculo ativo')+'</strong>. Permissões são revalidadas no banco.</p>':'<section class="card"><h2>Criar sua transportadora</h2><p>Somente identidade com e-mail confirmado. Uma empresa própria por usuário; funcionário não recebe acesso automático a outras empresas.</p><form id="operation-company-create"><div class="form-grid">'+field('name','Nome da transportadora','maxlength="120" minlength="2"')+field('branch','Primeira filial','maxlength="120" minlength="2"')+'</div><button class="primary">Criar empresa e filial</button></form></section>')+
    (companyId?'<section class="card">'+list('branches','Filiais')+(owner?'<form data-record="branches"><div class="form-grid">'+field('name','Nova filial','minlength="2" maxlength="120"')+'</div><button class="secondary">Cadastrar filial</button></form>':'')+'</section><section class="card">'+list('customers','Clientes')+(admin?'<form data-record="customers"><div class="form-grid">'+field('name','Nome do cliente','minlength="2" maxlength="120"')+branchSelect(true)+'</div><button class="secondary">Cadastrar cliente</button></form>':'')+'</section><section class="card">'+list('vehicles','Veículos')+(admin&&activeBranches.length?'<form data-record="vehicles"><div class="form-grid">'+field('identifier','Identificador do veículo','minlength="2" maxlength="40"')+branchSelect()+field('capacity_volumes','Capacidade em volumes','type="number" min="1" max="100000" step="1"')+'</div><button class="secondary">Cadastrar veículo</button></form>':'')+'</section><p class="fine">Listagem inicial limitada a '+workspace.limit+' registros por cadastro. Equipe, coletas, portal, documentos e chat foram preparados em módulos próprios abaixo; exigem suas migrations e homologação. Cobranças e edição dos demais cadastros permanecem pendentes.</p>':'');
  const teamRoot=document.createElement('div');root.append(teamRoot);
  void mountTeam(teamRoot,{request,companyId,owner,branchList:branches,reload,run});
  if(['owner','administrative','driver','collector'].includes(membership?.role)){
    const collectionsRoot=document.createElement('div');root.append(collectionsRoot);
    void mountCollections(collectionsRoot,{request,companyId,membership,branchList:branches,customers:workspace.customers,vehicles:workspace.vehicles,reload,run});
  }
  const relationsRoot=document.createElement('div');root.append(relationsRoot);
  void mountRelations(relationsRoot,{request,companyId,membership,run,reload});
  const chatRoot=document.createElement('div');root.append(chatRoot);
  mountInternalChat(chatRoot,{request,companyId,membership,branchList:branches,run});
}
async function reload(){workspace=await request('workspace');render();}
async function run(action){if(busy)return;busy=true;notice.textContent='';root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(e){notice.textContent=e.name==='TimeoutError'?'Serviço sem resposta. Confira o ambiente local.':e.message;if(!workspace)render();}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}}
root.addEventListener('submit',e=>{e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));run(async()=>{
  if(form.id==='operation-login'){await request('login',values);form.reset();await reload();}
  else if(form.id==='operation-company-create'){await request('company',values);await reload();}
  else if(form.dataset.record){await request('records',{...values,kind:form.dataset.record,company_id:companyId});await reload();notice.textContent='Cadastro salvo no banco de teste.';}
});});
root.addEventListener('change',e=>{if(e.target.id==='operation-company'){companyId=e.target.value;render();}});
root.addEventListener('click',e=>{if(e.target.id==='operation-refresh')run(reload);if(e.target.id==='operation-logout')run(async()=>{try{await request('logout',{});}finally{workspace=null;companyId='';render();}});});
try{const status=await request('status');configured=status.configured;mode=status.mode;if(configured){try{await reload();}catch(e){if(!workspace)render();notice.textContent=e.message;}}else render();}catch{render();notice.textContent='Não foi possível consultar a configuração local.';}
