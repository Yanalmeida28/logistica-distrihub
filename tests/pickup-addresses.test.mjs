import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eligiblePickupAddresses,pickupAddressForm,updatePickupSelection,updateDestinationSelection} from '../operation/pickup-addresses.mjs';
const rows=[{id:'a',company_id:'company',customer_id:'customer',branch_id:'branch',label:'Loja',address:'Rua 100',active:true},{id:'b',company_id:'company',customer_id:'customer',branch_id:'branch',label:'Depósito',address:'Rua 200',active:true},{id:'c',company_id:'other',customer_id:'customer',branch_id:'branch',active:true},{id:'d',company_id:'company',customer_id:'other',branch_id:'branch',active:true},{id:'e',company_id:'company',customer_id:'customer',branch_id:'other',active:true},{id:'f',company_id:'company',customer_id:'customer',branch_id:'branch',active:false}];
test('pickup choices match company, customer and branch and exclude inactive locations',()=>{
 assert.deepEqual(eligiblePickupAddresses(rows,{companyId:'company',customerId:'customer',branchId:'branch'}).map(row=>row.id),['a','b']);
 const html=pickupAddressForm({id:'id',label:'<img>',address:'</textarea><script>',active:false},[],{});
 assert(!html.includes('<script>'));assert(html.includes('&lt;img&gt;'));assert(!html.includes('name="branch_id"'));
});
test('destination selection uses only authorized active customer locations and clears stale choices',()=>{
 const input={value:'Manual destination',dataset:{},readOnly:false},select={value:'a',innerHTML:''};
 const form={elements:{destination:input,destination_address_id:select,customer_id:{value:'customer'},branch_id:{value:'branch'}}};
 updateDestinationSelection(form,rows,'company');assert.equal(input.value,'Rua 100');assert.equal(input.readOnly,true);
 form.elements.branch_id.value='other';updateDestinationSelection(form,rows,'company',true);assert.equal(select.value,'');assert.equal(input.value,'');assert.equal(input.readOnly,false);
 assert(pickupAddressForm(null,[],{},'destino').includes('Endereço completo de destino'));
});
test('selecting a saved pickup fills its address; manual choice and customer changes release stale data',()=>{
 const input={value:'',dataset:{},readOnly:false},select={value:'b',innerHTML:''};
 const form={elements:{pickup_address:input,pickup_address_id:select,customer_id:{value:'customer'},branch_id:{value:'branch'}}};
 updatePickupSelection(form,rows,'company');assert.equal(input.value,'Rua 200');assert.equal(input.readOnly,true);
 select.value='';updatePickupSelection(form,rows,'company');assert.equal(input.value,'');assert.equal(input.readOnly,false);
 input.value='Endereço avulso';updatePickupSelection(form,rows,'company');assert.equal(input.value,'Endereço avulso');
 select.value='a';updatePickupSelection(form,rows,'company');form.elements.customer_id.value='other';updatePickupSelection(form,rows,'company',true);assert.equal(input.value,'');assert.equal(select.value,'');
});
