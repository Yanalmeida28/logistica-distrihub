const internalRoles=['owner','administrative','driver','collector'];
export function operationTabs(role,hasCompany){
  const tabs=[['overview','Visão geral']];
  if(hasCompany)tabs.push(['branches','Filiais'],['customers','Clientes'],['vehicles','Veículos']);
  tabs.push(['team','Equipe e convites']);
  if(hasCompany&&internalRoles.includes(role))tabs.push(['collections','Coletas e cargas']);
  if(hasCompany)tabs.push(['relations','Portal e documentos']);
  if(hasCompany&&internalRoles.includes(role))tabs.push(['chat','Chat interno']);
  return tabs;
}

export function selectOperationPanel(layout,id){
  const panel=layout.querySelector('[data-operation-panel="'+id+'"]');
  const button=layout.querySelector('[data-operation-tab="'+id+'"]');
  if(!panel||!button)return false;
  layout.querySelectorAll('[data-operation-panel]').forEach(item=>{item.hidden=item!==panel;});
  layout.querySelectorAll('[data-operation-tab]').forEach(item=>{
    if(item===button)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
  return true;
}
