import {mountPending,mountIssuePriorities} from './pending.mjs';
import {mountCommercial} from './commercial.mjs';
import {mountFreight} from './freight.mjs';
import {mountAdministrativeArea} from './admin-area.mjs';
import {mountCustomers} from './customers.mjs';
import {managementMarkup,mountManagementNavigation} from './management.mjs';
import {loginScreen,onboardingScreen} from './access.mjs';
import {mountOverview} from './overview.mjs';
import {mountListTools,createNotifier} from './view-tools.mjs';
import {operationTabs,operationPanelId,collectionTasks,selectOperationPanel} from './navigation.mjs';
import {mountTeam} from './team.mjs';
import {mountCollections} from './collections.mjs';
import {mountRelations} from './relations.mjs';
import {mountInternalChat} from './internal-chat.mjs';
const root=document.getElementById('operation'),notice=document.getElementById('operation-notice');
const notify=createNotifier(notice),listStates=new Map();let workspaceSnapshot='',workspaceDirty=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let workspace=null,companyId='',configured=false,busy=false,mode='local',activeTab='',adminView='home';
async function request(path,data){
  const response=await fetch('/api/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(path==='documents'?60000:15000)});
  const result=await response.json();if(!response.ok){if(response.status===401)workspace=null;const error=Error(result.error??'Serviço indisponível.');error.status=response.status;error.code=result.code;throw error;}return result;
}
const field=(name,label,attrs='')=>'<label>'+label+'<input name="'+name+'" required '+attrs+'></label>';
function render(){
  document.body.classList.toggle('operation-authenticated',Boolean(configured&&workspace?.companies?.some(c=>c.active)));
  document.body.classList.toggle('operation-login',Boolean(configured&&!workspace));
  const base='<p class="eyebrow">DISTRIHUB LOGÍSTICA / OPERAÇÃO</p><h1>Sua operação, em um só lugar.</h1>';
  if(!configured){root.innerHTML=base+'<section class="card"><span class="badge">Operação bloqueada</span><h2>Ambiente ainda não configurado</h2><p>Configure o banco próprio da logística para acessar a operação.</p></section>';return;}
  if(!workspace){root.innerHTML=loginScreen();return;}
  const companies=workspace.companies.filter(c=>c.active);
  if(!companies.some(c=>c.id===companyId))companyId=companies[0]?.id??'';
  if(!companies.length){
    companyId='';
    root.innerHTML=onboardingScreen(workspace.user.email);
    void mountTeam(root.querySelector('[data-access-team]'),{request,companyId:'',owner:false,branchList:[],reload,run,notify});
    void mountRelations(root.querySelector('[data-access-portal]'),{request,companyId:'',membership:null,run,reload,notify});
    return;
  }
  const membership=workspace.memberships.find(m=>m.company_id===companyId&&m.active),owner=membership?.role==='owner',admin=['owner','administrative','manager'].includes(membership?.role);
  const branches=workspace.branches.filter(b=>b.company_id===companyId),activeBranches=branches.filter(b=>b.active);
  const branchSelect=(shared=false)=>'<label>Filial<select name="branch_id" required>'+(shared&&owner?'<option value="">Compartilhado na empresa</option>':'')+activeBranches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label>';
  const list=(kind,label)=>'<h3>'+label+'</h3>'+workspace[kind].filter(r=>r.company_id===companyId).map(r=>'<div class="operation-list" data-search-row><strong>'+esc(r.name??r.identifier)+'</strong><small> · '+esc(kind==='branches'?'Filial':r.branch_id==null?'Compartilhado na empresa':branches.find(b=>b.id===r.branch_id)?.name??'Filial vinculada')+(r.active?'':' · Inativo')+'</small></div>').join('');
  root.innerHTML=base+'<div class="tip horizontal"><strong>Ambiente de teste · acesso restrito</strong><p>Cadastros, equipe, coletas, portal, documentos e chat usam o ambiente separado de homologação. Cotações, faturamento e despesas estão disponíveis no menu principal.</p></div>'+
    '<div class="filters"><p>Conectado: '+esc(workspace.user.email)+'</p><button type="button" class="secondary" id="operation-refresh">Atualizar dados</button><button type="button" class="secondary" id="operation-logout">Sair</button></div>'+
    (companies.length?'<label>Transportadora<select id="operation-company">'+companies.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===companyId?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><p>Papel neste vínculo: <strong>'+esc(membership?.role??'sem vínculo ativo')+'</strong>. Permissões são revalidadas no banco.</p>':'<section class="card"><h2>Criar sua transportadora</h2><p>Somente identidade com e-mail confirmado. Uma empresa própria por usuário; funcionário não recebe acesso automático a outras empresas.</p><form id="operation-company-create"><div class="form-grid">'+field('name','Nome da transportadora','maxlength="120" minlength="2"')+field('branch','Primeira filial','maxlength="120" minlength="2"')+'</div><button class="primary">Criar empresa e filial</button></form></section>')+
    (companyId?'<section class="card" data-operation-panel="branches">'+list('branches','Filiais')+(owner?'<form data-record="branches"><div class="form-grid">'+field('name','Nova filial','minlength="2" maxlength="120"')+'</div><button class="secondary">Cadastrar filial</button></form>':'')+'</section><section class="card" data-operation-panel="customers">'+list('customers','Clientes')+(admin?'<form data-record="customers"><div class="form-grid">'+field('name','Nome do cliente','minlength="2" maxlength="120"')+branchSelect(true)+'</div><button class="secondary">Cadastrar cliente</button></form>':'')+'</section><section class="card" data-operation-panel="vehicles">'+list('vehicles','Veículos')+(admin&&activeBranches.length?'<form data-record="vehicles"><div class="form-grid">'+field('identifier','Identificador do veículo','minlength="2" maxlength="40"')+branchSelect()+field('capacity_volumes','Capacidade em volumes','type="number" min="1" max="100000" step="1"')+'</div><button class="secondary">Cadastrar veículo</button></form>':'')+'</section><p class="fine">Listagem inicial limitada a '+workspace.limit+' registros por cadastro. Use o menu lateral para acessar equipe, coletas, portal, documentos e chat conforme seu perfil. Cobranças e edição dos demais cadastros permanecem pendentes.</p>':'');
  const customerRoot=root.querySelector('[data-operation-panel="customers"]');
  const commercialControllers=new Map();
  if(admin)for(const kind of ['quotes','finance','income','expense']){
    const panel=document.createElement('div');panel.dataset.operationPanel=kind;root.append(panel);
    commercialControllers.set(kind,mountCommercial(panel,{request,companyId,userId:workspace.user.id,kind,branches,customers:workspace.customers.filter(c=>c.company_id===companyId),notify}));
  }
  if(customerRoot)void mountCustomers(customerRoot,{request,companyId,membership,branches,reload,run,notify});
  root.insertAdjacentHTML('beforeend',managementMarkup({workspace,companyId,membership,mode}));
  const teamRoot=document.createElement('div');teamRoot.dataset.operationPanel='team';root.append(teamRoot);
  void mountTeam(teamRoot,{request,companyId,owner,branchList:branches,reload,run,notify});
  let collectionsReady=Promise.resolve(null),freightReady=Promise.resolve(null),pendingReady=Promise.resolve(null),prioritiesReady=Promise.resolve(null);
  if(admin){const pendingRoot=document.createElement('div');pendingRoot.dataset.operationPanel='pending';root.append(pendingRoot);pendingReady=mountPending(pendingRoot,{request,companyId,branches,onOpenCargo:id=>void navigateTo('cargos',{cargoId:id})});}
  if(admin){const freightRoot=document.createElement('div');freightRoot.dataset.operationPanel='cargos';root.append(freightRoot);freightReady=mountFreight(freightRoot,{request,companyId,membership,customers:workspace.customers,branches,run,reload,notify});}
  if(['owner','administrative','manager','driver','collector'].includes(membership?.role)){
    const collectionsRoot=document.createElement('div');collectionsRoot.dataset.operationPanel='collections';root.append(collectionsRoot);
    collectionsReady=mountCollections(collectionsRoot,{request,companyId,membership,branchList:branches,customers:workspace.customers,vehicles:workspace.vehicles,reload,run,notify,companyName:companies.find(c=>c.id===companyId)?.name,onOpenCargo:id=>{setTimeout(()=>void navigateTo('cargos',{cargoId:id}),0);}});
  }
  const relationsRoot=document.createElement('div');relationsRoot.dataset.operationPanel='relations';root.append(relationsRoot);
  void mountRelations(relationsRoot,{request,companyId,membership,run,reload,notify});
  const chatRoot=document.createElement('div');chatRoot.dataset.operationPanel='chat';root.append(chatRoot);
  mountInternalChat(chatRoot,{request,companyId,membership,branchList:branches,run,notify});
  const tabs=operationTabs(membership?.role,Boolean(companyId));
  if(!tabs.some(([id])=>id===activeTab))activeTab=tabs[0][0];
  const layout=document.createElement('div');layout.className='operation-layout';
  const overview=document.createElement('div');overview.dataset.operationPanel='overview';
  const panels=document.createElement('div');panels.className='operation-panels';
  const controls=[];
  for(const node of Array.from(root.children)){
    if(node.matches('.filters')){node.classList.add('operation-account');controls.push(node);}
    else if(node.dataset.operationPanel)panels.append(node);else overview.append(node);
  }
  panels.prepend(overview);
  overview.querySelector(':scope > .eyebrow')?.remove();
  overview.querySelector(':scope > h1')?.remove();
  const environment=overview.querySelector(':scope > .tip');
  if(environment){environment.classList.add('operation-environment');environment.innerHTML='<details><summary>Ambiente de teste · acesso restrito</summary><p>Operação online em ambiente separado. Acesse os módulos pelo menu principal.</p></details>';}
  overview.querySelector(':scope > p:not(.fine)')?.remove();
  overview.querySelector(':scope > .fine')?.remove();
  if(!['owner','administrative','manager','driver','collector','client'].includes(membership?.role))overview.insertAdjacentHTML('beforeend','<section class="card"><h2>Sem acesso operacional</h2><p>Nenhum perfil ativo autorizado nesta transportadora. Consulte seus convites ou solicite a revis\u00e3o do acesso.</p></section>');
  panels.querySelectorAll('[data-operation-panel]').forEach(panel=>{
    panel.id='operation-panel-'+panel.dataset.operationPanel;panel.tabIndex=-1;
    panel.hidden=!tabs.some(([id])=>operationPanelId(id)===panel.dataset.operationPanel);
  });
  const sidebar=document.createElement('aside');sidebar.className='operation-sidebar';
  sidebar.innerHTML='<details open><summary>Menu de módulos</summary><nav aria-label="Módulos da operação">'+tabs.map(([id,label])=>'<button type="button" data-operation-tab="'+id+'" aria-controls="operation-panel-'+operationPanelId(id)+'">'+label+'</button>').join('')+'</nav></details>';
  sidebar.insertAdjacentHTML('afterbegin','<a class="operation-wordmark" href="/operacao/"><strong>DistriHub</strong><span>Logística</span></a><p class="operation-role">'+esc(({owner:'Central de operações',administrative:'Administração',manager:'Gerência',driver:'Motorista',collector:'Coletor',client:'Portal do cliente'})[membership?.role]??'Acesso restrito')+'</p>');
  const icons={overview:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',collections:'M1 5h14v12H1ZM15 9h4l4 4v4h-8M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',receiving:'m12 2 10 5-10 5L2 7Zm-10 5v10l10 5 10-5V7M12 12v10',cargos:'m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',pending:'M12 3 2 21h20ZM12 9v5M12 17v1',administrative:'M4 5h16v16H4ZM8 2v6M16 2v6M4 11h16M9 15h6',relations:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h8',chat:'M3 3h18v14H9l-6 4Z'};
  sidebar.querySelectorAll('[data-operation-tab]').forEach(button=>button.insertAdjacentHTML('afterbegin','<svg class="operation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[button.dataset.operationTab]??'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 12h8')+'"/></svg>'));
  sidebar.querySelector('details').open=window.innerWidth>850;
  // Keep account and company context available in every operational task.
  const account=document.createElement('div');account.className='operation-workspace-bar';account.append(...controls);
  const companyControl=overview.querySelector('#operation-company')?.closest('label');if(companyControl)account.prepend(companyControl);
  layout.append(sidebar,panels);root.append(account,layout);
  for(const kind of ['branches','vehicles']){
    const container=panels.querySelector('[data-operation-panel="'+kind+'"]');
    if(container){const key=companyId+':'+kind;if(!listStates.has(key))listStates.set(key,{term:'',page:1});mountListTools(container,{state:listStates.get(key),label:kind==='branches'?'filiais':kind==='customers'?'clientes':'veículos'});}
  }
  if(companyId&&admin){
    const metrics=document.createElement('section');metrics.className='metrics';metrics.setAttribute('aria-label','Indicadores dos cadastros carregados');
    const counts=['branches','customers','vehicles'].map(kind=>workspace[kind].filter(row=>row.company_id===companyId&&row.active).length);
    const max=Math.max(1,...counts);
    metrics.innerHTML=counts.map((count,i)=>'<article><span>'+['Filiais ativas','Clientes ativos','Veículos ativos'][i]+'</span><strong>'+count+'</strong><meter min="0" max="'+max+'" value="'+count+'" aria-label="'+['Filiais','Clientes','Veículos'][i]+'">'+count+'</meter><small>Nos registros carregados</small></article>').join('');overview.append(metrics);
    if(admin){const priorities=document.createElement('div');overview.append(priorities);prioritiesReady=mountIssuePriorities(priorities,{request,companyId,onOpenCargo:id=>void navigateTo('cargos',{cargoId:id})});}
    const summary=document.createElement('div');overview.insertBefore(summary,metrics);
    void mountOverview(summary,{request,companyId,membership,branchList:branches,onNavigate:(id,options)=>navigateTo(id,options)});
  }
  const administrativeArea=mountAdministrativeArea(panels,{role:membership?.role,selected:adminView,onSelect:id=>{adminView=id;},canNavigate:()=>!busy});
  const navigateTo=async(id,options={})=>{
    if(busy||!layout.isConnected)return;
    const managementIds=['home','customers','branches','vehicles','team','settings'];
    if(administrativeArea&&managementIds.includes(id)){
      if(administrativeArea.select(id)){activeTab='administrative';selectOperationPanel(layout,activeTab);}return;
    }
    if(id==='summary')id='overview';
    if(!tabs.some(([key])=>key===id))return;
    if(commercialControllers.has(id))await commercialControllers.get(id).show();
    if(id==='overview')await (await prioritiesReady)?.show();
    if(id==='pending')await (await pendingReady)?.show();
    if(id==='cargos'){const controller=await freightReady;if(!layout.isConnected||!controller)return;if(options.cargoId){if(!await controller.open(options.cargoId))return;}else await controller.show();}
    if(collectionTasks.includes(id)){
      const controller=await collectionsReady;
      if(!layout.isConnected||busy||!controller)return;
      if(!await controller.setTask(id,options))return;
    }
    if(selectOperationPanel(layout,id)){
      activeTab=id;panels.querySelector('[data-operation-panel="'+operationPanelId(id)+'"]').focus({preventScroll:true});
    }
  };
  mountManagementNavigation(panels,navigateTo);
  selectOperationPanel(layout,activeTab);
  if(commercialControllers.has(activeTab))void commercialControllers.get(activeTab).show();
  if(collectionTasks.includes(activeTab))void collectionsReady.then(controller=>controller?.setTask(activeTab));
  sidebar.addEventListener('click',event=>{
    const button=event.target.closest('[data-operation-tab]');if(button)void navigateTo(button.dataset.operationTab).then(()=>{if(window.innerWidth<=850)sidebar.querySelector('details').open=false;});
  });
}
window.addEventListener('resize',()=>{if(window.innerWidth>850)root.querySelector('.operation-sidebar details')?.setAttribute('open','');});
async function reload(force=true){const next=await request('workspace');const signature=JSON.stringify(next);workspace=next;if(!force&&signature===workspaceSnapshot)return;workspaceSnapshot=signature;workspaceDirty=false;render();}
async function run(action){if(busy)return;busy=true;notify('');const locks=new Map(Array.from(root.querySelectorAll('button'),button=>[button,button.disabled]));root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(e){notify(e.name==='TimeoutError'?'Serviço sem resposta. Confira a conexão antes de repetir.':e.message,{error:true});if(!workspace)render();}finally{busy=false;for(const [button,disabled] of locks)if(button.isConnected)button.disabled=disabled;}}
root.addEventListener('submit',e=>{e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));run(async()=>{
  if(form.id==='operation-login'){await request('login',values);form.reset();await reload();notify('Acesso realizado.');}
  else if(form.id==='operation-company-create'){await request('company',values);await reload();notify('Configura\u00e7\u00e3o conclu\u00edda. Continue pelos cadastros da sua transportadora.');}
  else if(form.dataset.record){await request('records',{...values,kind:form.dataset.record,company_id:companyId});await reload();notify('Cadastro salvo.');}
});});
root.addEventListener('change',e=>{if(e.target.id==='operation-company'){if(workspaceDirty||root.querySelector('[data-has-draft="true"]')){e.target.value=companyId;notify('Salve ou cancele o cadastro antes de trocar de empresa.',{error:true});return;}companyId=e.target.value;adminView='home';activeTab='';render();}});
root.addEventListener('click',e=>{if(e.target.id==='operation-refresh'){if(workspaceDirty||root.querySelector('[data-has-draft="true"]'))notify('Salve o cadastro em edição antes de atualizar.',{error:true});else run(async()=>{await reload(false);notify('Dados atualizados.');});}if(e.target.id==='operation-logout')run(async()=>{try{await request('logout',{});}finally{workspace=null;companyId='';workspaceSnapshot='';workspaceDirty=false;listStates.clear();adminView='home';activeTab='overview';render();}});});
try{const status=await request('status');configured=status.configured;mode=status.mode;if(configured){try{await reload();}catch(e){if(!workspace)render();if(e.status!==401)notify(e.message,{error:true});}}else render();}catch{render();notice.textContent='Não foi possível consultar a configuração local.';}

root.addEventListener('input',event=>{if(event.target.closest('form[data-record]'))workspaceDirty=true;});
