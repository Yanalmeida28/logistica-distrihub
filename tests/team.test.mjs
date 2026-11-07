import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEmployee,requestCollection,confirmCollection,advanceCargo,demoCompany} from '../app/domain.mjs';
const admin=createEmployee({id:'admin',name:'Central exemplo',companyId:demoCompany,branchId:'unidade-a',role:'administrative'});
const collector=createEmployee({id:'collector',name:'Coletor exemplo',companyId:demoCompany,branchId:'unidade-a',role:'collector'});
const input={id:'c',code:'COL-TESTE',companyId:demoCompany,branchId:'unidade-a',customer:'Cliente fictício',origin:'Origem fictícia',destination:'Destino fictício',volumes:2,description:'Volumes de teste',at:'2026-11-06T12:00:00Z'};
test('cadastro valida função e unidade do funcionário de exemplo',()=>{
  assert.equal(collector.active,true);assert.equal(admin.role,'administrative');
  for(const patch of [{role:'motorista-sem-contrato'},{branchId:'unidade-externa'},{companyId:'outra'},{name:''}])assert.throws(()=>createEmployee({...collector,...patch}));
});
test('coleta atribuída só avança pela confirmação do coletor; recebimento continua separado',()=>{
  const cargo=requestCollection(input,admin,collector);
  assert.equal(cargo.status,'collection_requested');assert.equal(cargo.events.length,1);assert.equal(cargo.collectorId,collector.id);
  assert.throws(()=>advanceCargo(cargo,{...input,actor:admin.name,expectedStatus:cargo.status,note:'Confirmação'}));
  const picked=confirmCollection(cargo,{...input,note:'Volumes conferidos na origem'},collector);
  assert.equal(picked.status,'collected');assert.equal(picked.events.at(-1).actor,collector.name);assert.equal(cargo.status,'collection_requested');
  assert.throws(()=>confirmCollection(picked,{...input,note:'Repetição'},collector));
  const received=advanceCargo(picked,{...input,actor:admin.name,expectedStatus:'collected',note:'Recebimento confirmado pela unidade'});
  assert.equal(received.status,'received');assert.deepEqual(received.events.map(e=>e.kind),['collection_requested','collected','received']);
});
test('funcionário inativo, papel errado, outra unidade e outro coletor são rejeitados no exemplo',()=>{
  const cargo=requestCollection(input,admin,collector);
  for(const wrong of [{...collector,id:'outro'},{...collector,active:false},{...collector,branchId:'unidade-b'},{...collector,companyId:'outra'},admin])assert.throws(()=>confirmCollection(cargo,{...input,note:'Confirmação'},wrong));
  assert.throws(()=>requestCollection(input,{...admin,active:false},collector));
  assert.throws(()=>requestCollection(input,collector,collector));
  assert.throws(()=>requestCollection(input,admin,{...collector,branchId:'unidade-b'}));
});
