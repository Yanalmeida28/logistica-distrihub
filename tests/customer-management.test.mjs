import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerRecord} from '../backend/customer-record.mjs';
import {customerForm,mountCustomers} from '../operation/customers.mjs';
import {managementMarkup} from '../operation/management.mjs';
import {operationTabs} from '../operation/navigation.mjs';
test('missing customer migration preserves existing basic form; permission errors do not',async()=>{
  for(const code of ['customer_schema_pending','permission_denied']){
    const root={innerHTML:'<form data-record="customers">Basic existing form</form>',isConnected:true};
    await mountCustomers(root,{membership:{role:'owner'},companyId:'a',branches:[],request:async()=>{throw Object.assign(Error('unavailable'),{code});}});
    assert.equal(root.innerHTML.includes('Basic existing form'),code==='customer_schema_pending');
  }
});

test('customer payload whitelists optional contact fields and rejects malformed values',()=>{
  const row=customerRecord({name:' Cliente ',email:'test@example.invalid',company_id:'forged',active:false,role:'owner'});
  assert.equal(row.name,'Cliente');assert.equal(row.phone,null);assert(!('company_id' in row));assert(!('role' in row));assert(!('active' in row));
  for(const values of [{person_type:'admin'},{email:'invalid'},{state:'sp'},{notes:'a'.repeat(1001)},{phone:123}])assert.throws(()=>customerRecord({name:'Cliente',...values}));
});
test('forms escape personal data; shared customers only offered to owner; branch immutable on edit',()=>{
  assert.match(customerForm({},[],true),/<option value="">Compartilhado/);
  assert(!customerForm({},[],false).includes('Compartilhado'));
  const edit=customerForm({id:'id',name:'<img>',notes:'</textarea><script>',active:false},[],true);
  assert(!edit.includes('<script>'));assert(!edit.includes('name="branch_id"'));assert.match(edit,/value="false" selected/);assert.match(edit,/&lt;img&gt;/);
});
test('administration is limited to management roles, settings has no credential entry or invented financial balance',()=>{
  const workspace={companies:[{id:'a',name:'<Empresa>'}],branches:[],customers:[],vehicles:[],user:{email:'<email>'}};
  for(const role of ['owner','administrative','driver','collector','client']){
    const tabs=operationTabs(role,true).map(([id])=>id),management=['owner','administrative'].includes(role);
    assert.equal(tabs.includes('administrative'),management);assert.equal(tabs.includes('customers'),false);assert.equal(tabs.includes('settings'),!management);
    const html=managementMarkup({workspace,companyId:'a',membership:{role},mode:'homologation'});
    assert.equal(html.includes('data-operation-panel="administrative"'),management);assert(!html.includes('<Empresa>'));assert(!html.includes('<email>'));assert(!html.includes('type="password"'));
  }
});
