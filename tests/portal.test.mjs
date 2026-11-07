import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entitled,portalCargo,shareDocument,setConsent,prepareNotifications,visibleNotifications,publicEvent,whatsappEnabled} from '../app/portal-domain.mjs';
import {demoCompany} from '../app/domain.mjs';
const event={kind:'received',at:'2026-11-06T10:00:00Z',detail:'SECRET INTERNAL NOTE',actor:'INTERNAL EMPLOYEE'};
const doc={type:'cte',reference:'CTE-FICTICIO',at:event.at};
const cargo={id:'c',code:'TESTE',companyId:demoCompany,branchId:'unidade-a',origin:'Origem',destination:'Destino',volumes:2,status:'received',events:[event],documents:[doc],issues:[{description:'SECRET ISSUE',responsible:'INTERNAL STAFF',resolvedAt:null}],payments:[{secret:1}]};
const contact={id:'contact',clientId:'client',role:'client',active:true,companyId:demoCompany,branches:['unidade-a'],whatsappConsent:false};
const links=[{companyId:demoCompany,cargoId:'c',clientId:'client'}];
const admin={id:'admin',companyId:demoCompany,branchId:'unidade-a',role:'administrative',active:true};
const next={...cargo,status:'shipped',events:[event,{...event,kind:'shipped',at:'2026-11-06T11:00:00Z'}]};
test('portal exige vinculo explicito, empresa, unidade e contato ativo; nao usa nome',()=>{
  assert(entitled(cargo,contact,links));
  for(const patch of [{companyId:'other'},{branches:['unidade-b']},{active:false},{clientId:'other'},{role:'administrative'}])assert.equal(portalCargo([cargo],{...contact,...patch},links,[]).length,0);
  assert.equal(portalCargo([cargo],contact,[],[]).length,0);assert.equal(portalCargo([cargo],contact,links,[],'unidade-b').length,0);
  assert.equal(portalCargo([{...cargo,id:'new',customer:'Same name'}],contact,links,[]).length,0);
});
test('projecao nao revela notas internas, responsaveis, pagamentos ou documentos nao liberados',()=>{
  const [c]=portalCargo([cargo],contact,links,[]);const text=JSON.stringify(c);assert(!text.includes('SECRET'));assert(!text.includes('INTERNAL'));assert(!text.includes('payments'));assert.equal(c.documents.length,0);
  assert.equal(publicEvent({...event,kind:'document_linked'}),null);
});
test('documento exige liberacao por contato; revogacao imediata e sem duplicar',()=>{
  const grants=shareDocument(cargo,contact,doc,admin,links,[]);assert.equal(portalCargo([cargo],contact,links,grants)[0].documents.length,1);
  assert.equal(shareDocument(cargo,contact,doc,admin,links,grants).length,1);
  assert.equal(shareDocument(cargo,contact,doc,admin,links,grants,{revoke:true}).length,0);
  assert.throws(()=>shareDocument(cargo,contact,{...doc,reference:'fake'},admin,links,[]));
  for(const patch of [{companyId:'other'},{branchId:'unidade-b'},{role:'driver'},{active:false}])assert.throws(()=>shareDocument(cargo,contact,doc,{...admin,...patch},links,[]));
});
test('consentimento inicia desligado, tem historico, revogacao e nenhum backfill',()=>{
  const yes=setConsent(contact,true,'2026-11-06T10:30:00Z');assert.equal(yes.consentHistory.length,1);
  assert.equal(prepareNotifications([cargo],[cargo],[yes],links,[]).length,0);
  assert.equal(prepareNotifications([],[next],[yes],links,[]).length,0);
  const no=setConsent(yes,false,'2026-11-06T10:40:00Z');assert.equal(no.whatsappConsent,false);assert.equal(no.consentHistory.length,2);
  assert.throws(()=>setConsent(no,true,'2026-11-06T09:00:00Z'));
});
test('evento confirmado prepara so previa; duplicado nao repete e provider permanece desligado',()=>{
  const yes={...contact,whatsappConsent:true};const history=prepareNotifications([cargo],[next],[yes],links,[]);
  assert.equal(history.length,1);assert.equal(history[0].status,'simulated_not_sent');assert(!history[0].message.includes('SECRET'));
  assert.equal(prepareNotifications([cargo],[next],[yes],links,history).length,1);assert.equal(whatsappEnabled,false);
});
test('revogacao bloqueia proximos eventos; historico nao e entrega real',()=>{
  const history=prepareNotifications([cargo],[next],[contact],links,[]);assert.equal(history[0].status,'blocked_no_consent');assert.equal(history[0].message,null);
  assert.equal(prepareNotifications([next],[next],[{...contact,whatsappConsent:true}],links,history)[0].status,'blocked_no_consent');
});
test('eventos de outro cliente/empresa/unidade nao geram nem revelam mensagens',()=>{
  assert.equal(prepareNotifications([cargo],[next],[{...contact,companyId:'other',whatsappConsent:true}],links,[]).length,0);
  assert.equal(prepareNotifications([cargo],[next],[{...contact,branches:['unidade-b']}],links,[]).length,0);
  const history=prepareNotifications([cargo],[next],[contact],links,[]);
  for(const patch of [{companyId:'other'},{id:'other'},{clientId:'other'},{active:false}])assert.equal(visibleNotifications(history,[next],{...contact,...patch},links).length,0);
  assert.equal(visibleNotifications(history,[next],contact,links,'unidade-b').length,0);
});
test('historico reescrito recusado, documento nao aciona notificacao e ocorrencia usa resumo seguro',()=>{
  assert.throws(()=>prepareNotifications([cargo],[{...next,events:[{...event,detail:'changed'},next.events[1]]}],[contact],links,[]));
  assert.equal(prepareNotifications([cargo],[{...next,events:[event,{...event,kind:'document_linked'}]}],[contact],links,[]).length,0);
  const n=prepareNotifications([cargo],[{...next,events:[event,{...event,kind:'issue_opened',category:'customer_absent'}]}],[{...contact,whatsappConsent:true}],links,[]);
  assert(n[0].message.includes('Cliente ausente'));assert(!n[0].message.includes('SECRET'));
});
