import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountTeam} from '../operation/team.mjs';
import {operationTabs} from '../operation/navigation.mjs';
import {administrativeSections} from '../operation/admin-area.mjs';

test('manager sees operational tasks and management but has only personal invitations in team',()=>{
 assert.deepEqual(operationTabs('manager',true),operationTabs('administrative',true));
 assert(administrativeSections('manager').some(([id,label])=>id==='team'&&label==='Meus convites'));
 assert(!administrativeSections('manager').some(([,label])=>label==='Equipe e convites'));
});
test('owner can select Manager for invitations and existing members; manager cannot mount staff controls',async()=>{
 const root=()=>({innerHTML:'',isConnected:true,addEventListener(){}});
 const owner=root();
 await mountTeam(owner,{owner:true,companyId:'company',branchList:[],request:async(_path,input)=>({result:input.action==='incoming'?[]:{members:[{id:'m',email:'synthetic@example.invalid',role:'manager',active:true,branch_ids:[]}],invites:[]}})});
 assert(owner.innerHTML.includes('value="manager" selected>Gerente'));
 assert(owner.innerHTML.includes('id="team-invite"'));
 const manager=root(),calls=[];
 await mountTeam(manager,{owner:false,companyId:'company',branchList:[],request:async(_path,input)=>{calls.push(input.action);return {result:[]};}});
 assert.deepEqual(calls,['incoming']);assert(!manager.innerHTML.includes('id="team-invite"'));assert(!manager.innerHTML.includes('data-member='));
});
