import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiveCargo,advanceCargo,addIssue,resolveIssue,linkDocument,visibleCargo,demoCompany} from '../app/domain.mjs';
import {initialCargo} from '../app/demo.mjs';
const input={id:'cargo-1',code:'LAB-001',companyId:demoCompany,branchId:'unidade-a',customer:'Cliente fictício',origin:'Origem de teste',destination:'Destino de teste',volumes:2,description:'Volumes fictícios',actor:'Equipe exemplo',at:'2026-11-06T12:00:00.000Z'};
test('recebimento começa antes do CT-e sem inventar coleta ou embarque',()=>{
  const cargo=receiveCargo(input);assert.equal(cargo.status,'received');assert.equal(cargo.events.length,1);assert.equal(cargo.documents.length,0);assert.equal(cargo.events[0].kind,'received');
});
test('campos inválidos e unidades desconhecidas não criam carga',()=>{
  for(const patch of [{volumes:0},{volumes:1.5},{volumes:100001},{customer:' '},{branchId:'inexistente'},{companyId:'outra'},{at:'inválido'}])assert.throws(()=>receiveCargo({...input,...patch}));
});
test('avanço é sequencial e uma repetição com estado antigo é rejeitada',()=>{
  const original=receiveCargo(input),next=advanceCargo(original,{...input,expectedStatus:'received',note:'Embarque de exemplo confirmado'});
  assert.equal(next.status,'shipped');assert.equal(original.status,'received');assert.equal(original.events.length,1);assert.equal(next.events.length,2);
  assert.throws(()=>advanceCargo(next,{...input,expectedStatus:'received',note:'Repetição'}));
});
test('pendência bloqueia o exemplo e resolução mantém histórico',()=>{
  const base=receiveCargo(input),issue=addIssue(base,{...input,id:'issue-1',description:'Conferir volumes',responsible:'Equipe exemplo',blocking:true});
  assert.throws(()=>advanceCargo(issue,{...input,expectedStatus:'received',note:'Embarque'}));
  const resolved=resolveIssue(issue,{...input,issueId:'issue-1',note:'Conferência concluída no teste'});
  assert.equal(resolved.issues[0].resolvedAt,input.at);assert.equal(issue.issues[0].resolvedAt,null);assert.equal(resolved.events.at(-1).kind,'issue_resolved');
  assert.equal(advanceCargo(resolved,{...input,expectedStatus:'received',note:'Embarque de teste'}).status,'shipped');
  assert.throws(()=>resolveIssue(resolved,{...input,issueId:'issue-1',note:'Repetição'}));
});
test('referência documental não muda status nem duplica vínculo',()=>{
  const original=receiveCargo(input),linked=linkDocument(original,{...input,type:'cte',reference:'CTE-FICTICIO'});
  assert.equal(linked.status,'received');assert.equal(original.documents.length,0);assert.equal(linked.documents.length,1);
  assert.throws(()=>linkDocument(linked,{...input,type:'cte',reference:'CTE-FICTICIO'}));
  assert.throws(()=>linkDocument(linked,{...input,type:'inexistente',reference:'EXEMPLO'}));
});
test('contexto por empresa/unidade filtra e recusa mutações fora do escopo demonstrativo',()=>{
  const cargo=receiveCargo(input);assert.equal(visibleCargo([cargo],demoCompany,'unidade-b').length,0);assert.equal(visibleCargo([cargo],'outra').length,0);
  for(const patch of [{companyId:'outra'},{branchId:'unidade-b'}]){
    assert.throws(()=>advanceCargo(cargo,{...input,...patch,expectedStatus:'received',note:'Embarque'}));
    assert.throws(()=>addIssue(cargo,{...input,...patch,id:'i',description:'Teste',responsible:'Equipe'}));
    assert.throws(()=>linkDocument(cargo,{...input,...patch,type:'triagem',reference:'EXEMPLO'}));
  }
});
test('entrega não avança novamente; evento anterior é rejeitado',()=>{
  let c=receiveCargo(input);for(const status of ['received','shipped','destination','out_for_delivery'])c=advanceCargo(c,{...input,expectedStatus:status,note:'Evento confirmado'});
  assert.equal(c.status,'delivered');assert.throws(()=>advanceCargo(c,{...input,expectedStatus:'delivered',note:'Outro evento'}));
  assert.throws(()=>addIssue(c,{...input,at:'2026-11-05T12:00:00Z',id:'i',description:'Teste',responsible:'Equipe'}));
});
test('conjunto inicial é sintético e cobre etapas e pendências',()=>{
  const cargos=initialCargo();assert.equal(cargos.length,5);assert.equal(new Set(cargos.map(c=>c.id)).size,5);assert(cargos.some(c=>c.status==='delivered'));assert(cargos.some(c=>c.issues.length));
});
