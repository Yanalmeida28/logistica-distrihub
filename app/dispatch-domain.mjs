// Prototype allocation rules. Not real routing, GPS, dispatch or authorization.
import {demoCompany,branches} from './domain.mjs';
export const locationMaxAgeMs=30*60*1000;
const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error('Confira os campos obrigatórios.');return v.trim();};
const time=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw new Error('Horário inválido.');return new Date(v).toISOString();};
export function point(lat,lon){if(lat===''||lon===''||lat===null||lon===null||lat===undefined||lon===undefined)throw new Error('Informe as duas coordenadas fictícias.');const latitude=Number(lat),longitude=Number(lon);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('Coordenadas fora dos limites.');return {lat:latitude,lon:longitude};}
export function distanceKm(a,b){const x=point(a.lat,a.lon),y=point(b.lat,b.lon),rad=n=>n*Math.PI/180;const h=Math.sin(rad(y.lat-x.lat)/2)**2+Math.cos(rad(x.lat))*Math.cos(rad(y.lat))*Math.sin(rad(y.lon-x.lon)/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));}
function admin(actor,company,branch){if(!actor||!actor.active||actor.role!=='administrative'||actor.companyId!==company||(actor.branchId!==branch&&actor.canAccessAllBranches!==true))throw new Error('Perfil administrativo fora deste contexto.');}
export function driverProfile(employee,input){
  if(!employee||employee.role!=='driver'||!employee.active||employee.companyId!==demoCompany)throw new Error('Cadastre um motorista ativo na equipe do exemplo.');
  const capacityVolumes=Number(input.capacityVolumes);if(!Number.isInteger(capacityVolumes)||capacityVolumes<1||capacityVolumes>100000)throw new Error('Capacidade demonstrativa deve ser inteira e positiva.');
  return {...employee,vehicle:text(input.vehicle,80),capacityVolumes,available:input.available===true,location:input.lat===''&&input.lon===''?null:{...point(input.lat,input.lon),at:time(input.at)}};
}
export function createCollectionOrder(input,actor,cargo,orders=[]){
  if(input.companyId!==demoCompany||!branches.includes(input.branchId))throw new Error('Empresa ou unidade inválida.');admin(actor,input.companyId,input.branchId);
  const volumes=Number(input.volumes);if(!Number.isInteger(volumes)||volumes<1||volumes>100000)throw new Error('Informe volumes inteiros e positivos.');
  if(input.cargoId&&(!cargo||cargo.id!==input.cargoId||cargo.companyId!==input.companyId||cargo.branchId!==input.branchId||cargo.status!=='collection_requested'))throw new Error('Vincule somente carga desta unidade aguardando coleta.');
  if(input.cargoId&&orders.some(o=>o.companyId===input.companyId&&o.cargoId===input.cargoId&&o.status!=='collected'))throw new Error('Esta carga já possui uma ordem de coleta ativa.');
  const at=time(input.at),pickup=input.lat===''&&input.lon===''?null:point(input.lat,input.lon);
  return {id:text(input.id,80),code:text(input.code,40),companyId:input.companyId,branchId:input.branchId,client:text(input.client,100),pickupLabel:text(input.pickupLabel),volumes,cargoId:input.cargoId||null,pickup,
    status:'pending',driverId:null,createdAt:at,history:[{action:'created',at,actorId:actor.id,detail:'Ordem fictícia de coleta; sem deslocamento real'}]};
}
function busy(driver,orders){return orders.some(o=>o.companyId===driver.companyId&&o.driverId===driver.id&&['assigned','accepted','in_progress'].includes(o.status));}
export function driverCandidates(order,drivers,orders,now,{automatic=true}={}){
  time(now);return drivers.map(driver=>{
    let reason='';const age=driver.location?Date.parse(now)-Date.parse(driver.location.at):NaN;
    if(driver.companyId!==order.companyId||driver.branchId!==order.branchId)reason='Outra empresa ou unidade';
    else if(driver.role!=='driver'||!driver.active)reason='Motorista inativo ou função incorreta';
    else if(driver.available!==true)reason='Indisponível';
    else if(busy(driver,orders))reason='Já possui OS ativa no exemplo';
    else if(!Number.isInteger(driver.capacityVolumes)||driver.capacityVolumes<order.volumes)reason='Capacidade de volumes insuficiente ou desconhecida';
    else if(automatic&&(!order.pickup||!driver.location||!Number.isFinite(age)||age<0||age>locationMaxAgeMs))reason='Localização ausente, antiga ou inválida';
    let km=null;if(order.pickup&&driver.location&&Number.isFinite(age)&&age>=0&&age<=locationMaxAgeMs){try{km=distanceKm(order.pickup,driver.location);}catch{if(automatic)reason='Coordenadas inválidas';}}
    return {driver,eligible:!reason,reason,distanceKm:km};
  }).sort((a,b)=>(Number(b.eligible)-Number(a.eligible))||((a.distanceKm??Infinity)-(b.distanceKm??Infinity))||a.driver.id.localeCompare(b.driver.id));
}
export function assignOrder(order,input,actor,drivers,orders){
  if(!order)throw new Error('OS indisponível.');admin(actor,order.companyId,order.branchId);
  if(order.status!=='pending'||order.driverId)throw new Error('OS já atribuída ou encerrada.');
  if(!['manual','automatic'].includes(input.mode))throw new Error('Modo de atribuição inválido.');
  const candidates=driverCandidates(order,drivers,orders,input.at,{automatic:input.mode==='automatic'}),chosen=input.mode==='automatic'?candidates.find(c=>c.eligible):candidates.find(c=>c.driver.id===input.driverId&&c.eligible);
  if(!chosen)throw new Error('Nenhum motorista elegível para esta atribuição.');
  const at=time(input.at);if(at<order.createdAt)throw new Error('Horário anterior à criação da OS.');
  return {...order,status:'assigned',driverId:chosen.driver.id,assignmentMode:input.mode,distanceKm:chosen.distanceKm,history:[...order.history,{action:'assigned',at,actorId:actor.id,driverId:chosen.driver.id,detail:input.mode==='automatic'?'Menor distância em linha reta entre elegíveis — simulação':'Escolha manual — simulação'}]};
}
export function autoDistribute(orders,drivers,actor,{branch='all',at}){
  if(!actor||actor.companyId!==demoCompany||actor.role!=='administrative'||!actor.active)throw new Error('Administrador inválido.');
  let next=[...orders];const assigned=[],unassigned=[];
  for(const order of orders.filter(o=>o.companyId===actor.companyId&&o.status==='pending'&&(branch==='all'||o.branchId===branch)&&(actor.canAccessAllBranches||o.branchId===actor.branchId)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
    try{const result=assignOrder(order,{mode:'automatic',at},actor,drivers,next);next=next.map(o=>o.id===result.id?result:o);assigned.push(result.id);}catch(e){unassigned.push({id:order.id,reason:e.message});}
  }return {orders:next,assigned,unassigned};
}
export function changeOrder(order,input,actor){
  if(!order)throw new Error('OS indisponível.');
  const transitions={assigned:'accepted',accepted:'in_progress',in_progress:'collected'};
  if(actor?.role!=='driver'||!actor.active||actor.companyId!==order.companyId||actor.branchId!==order.branchId||actor.id!==order.driverId)throw new Error('OS não pertence a este motorista ativo.');
  if(transitions[order.status]!==input.nextStatus)throw new Error('Transição indisponível.');
  const at=time(input.at);if(at<order.history.at(-1).at)throw new Error('Horário anterior ao último evento.');
  return {...order,status:input.nextStatus,history:[...order.history,{action:input.nextStatus,at,actorId:actor.id,detail:text(input.note,300)}]};
}
export function releaseOrder(order,input,actor){
  if(!order)throw new Error('OS indisponível.');admin(actor,order.companyId,order.branchId);
  if(!['assigned','accepted'].includes(order.status))throw new Error('Só liberar OS antes do início. Em execução exige tratamento de ocorrência.');
  const at=time(input.at);if(at<order.history.at(-1).at)throw new Error('Horário inválido.');
  return {...order,status:'pending',driverId:null,assignmentMode:null,distanceKm:null,history:[...order.history,{action:'released',at,actorId:actor.id,driverId:order.driverId,detail:text(input.reason,300)}]};
}
