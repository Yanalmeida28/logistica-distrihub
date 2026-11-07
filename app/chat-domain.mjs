// Consistency checks for a browser-only demonstration, not production access control.
function allowed(a,b){
  return a&&b&&a.active&&b.active&&a.id!==b.id&&a.companyId===b.companyId&&a.branchId===b.branchId
    &&[a.role,b.role].includes('administrative')&&[a,b].some(e=>['collector','driver'].includes(e.role));
}
export function chatContacts(actor,employees){return employees.filter(e=>allowed(actor,e));}
export function sendInternalMessage(input,actor,recipient,cargo){
  if(!allowed(actor,recipient))throw new Error('Conversa indisponível para estes perfis e unidade.');
  if(typeof input.id!=='string'||!input.id||typeof input.body!=='string'||!input.body.trim()||input.body.trim().length>2000)throw new Error('Digite uma mensagem de até 2000 caracteres.');
  if(typeof input.at!=='string'||!Number.isFinite(Date.parse(input.at)))throw new Error('Horário inválido.');
  if(input.cargoId&&(!cargo||cargo.id!==input.cargoId||cargo.companyId!==actor.companyId||cargo.branchId!==actor.branchId||(cargo.collectorId!==[actor,recipient].find(e=>e.role!=='administrative').id&&cargo.driverId!==[actor,recipient].find(e=>e.role!=='administrative').id)))throw new Error('Carga fora do contexto desta conversa.');
  return {id:input.id,companyId:actor.companyId,branchId:actor.branchId,senderId:actor.id,recipientId:recipient.id,body:input.body.trim(),at:new Date(input.at).toISOString(),cargoId:input.cargoId||null};
}
export function conversation(messages,actor,recipient){
  if(!allowed(actor,recipient))return [];
  return messages.filter(m=>m.companyId===actor.companyId&&m.branchId===actor.branchId&&((m.senderId===actor.id&&m.recipientId===recipient.id)||(m.senderId===recipient.id&&m.recipientId===actor.id))).sort((a,b)=>a.at.localeCompare(b.at));
}
