import {receiveCargo,advanceCargo,addIssue,linkDocument,demoCompany} from './domain.mjs';
// All names and routes are synthetic. Timings are relative for demonstration.
export function initialCargo() {
  const base=Date.now()-8*3600000;
  const at=n=>new Date(base+n*60000).toISOString();
  const input=n=>({companyId:demoCompany,branchId:n%2?'unidade-a':'unidade-b',actor:'Equipe de demonstração',at:at(n),
    id:'demo-'+n,code:'LAB-'+String(n).padStart(4,'0'),customer:['Indústria Exemplo','Distribuidora Modelo','Comércio Demonstração'][n%3],
    origin:['Campinas / SP','São Paulo / SP','Ribeirão Preto / SP'][n%3],destination:['Belo Horizonte / MG','Curitiba / PR','Rio de Janeiro / RJ'][n%3],
    volumes:n+2,description:'Volumes fictícios para validação da interface'});
  let a=receiveCargo(input(1));
  a=addIssue(a,{...input(1),at:at(10),id:'issue-demo-1',description:'Conferir referência documental com o responsável',responsible:'Atendimento exemplo',blocking:true});
  let b=receiveCargo(input(2));b=advanceCargo(b,{...input(2),at:at(20),expectedStatus:'received',note:'Embarque fictício confirmado pela equipe'});
  let c=receiveCargo(input(3));for(const [i,status] of ['received','shipped','destination'].entries())c=advanceCargo(c,{...input(3),at:at(30+i),expectedStatus:status,note:'Movimentação demonstrativa confirmada'});
  let d=receiveCargo(input(4));for(const [i,status] of ['received','shipped','destination','out_for_delivery'].entries())d=advanceCargo(d,{...input(4),at:at(40+i),expectedStatus:status,note:'Evento fictício de acompanhamento'});
  let e=receiveCargo(input(5));e=linkDocument(e,{...input(5),at:at(50),type:'triagem',reference:'TRIAGEM-EXEMPLO-05'});
  return [a,b,c,d,e];
}
