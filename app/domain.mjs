// Contracts for the demonstrative prototype only; not production authorization.
export const steps = [
  {id:'collection_requested', label:'Coleta atribuída', action:null},
  {id:'collected', label:'Coletada na origem', action:'Confirmar recebimento na unidade'},
  {id:'received', label:'Recebida na unidade', action:'Confirmar embarque'},
  {id:'shipped', label:'Embarque confirmado', action:'Confirmar chegada à unidade'},
  {id:'destination', label:'Na unidade de destino', action:'Confirmar saída para entrega'},
  {id:'out_for_delivery', label:'Saiu para entrega', action:'Confirmar entrega'},
  {id:'delivered', label:'Entrega confirmada', action:null},
];
export const demoCompany = 'transportadora-exemplo';
export const branches = ['unidade-a','unidade-b'];
export const occurrenceTypes = {
  customer_absent:{label:'Cliente ausente',informational:false},
  address_not_found:{label:'Endereço não localizado',informational:false},
  address_located:{label:'Endereço localizado',informational:true},
  refused:{label:'Entrega recusada',informational:false},
  damaged:{label:'Avaria identificada',informational:false},
  volume_mismatch:{label:'Divergência de volumes',informational:false},
  partial_delivery:{label:'Entrega parcial',informational:false},
  documentation:{label:'Documentação pendente',informational:false},
  rescheduled:{label:'Nova tentativa combinada',informational:true},
  other:{label:'Outra ocorrência',informational:false},
};
const text = (value, max = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Preencha os campos obrigatórios dentro do limite indicado.');
  return value.trim();
};
const timestamp = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Horário inválido.');
  return new Date(value).toISOString();
};
function scope(cargo, company, branch) {
  if (!cargo || cargo.companyId !== company || (branch !== 'all' && cargo.branchId !== branch)) throw new Error('Carga fora do contexto selecionado.');
}
function event(cargo, input, kind, detail) {
  const at = timestamp(input.at), actor = text(input.actor, 80);
  if (cargo.events.length && Date.parse(at) < Date.parse(cargo.events.at(-1).at)) throw new Error('O evento não pode anteceder o último registro.');
  return {kind, detail, at, actor, source:'Registro manual — simulação'};
}
export function visibleCargo(cargos, company, branch = 'all') {
  return cargos.filter(c => c.companyId === company && (branch === 'all' || c.branchId === branch));
}
export function receiveCargo(input) {
  if (input.companyId !== demoCompany || !branches.includes(input.branchId)) throw new Error('Selecione uma unidade válida de recebimento.');
  const volumes = Number(input.volumes);
  if (!Number.isInteger(volumes) || volumes < 1 || volumes > 100000) throw new Error('Informe uma quantidade inteira de volumes entre 1 e 100000.');
  const cargo = {id:text(input.id,80),code:text(input.code,30),companyId:input.companyId,branchId:input.branchId,
    customer:text(input.customer,100),origin:text(input.origin,100),destination:text(input.destination,100),volumes,
    description:text(input.description,300),status:'received',createdAt:timestamp(input.at),events:[],issues:[],documents:[]};
  cargo.events.push(event(cargo,input,'received','Recebimento confirmado no protótipo. Coleta e embarque não foram inferidos.'));
  return cargo;
}
export function advanceCargo(cargo, input) {
  scope(cargo,input.companyId,input.branchId);
  if (cargo.status==='collection_requested') throw new Error('A coleta precisa ser confirmada pelo coletor atribuído na área de teste.');
  const index=steps.findIndex(s=>s.id===cargo.status);
  if (index<0 || index===steps.length-1) throw new Error('Não há próxima etapa disponível.');
  if (input.expectedStatus!==cargo.status) throw new Error('A etapa mudou. Confira os dados antes de confirmar novamente.');
  if (cargo.issues.some(i=>!i.resolvedAt && i.blocking)) throw new Error('Resolva a pendência bloqueante antes de avançar nesta simulação.');
  const next=steps[index+1];
  return {...cargo,status:next.id,events:[...cargo.events,event(cargo,input,next.id,text(input.note,300))]};
}
export function addIssue(cargo,input) {
  scope(cargo,input.companyId,input.branchId);
  const issue={id:text(input.id,80),description:text(input.description,300),responsible:text(input.responsible,80),blocking:input.blocking===true,createdAt:timestamp(input.at),resolvedAt:null};
  if (cargo.issues.some(i=>i.id===issue.id)) throw new Error('Pendência já registrada.');
  return {...cargo,issues:[...cargo.issues,issue],events:[...cargo.events,event(cargo,input,'issue_opened',issue.description)]};
}
export function recordOccurrence(cargo,input) {
  scope(cargo,input.companyId,input.branchId);
  if(typeof input.category!=='string'||!Object.hasOwn(occurrenceTypes,input.category))throw new Error('Selecione um tipo de ocorrência válido.');
  const type=occurrenceTypes[input.category];
  const id=text(input.id,80),responsible=text(input.responsible,80),description=text(input.description,300);
  if(cargo.issues.some(i=>i.id===id)||cargo.events.some(e=>e.occurrenceId===id))throw new Error('Ocorrência já registrada.');
  const e={...event(cargo,input,type.informational?'occurrence_noted':'issue_opened',type.label+': '+description),occurrenceId:id,category:input.category,responsible};
  if(type.informational)return {...cargo,events:[...cargo.events,e]};
  const issue={id,category:input.category,description,responsible,blocking:input.blocking===true,createdAt:e.at,resolvedAt:null};
  return {...cargo,issues:[...cargo.issues,issue],events:[...cargo.events,e]};
}
export function resolveIssue(cargo,input) {
  scope(cargo,input.companyId,input.branchId);
  const issue=cargo.issues.find(i=>i.id===input.issueId);
  if (!issue || issue.resolvedAt) throw new Error('Pendência indisponível ou já resolvida.');
  const note=text(input.note,300),e=event(cargo,input,'issue_resolved',note);
  return {...cargo,issues:cargo.issues.map(i=>i.id===issue.id?{...i,resolvedAt:e.at,resolution:note}:i),events:[...cargo.events,e]};
}
export function linkDocument(cargo,input) {
  scope(cargo,input.companyId,input.branchId);
  if (!['triagem','nf','cte','outro'].includes(input.type)) throw new Error('Tipo de referência inválido.');
  const reference=text(input.reference,80);
  if (cargo.documents.some(d=>d.type===input.type && d.reference===reference)) throw new Error('Referência já vinculada.');
  const e=event(cargo,input,'document_linked',input.type+': '+reference);
  return {...cargo,documents:[...cargo.documents,{type:input.type,reference,at:e.at}],events:[...cargo.events,e]};
}
export function metrics(cargos) {
  return {active:cargos.filter(c=>c.status!=='delivered').length,received:cargos.filter(c=>c.status==='received').length,
    issues:cargos.reduce((n,c)=>n+c.issues.filter(i=>!i.resolvedAt).length,0),delivered:cargos.filter(c=>c.status==='delivered').length};
}

export function createEmployee(input) {
  if (input.companyId!==demoCompany || !branches.includes(input.branchId) || !['administrative','collector','driver'].includes(input.role)) throw new Error('Empresa, unidade ou função inválida.');
  return {id:text(input.id,80),companyId:input.companyId,branchId:input.branchId,name:text(input.name,80),role:input.role,active:true};
}
function staff(employee,company,branch,role) {
  if (!employee || !employee.active || employee.companyId!==company || employee.branchId!==branch || employee.role!==role) throw new Error('Funcionário não autorizado neste contexto demonstrativo.');
}
export function requestCollection(input,administrator,collector) {
  staff(administrator,input.companyId,input.branchId,'administrative');
  staff(collector,input.companyId,input.branchId,'collector');
  const cargo=receiveCargo({...input,actor:administrator.name});
  return {...cargo,status:'collection_requested',collectorId:collector.id,events:[event({...cargo,events:[]},{...input,actor:administrator.name},'collection_requested','Coleta atribuída a '+collector.name+'. Recebimento no armazém ainda não confirmado.')]};
}
export function confirmCollection(cargo,input,collector) {
  scope(cargo,input.companyId,input.branchId);
  staff(collector,cargo.companyId,cargo.branchId,'collector');
  if (cargo.collectorId!==collector.id || cargo.status!=='collection_requested') throw new Error('Coleta não atribuída a este funcionário ou já confirmada.');
  if (cargo.issues.some(i=>!i.resolvedAt&&i.blocking)) throw new Error('Há pendência bloqueante nesta simulação.');
  const note=text(input.note,300);
  return {...cargo,status:'collected',events:[...cargo.events,event(cargo,{...input,actor:collector.name},'collected',note)]};
}
