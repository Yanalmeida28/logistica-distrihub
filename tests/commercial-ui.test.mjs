import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {commercialFields,amountCents} from '../operation/commercial.mjs';
import {operationTabs,operationPanelId} from '../operation/navigation.mjs';
test('commercial modules live in the authorized main navigation without profile simulation',async()=>{
 for(const role of ['owner','administrative','manager'])for(const id of ['quotes','finance','income','expense','dispatch'])assert.ok(operationTabs(role,true).some(([key])=>key===id));
 for(const role of ['client','driver','collector'])for(const id of ['finance','income','expense'])assert.ok(!operationTabs(role,true).some(([key])=>key===id));
 assert.equal(operationPanelId('dispatch'),'collections');
 const html=await readFile(new URL('../operation/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/<a\b[^>]*href="\/app\//);
});
test('commercial input uses integer cents and preserves mutation versions',()=>{
 assert.equal(amountCents('123,45'),12345);assert.equal(amountCents('0.01'),1);
 for(const value of ['1,234','1e2','-1','NaN','1.000,00'])assert.throws(()=>amountCents(value));
 const payload=commercialFields('income',{action:'create',amount:'120,10',issued_date:'2026-11-12',due_date:'2026-11-20',reference:'DOC-01'});
 assert.equal(payload.amount_cents,12010);assert.equal(payload.details.reference,'DOC-01');assert.equal(payload.amount,undefined);
 assert.equal(commercialFields('income',{expected_version:'2'}).expected_version,2);
});
