export function administrativeSections(role){
  if(!['owner','administrative'].includes(role))return [];
  return [['home','Gest\u00e3o da transportadora'],['customers','Clientes'],['branches','Filiais'],['vehicles','Ve\u00edculos'],...(role==='owner'?[['team','Equipe e convites']]:[['team','Meus convites']]),['settings','Configura\u00e7\u00f5es']];
}

// Move the actual modules, preserving forms, event handlers and server authorization.
export function mountAdministrativeArea(panels,{role,selected='home',onSelect=()=>{},canNavigate=()=>true}){
  const sections=administrativeSections(role),host=panels.querySelector('[data-operation-panel="administrative"]');
  if(!sections.length||!host)return null;
  const doc=host.ownerDocument,home=doc.createElement('div');
  while(host.firstChild)home.append(host.firstChild);
  home.dataset.adminView='home';
  host.classList.remove('card');host.classList.add('administrative-area');
  host.innerHTML='<header class="admin-area-header"><p class="eyebrow">ÁREA RESERVADA</p><h2>Gestão da transportadora</h2><p>Gerencie a transportadora nesta área. As permissões da sua conta e das filiais continuam sendo validadas em cada operação.</p><span class="badge">'+(role==='owner'?'Proprietário · gestão completa disponível':'Administrativo · filiais autorizadas')+'</span></header><nav class="admin-area-nav" aria-label="Seções administrativas">'+sections.map(([id,label])=>'<button type="button" class="secondary" data-admin-go="'+id+'" aria-controls="admin-view-'+id+'">'+label+'</button>').join('')+'</nav>';
  const body=doc.createElement('div');body.className='admin-area-body';body.append(home);host.append(body);
  for(const [id] of sections){
    if(id==='home')continue;
    const module=panels.querySelector('[data-operation-panel="'+id+'"]');
    if(!module)continue;
    delete module.dataset.operationPanel;module.dataset.adminView=id;body.append(module);
  }
  body.querySelectorAll('[data-admin-view]').forEach(view=>{view.id='admin-view-'+view.dataset.adminView;view.tabIndex=-1;});
  function select(id,{focus=true,initial=false}={}){
    const view=body.querySelector('[data-admin-view="'+id+'"]'),button=host.querySelector('[data-admin-go="'+id+'"]');
    if(!view||!button||(!initial&&!canNavigate()))return false;
    body.querySelectorAll('[data-admin-view]').forEach(item=>{item.hidden=item!==view;});
    host.querySelectorAll('[data-admin-go]').forEach(item=>{if(item===button)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
    onSelect(id);if(focus)view.focus({preventScroll:true});return true;
  }
  host.addEventListener('click',event=>{const button=event.target.closest('[data-admin-go]');if(button)select(button.dataset.adminGo);});
  select(sections.some(([id])=>id===selected)?selected:'home',{focus:false,initial:true});
  return {select,host};
}
