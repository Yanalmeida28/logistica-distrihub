// Demonstration only: these projections do not provide server-side authorization.
import {steps,occurrenceTypes} from './domain.mjs';
export const whatsappEnabled=false;
const milestone=new Map(steps.filter(s=>s.id!=='collection_requested').map(s=>[s.id,s.label]));
const infoKinds=new Set(['issue_opened','issue_resolved','occurrence_noted']);
export function entitled(cargo,contact,links,branch='all'){
  return Boolean(cargo&&contact?.active===true&&contact.role==='client'&&contact.companyId===cargo.companyId&&contact.branches.includes(cargo.branchId)&&(branch==='all'||branch===cargo.branchId)&&links.some(l=>l.companyId===cargo.companyId&&l.cargoId===cargo.id&&l.clientId===contact.clientId));
}
export function publicEvent(event){
  const label=milestone.get(event.kind)??(event.kind==='issue_opened'?'Ocorrência registrada':event.kind==='issue_resolved'?'Pendência resolvida':event.kind==='occurrence_noted'?'Atualização da ocorrência':null);
  if(!label)return null;
  // Never project raw notes, employee names, internal instructions or financial data.
  return {kind:event.kind,at:event.at,label,summary:occurrenceTypes[event.category]?.label??(infoKinds.has(event.kind)?'Consulte a central para informações.':label)};
}
export function portalCargo(cargos,contact,links,grants,branch='all'){
  return cargos.filter(c=>entitled(c,contact,links,branch)).map(c=>({id:c.id,code:c.code,branchId:c.branchId,origin:c.origin,destination:c.destination,volumes:c.volumes,status:c.status,
    events:c.events.map(publicEvent).filter(Boolean),
    issues:c.issues.filter(i=>!i.resolvedAt).map(i=>({label:occurrenceTypes[i.category]?.label??'Pendência em acompanhamento'})),
    documents:c.documents.filter(d=>grants.some(g=>g.companyId===c.companyId&&g.clientId===contact.clientId&&g.cargoId===c.id&&g.type===d.type&&g.reference===d.reference&&g.at===d.at)).map(d=>({type:d.type,reference:d.reference,at:d.at}))}));
}
export function shareDocument(cargo,contact,document,actor,links,grants,{revoke=false}={}){
  if(!entitled(cargo,contact,links)||!actor?.active||actor.role!=='administrative'||actor.companyId!==cargo.companyId||(!actor.canAccessAllBranches&&actor.branchId!==cargo.branchId))throw new Error('Compartilhamento fora do contexto demonstrativo.');
  if(!cargo.documents.some(d=>d.type===document.type&&d.reference===document.reference&&d.at===document.at))throw new Error('Referência inexistente.');
  const same=g=>g.companyId===cargo.companyId&&g.clientId===contact.clientId&&g.cargoId===cargo.id&&g.type===document.type&&g.reference===document.reference&&g.at===document.at;
  if(revoke)return grants.filter(g=>!same(g));
  return grants.some(same)?grants:[...grants,{companyId:cargo.companyId,clientId:contact.clientId,cargoId:cargo.id,type:document.type,reference:document.reference,at:document.at}];
}
export function setConsent(contact,enabled,at){
  if(!contact?.active||contact.role!=='client'||typeof enabled!=='boolean'||!Number.isFinite(Date.parse(at)))throw new Error('Consentimento inválido.');
  if(contact.consentHistory?.length&&Date.parse(at)<Date.parse(contact.consentHistory.at(-1).at))throw new Error('Horário anterior ao último consentimento.');
  return {...contact,whatsappConsent:enabled,consentHistory:[...(contact.consentHistory??[]),{at,enabled,source:'Escolha do contato simulado'}]};
}
export function prepareNotifications(previous,next,contacts,links,history){
  let result=[...history];
  for(const cargo of next){
    const old=previous.find(c=>c.id===cargo.id&&c.companyId===cargo.companyId);
    if(!old)continue; // New or imported cargos never trigger historical backfill.
    if(old.branchId!==cargo.branchId||old.events.length>cargo.events.length||old.events.some((e,i)=>JSON.stringify(e)!==JSON.stringify(cargo.events[i])))throw new Error('Histórico reescrito: notificações recusadas.');
    for(let index=old.events.length;index<cargo.events.length;index++){
      const event=publicEvent(cargo.events[index]);if(!event)continue;
      for(const contact of contacts.filter(c=>entitled(cargo,c,links))){
        const key=JSON.stringify([cargo.companyId,cargo.id,index,contact.id]);
        if(result.some(n=>n.key===key))continue;
        const allowed=contact.whatsappConsent===true;
        result.push({key,companyId:cargo.companyId,branchId:cargo.branchId,cargoId:cargo.id,contactId:contact.id,at:event.at,kind:event.kind,
          status:allowed?'simulated_not_sent':'blocked_no_consent',message:allowed?'Atualização da carga '+cargo.code+': '+event.summary+'. Consulte o portal.':null});
      }
    }
  }
  return result;
}
export function visibleNotifications(history,cargos,contact,links,branch='all'){
  return history.filter(n=>n.contactId===contact?.id&&n.companyId===contact?.companyId&&cargos.some(c=>c.id===n.cargoId&&c.branchId===n.branchId&&entitled(c,contact,links,branch)));
}
