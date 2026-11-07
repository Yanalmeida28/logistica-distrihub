import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountRelations} from '../operation/relations.mjs';
import {mountInternalChat} from '../operation/internal-chat.mjs';
const root=()=>({isConnected:true,innerHTML:'',events:{},addEventListener(k,f){this.events[k]=f;},querySelector(){return null;}});
test('portal renderiza apenas projecao recebida e escapa nomes e destinos',async()=>{
 const r=root();await mountRelations(r,{companyId:'A',membership:{role:'client'},request:async(path,input)=>({result:input.action==='incoming'?[]:[{id:'abcdefgh',status:'received',destination:'<script>',volumes:2,events:[],documents:[]}]}),run(){}});
 assert(r.innerHTML.includes('Minhas cargas'));assert(r.innerHTML.includes('&lt;script&gt;'));assert(!r.innerHTML.includes('Anexar documento'));assert(!r.innerHTML.includes('Chat interno'));
});
test('clique em botao submit do portal nao bloqueia o submit com run concorrente',async()=>{
 const r=root();let runs=0;await mountRelations(r,{request:async()=>({result:[]}),membership:{role:'driver'},run(){runs++;}});
 r.events.click({target:{closest:()=>({dataset:{}})}});assert.equal(runs,0);
});
test('portal sem migration nao usa dados demonstrativos e chat exclui cliente',async()=>{
 const r=root();await mountRelations(r,{request:async()=>{throw Error('PRIVATE');}});assert(r.innerHTML.includes('indisponíveis'));assert(!r.innerHTML.includes('PRIVATE'));
 const chat=root();mountInternalChat(chat,{companyId:'A',membership:{role:'client'}});assert.equal(chat.innerHTML,'');
});
test('chat escapa corpo e mostra apenas conversa retornada para o participante',async()=>{
 const r=root(),nodes={'[data-chat-history]':{innerHTML:''},'[data-chat-peer]':{innerHTML:''},'[data-chat-status]':{textContent:''}};r.querySelector=k=>nodes[k];let pending;
 mountInternalChat(r,{companyId:'A',membership:{id:'me',role:'driver'},branchList:[{id:'B',active:true,name:'Filial'}],request:async(path,input)=>({result:input.action==='contacts'?[{id:'peer',label:'Central'}]:[{sender_id:'peer',body:'<script>private</script>',at:'2026-11-07T12:00:00Z'}]}),run:fn=>{pending=fn();}});
 r.events.change({target:{matches:k=>k==='[data-chat-branch]',value:'B'}});await pending;
 r.events.change({target:{matches:k=>k==='[data-chat-peer]',value:'peer'}});await pending;
 assert(nodes['[data-chat-history]'].innerHTML.includes('&lt;script&gt;'));assert(!nodes['[data-chat-history]'].innerHTML.includes('<script>'));
});
