import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountFreight} from '../operation/freight.mjs';

test('cargo commands cannot submit while document permissions are still loading',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),buttons=[{disabled:false},{disabled:false}],messages=[];let runs=0;
 const child={innerHTML:'',isConnected:true,addEventListener(){},querySelector(){return {innerHTML:''};}};
 const root={innerHTML:'',isConnected:true,dataset:{},events:{},querySelector(){return child;},querySelectorAll(){return buttons;},addEventListener(name,fn){this.events[name]=fn;}};
 const request=async(path,input)=>{
  if(path==='freight')return input.action==='search'?{result:{rows:[],total:0,page:1,pages:1}}:{result:{cargo:{id:'synthetic',origin:'direct',order_id:null,status:'received',version:1,volumes:1},events:[]}};
  if(path==='portal'&&input.action==='incoming')return gate;
  if(path==='portal')return {result:{invites:[],grants:[]}};
  return {result:[]};
 };
 const controller=await mountFreight(root,{request,companyId:'company',membership:{role:'owner'},customers:[],branches:[],run:()=>runs++,notify:message=>messages.push(message)});
 const opening=controller.open('synthetic');await new Promise(setImmediate);
 assert(buttons.every(b=>b.disabled));
 root.events.submit({target:{matches:()=>false,dataset:{freightAction:'references'}},preventDefault(){},stopPropagation(){}});
 assert.equal(runs,0);assert(messages.some(m=>m.includes('carregamento completo')));
 release({result:[]});assert.equal(await opening,true);assert(buttons.every(b=>!b.disabled));
});
