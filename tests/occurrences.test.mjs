import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiveCargo,recordOccurrence,advanceCargo,resolveIssue,demoCompany} from '../app/domain.mjs';
const input={id:'cargo',code:'LAB-TESTE',companyId:demoCompany,branchId:'unidade-a',customer:'Cliente fictício',origin:'Origem fictícia',destination:'Destino fictício',volumes:1,description:'Volumes fictícios',actor:'Equipe de teste',at:'2026-11-06T12:00:00Z'};
const occurrence={...input,id:'occurrence-1',category:'customer_absent',description:'Destinatário ausente na tentativa fictícia',responsible:'Central exemplo',blocking:true};
test('cliente ausente cria pendência com autor, horário, responsável e categoria sem confirmar entrega',()=>{
  const original=receiveCargo(input),next=recordOccurrence(original,occurrence);
  assert.equal(next.status,'received');assert.equal(next.issues[0].category,'customer_absent');assert.equal(next.events.at(-1).actor,input.actor);assert.equal(next.events.at(-1).responsible,'Central exemplo');assert.equal(original.issues.length,0);
  assert.throws(()=>advanceCargo(next,{...input,expectedStatus:'received',note:'Avanço de teste'}));
});
test('endereço localizado informa sem resolver pendência anterior ou concluir entrega',()=>{
  const blocked=recordOccurrence(receiveCargo(input),{...occurrence,category:'address_not_found'});
  const located=recordOccurrence(blocked,{...occurrence,id:'occurrence-2',category:'address_located',description:'Endereço identificado pela equipe de teste'});
  assert.equal(located.status,'received');assert.equal(located.issues.length,1);assert.equal(located.issues[0].resolvedAt,null);assert.equal(located.events.at(-1).kind,'occurrence_noted');
  const resolved=resolveIssue(located,{...input,issueId:'occurrence-1',note:'Endereço conferido; pendência resolvida explicitamente'});assert(resolved.issues[0].resolvedAt);assert.equal(resolved.status,'received');
});
test('registro informativo não cria pendência mesmo com flag bloqueante antiga',()=>{
  const next=recordOccurrence(receiveCargo(input),{...occurrence,category:'rescheduled'});assert.equal(next.issues.length,0);assert.equal(next.status,'received');
});
test('avaria, recusa e entrega parcial permanecem ocorrências sem conclusão automática',()=>{
  for(const category of ['damaged','refused','partial_delivery','volume_mismatch','documentation','other']){
    const next=recordOccurrence(receiveCargo(input),{...occurrence,category});assert.equal(next.status,'received');assert.equal(next.issues.length,1);
  }
});
test('repetição, tipo desconhecido e contexto diferente são recusados',()=>{
  const cargo=receiveCargo(input),next=recordOccurrence(cargo,occurrence);assert.throws(()=>recordOccurrence(next,occurrence));
  for(const patch of [{category:'inexistente'},{category:'__proto__'},{companyId:'outra'},{branchId:'unidade-b'},{description:''},{responsible:''}])assert.throws(()=>recordOccurrence(cargo,{...occurrence,...patch}));
});
