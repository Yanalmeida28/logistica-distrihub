import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoCompany,createEmployee} from '../app/domain.mjs';
import {point,distanceKm,driverProfile,createCollectionOrder,driverCandidates,assignOrder,autoDistribute,changeOrder,releaseOrder} from '../app/dispatch-domain.mjs';
const at='2026-11-06T12:00:00Z';
const admin={id:'admin',companyId:demoCompany,branchId:'unidade-a',role:'administrative',active:true};
const input={id:'os1',code:'OS-TESTE',companyId:demoCompany,branchId:'unidade-a',client:'Cliente fictício',pickupLabel:'Origem de teste',volumes:3,lat:0,lon:0,at};
function driver(id,lat=0.01,patch={}){return driverProfile(createEmployee({id,name:'Motorista fictício '+id,companyId:demoCompany,branchId:'unidade-a',role:'driver'}),{vehicle:'Veículo fictício',capacityVolumes:10,available:true,lat,lon:0,at,...patch});}
test('proximidade é linha reta calculada sem GPS e valida coordenadas',()=>{
  assert.equal(distanceKm(point(0,0),point(0,0)),0);assert(Math.abs(distanceKm(point(0,0),point(1,0))-111.19)<0.1);
  for(const coords of [[91,0],[0,181],['',0],[NaN,0]])assert.throws(()=>point(...coords));
});
test('automático escolhe motorista mais próximo elegível, não outro contexto',()=>{
  const o=createCollectionOrder(input,admin),near=driver('near'),far=driver('far',0.1),foreign={...driver('foreign',0),branchId:'unidade-b'};
  const assigned=assignOrder(o,{mode:'automatic',at},admin,[far,foreign,near],[o]);assert.equal(assigned.driverId,'near');assert.equal(o.driverId,null);assert.equal(assigned.status,'assigned');
});
test('inativo, ocupado, indisponível e capacidade insuficiente não participam',()=>{
  const o=createCollectionOrder(input,admin),d=driver('driver');
  for(const wrong of [{...d,active:false},{...d,available:false},{...d,capacityVolumes:2},{...d,role:'collector'},{...d,companyId:'outra'}])assert.equal(driverCandidates(o,[wrong],[o],at)[0].eligible,false);
  const active=assignOrder(o,{mode:'automatic',at},admin,[d],[o]);const second=createCollectionOrder({...input,id:'os2'},admin);assert.throws(()=>assignOrder(second,{mode:'automatic',at},admin,[d],[active,second]));
});
test('localização antiga, ausente ou futura impede automático; manual pode operar sem GPS',()=>{
  const o=createCollectionOrder(input,admin),d=driver('driver');
  for(const location of [null,{lat:0,lon:0,at:'2026-11-06T11:29:59Z'},{lat:0,lon:0,at:'2026-11-06T12:01:00Z'}]){
    const changed={...d,location};assert.throws(()=>assignOrder(o,{mode:'automatic',at},admin,[changed],[o]));
    assert.equal(assignOrder(o,{mode:'manual',driverId:d.id,at},admin,[changed],[o]).driverId,d.id);
  }
});
test('manual não escolhe ocupado ou outra unidade e não troca OS já atribuída',()=>{
  const o=createCollectionOrder(input,admin),d=driver('driver'),assigned=assignOrder(o,{mode:'manual',driverId:d.id,at},admin,[d],[o]);
  assert.throws(()=>assignOrder(assigned,{mode:'manual',driverId:d.id,at},admin,[d],[assigned]));
  assert.throws(()=>assignOrder(o,{mode:'manual',driverId:d.id,at},admin,[{...d,branchId:'unidade-b'}],[o]));
});
test('distribuição em lote reserva um motorista por OS sem duplicar em nova execução',()=>{
  const list=[createCollectionOrder(input,admin),createCollectionOrder({...input,id:'os2'},admin),createCollectionOrder({...input,id:'os3'},admin)];
  const drivers=[driver('a'),driver('b',0.1)],r=autoDistribute(list,drivers,admin,{at});assert.equal(r.assigned.length,2);assert.equal(r.unassigned.length,1);assert.equal(new Set(r.orders.filter(o=>o.driverId).map(o=>o.driverId)).size,2);
  assert.equal(autoDistribute(r.orders,drivers,admin,{at}).assigned.length,0);
});
test('motorista só avança a própria OS em sequência e não marca entrega da carga',()=>{
  const d=driver('driver'),o=assignOrder(createCollectionOrder(input,admin),{mode:'automatic',at},admin,[d],[]);
  assert.throws(()=>changeOrder(o,{nextStatus:'collected',note:'Teste',at},d));assert.throws(()=>changeOrder(o,{nextStatus:'accepted',note:'Teste',at},{...d,id:'outro'}));
  let next=o;for(const nextStatus of ['accepted','in_progress','collected'])next=changeOrder(next,{nextStatus,note:'Confirmação fictícia',at},d);
  assert.equal(next.status,'collected');assert.equal(next.delivered,undefined);assert.throws(()=>changeOrder(next,{nextStatus:'collected',note:'Repetição',at},d));
});
test('liberação justificada só antes do início; histórico preserva atribuição anterior',()=>{
  const d=driver('driver'),o=assignOrder(createCollectionOrder(input,admin),{mode:'automatic',at},admin,[d],[]);
  const released=releaseOrder(o,{reason:'Alteração fictícia de disponibilidade',at},admin);assert.equal(released.status,'pending');assert.equal(released.driverId,null);assert.equal(released.history.at(-1).driverId,d.id);
  let started=changeOrder(o,{nextStatus:'accepted',note:'Aceita',at},d);started=changeOrder(started,{nextStatus:'in_progress',note:'Iniciada',at},d);assert.throws(()=>releaseOrder(started,{reason:'Teste',at},admin));
});
test('vínculo de carga exige mesmo contexto aguardando coleta e uma OS ativa',()=>{
  const cargo={id:'cargo',companyId:demoCompany,branchId:'unidade-a',status:'collection_requested'},o=createCollectionOrder({...input,cargoId:cargo.id},admin,cargo);
  assert.throws(()=>createCollectionOrder({...input,id:'outra',cargoId:cargo.id},admin,cargo,[o]));assert.throws(()=>createCollectionOrder({...input,cargoId:cargo.id},admin,{...cargo,status:'received'}));
  assert.throws(()=>createCollectionOrder(input,{...admin,role:'collector'}));
});
