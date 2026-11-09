export const collectionTasks=['collections','receiving','cargos','pending'];
export const operationPanelId=id=>collectionTasks.includes(id)?'collections':id;
export function operationTabs(role,hasCompany){
  if(!hasCompany)return [['overview','Primeiros passos'],['team','Convites']];
  if(['owner','administrative'].includes(role))return [['overview','Hoje'],['collections','Coletas'],['receiving','Recebimento'],['cargos','Cargas'],['pending','Pendências'],['administrative','Gestão'],['relations','Portal e documentos'],['chat','Chat da central']];
  if(['driver','collector'].includes(role))return [['collections','Minhas coletas'],['chat','Chat da central'],['team','Convites'],['settings','Minha conta']];
  if(role==='client')return [['relations','Minhas cargas'],['team','Convites'],['settings','Minha conta']];
  return [['overview','Sem acesso'],['team','Convites']];
}

export function selectOperationPanel(layout,id){
  const panel=layout.querySelector('[data-operation-panel="'+operationPanelId(id)+'"]');
  const button=layout.querySelector('[data-operation-tab="'+id+'"]');
  if(!panel||!button)return false;
  layout.querySelectorAll('[data-operation-panel]').forEach(item=>{item.hidden=item!==panel;});
  layout.querySelectorAll('[data-operation-tab]').forEach(item=>{
    if(item===button)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
  return true;
}
