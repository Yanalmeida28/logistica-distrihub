import {localDay,day} from './finance-domain.mjs';
const optional=(v,max=120)=>{if(v==null||v==='')return '';if(typeof v!=='string'||v.trim().length>max)throw new Error('Campo fora do limite.');return v.trim();};
function authorize(account,actor){
  if(!account||account.type!=='expense'||account.status==='cancelled'||!actor?.active||actor.role!=='administrative'||actor.companyId!==account.companyId||(actor.branchId!==account.branchId&&!actor.canAccessAllBranches))throw new Error('Despesa indisponível neste contexto administrativo de teste.');
}
export function updateExpense(account,input,actor,employees){
  authorize(account,actor);
  const driverId=optional(input.driverId,80),driver=employees.find(e=>e.id===driverId);
  if(driverId&&(!driver||!driver.active||driver.role!=='driver'||driver.companyId!==account.companyId||driver.branchId!==account.branchId))throw new Error('Motorista não pertence à unidade da despesa.');
  const date=day(input.date);if(date>localDay())throw new Error('Data futura não permitida.');
  const number=(v)=>{if(v==null||v==='')return null;const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0||n>10000000)throw new Error('Confira quilometragem e litros.');return n;};
  const details={driverId,vehicle:optional(input.vehicle,80),reference:optional(input.reference),document:optional(input.document,80),date,odometer:number(input.odometer),liters:account.category==='fuel'?number(input.liters):null,note:optional(input.note,300)};
  return {...account,costDetails:details,history:[...account.history,{action:'cost_details',actorId:actor.id,date:localDay(),detail:'Detalhes operacionais atualizados no exemplo'}]};
}
export function attachReceipt(account,input,actor){
  authorize(account,actor);
  const {bytes,mime}=input,name=optional(input.name,160),id=optional(input.id,80);
  if(!id||!name||!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>5*1024*1024)throw new Error('Comprovante vazio ou maior que 5 MB.');
  const valid= mime==='application/pdf'?bytes.slice(0,5).every((b,i)=>b===[37,80,68,70,45][i])&&bytes.length>=5:
    mime==='image/png'?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):
    mime==='image/jpeg'?bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:false;
  if(!valid)throw new Error('Use PDF, JPG ou PNG com formato compatível.');
  const receipts=account.receipts??[];
  if(receipts.length>=5||receipts.some(r=>r.id===id))throw new Error('Limite de cinco comprovantes ou identificador repetido.');
  return {...account,receipts:[...receipts,{id,name,mime,bytes:bytes.slice(),actorId:actor.id,date:localDay()}],history:[...account.history,{action:'receipt',actorId:actor.id,date:localDay(),detail:'Comprovante fictício anexado; não confirma pagamento'}]};
}
