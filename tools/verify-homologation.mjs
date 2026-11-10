import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {databaseConfig} from '../backend/config.mjs';
const config=databaseConfig();
assert(config.enabled&&config.mode==='homologation','Configure somente o projeto de homologacao autorizado.');
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
const settings=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.key},signal:AbortSignal.timeout(15000)});
assert.equal(settings.status,200,'Auth nao respondeu com sucesso.');
const {error}=await client.from('log_companies').select('id').limit(1);
assert.equal(error?.code,'42501','Acesso anonimo deveria ser recusado por privilegios.');
const {error:rpcError}=await client.rpc('log_create_company',{p_name:'Unreachable anonymous operation',p_branch:'Unreachable'});
assert.equal(rpcError?.code,'42501','Bootstrap anonimo deveria ser recusado antes de executar.');
console.log('PASS homologacao: Auth acessivel, Data API disponivel, leitura anonima bloqueada e bootstrap sem EXECUTE anonimo. Nenhuma conta ou dado criado.');
for(const name of ['log_team','log_collections','log_portal','log_documents','log_chat','log_cargos_workspace','log_freight_read','log_cargo_issues']){
  const {error}=await client.rpc(name,{p_company:null,p_action:'list',p_payload:{}});
  assert.equal(error?.code,'42501','RPC deve existir e negar EXECUTE anonimo: '+name);
}
const {error:addressError}=await client.rpc('log_collection_from_address',{p_company:null,p_payload:{}});
assert.equal(addressError?.code,'42501','Criação por endereço deve negar EXECUTE anônimo.');
for(const name of ['log_team_invites','log_collection_orders','log_cargos','log_collection_events','log_collection_commands','log_portal_invites','log_portal_grants','log_documents','log_document_grants','log_chat_messages','log_cargo_events','log_cargo_commands','log_customer_pickup_addresses','log_cargo_issues','log_cargo_issue_events','log_cargo_issue_commands']){
  const {error}=await client.from(name).select('*').limit(0);
  assert.equal(error?.code,'42501','Tabela deve negar leitura anonima: '+name);
}
console.log('PASS modulos: nove RPCs reconhecidos e sem EXECUTE anonimo; dezesseis tabelas sem leitura anonima. Fluxos autenticados e Storage real com arquivos continuam pendentes.');
