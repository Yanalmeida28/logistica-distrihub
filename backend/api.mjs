import {customerRecord,customerFields} from './customer-record.mjs';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {logisticsOrigin} from './hosting.mjs';
import {databaseConfig} from './config.mjs';
import {handleCollaboration} from './collaboration.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cookieName='logistics_session';
const fields={branches:'id,company_id,name,active',customers:'id,company_id,branch_id,name,active',vehicles:'id,company_id,branch_id,identifier,capacity_volumes,active'};
const tables={branches:'log_branches',customers:'log_customers',vehicles:'log_vehicles'};
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
function text(value,min,max){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw Error('validation');return value.trim();}
async function body(req,maxLength=16384){
  if(!req.headers['content-type']?.startsWith('application/json'))throw Error('validation');
  let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>maxLength)throw Error('validation');chunks.push(chunk);}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('validation');return data;
}
export function createApi({config=databaseConfig(),clientFactory=createClient,clock=Date.now,publicOrigin=null}={}){
  if(publicOrigin&&publicOrigin!==logisticsOrigin)throw Error('Dominio de hospedagem nao autorizado.');
  const cookie=(id='',seconds=0)=>cookieName+'='+id+'; HttpOnly; SameSite=Strict; Path=/api; Max-Age='+seconds+(publicOrigin?'; Secure':'');
  const sessions=new Map(),attempts=new Map();
  const makeClient=()=>clientFactory(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})}});
  return async function api(req,res){
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(!path.startsWith('/api/'))return false;
    const host=req.headers.host;
    if(!(publicOrigin?host===new URL(publicOrigin).host:['127.0.0.1:4180','localhost:4180'].includes(host))){json(res,421,{error:'Host inválido.'});return true;}
    if(!['GET','POST'].includes(req.method)){json(res,405,{error:'Método não permitido.'},{Allow:'GET, POST'});return true;}
    if(req.method==='POST'&&req.headers.origin!==(publicOrigin??'http://'+host)){json(res,403,{error:'Origem não autorizada.'});return true;}
    if(path==='/api/status'&&req.method==='GET'){json(res,200,{configured:config.enabled,mode:config.enabled?(config.mode??'local'):'disabled',reason:config.enabled?null:config.reason});return true;}
    if(!config.enabled){json(res,503,{error:'Supabase local não configurado. A operação permanece bloqueada.'});return true;}
    for(const [id,s] of sessions)if(s.expires<=clock())sessions.delete(id);
    for(const [ip,a] of attempts)if(a.until<=clock())attempts.delete(ip);
    const sessionId=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(path==='/api/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress,attempt=attempts.get(ip)??{count:0,until:clock()+60000};
      if(attempt.count>=5||sessions.size>=100){json(res,429,{error:'Aguarde antes de tentar novamente.'});return true;}
      attempt.count++;attempts.set(ip,attempt);
      try{
        const data=await body(req),email=text(data.email,3,254),client=makeClient();
        if(typeof data.password!=='string'||data.password.length<1||data.password.length>1024)throw Error('validation');
        const password=data.password;
        const {data:auth,error}=await client.auth.signInWithPassword({email,password});
        if(error||!auth?.session||!auth.user?.id||auth.user.is_anonymous){json(res,401,{error:'Não foi possível autenticar. Confira seu acesso.'});return true;}
        const id=randomBytes(32).toString('hex'),expires=Math.min(clock()+3600000,auth.session.expires_at*1000);
        if(!Number.isFinite(expires)||expires<=clock()){json(res,401,{error:'Sessão inválida.'});return true;}
        if(sessionId)sessions.delete(sessionId);
        sessions.set(id,{client,expires});json(res,200,{authenticated:true},{'Set-Cookie':cookie(id,Math.floor((expires-clock())/1000))});
      }catch{json(res,400,{error:'Não foi possível concluir o acesso. Verifique os campos e o serviço local.'});}
      return true;
    }
    const session=sessions.get(sessionId);
    if(!session){json(res,401,{error:'Entre novamente para continuar.'},{'Set-Cookie':cookie()});return true;}
    try{
      // Validate against Auth, never trust a decoded browser JWT or a UI role.
      const {data:userData,error:userError}=await session.client.auth.getUser();
      if(userError||!userData?.user?.id||userData.user.is_anonymous){sessions.delete(sessionId);json(res,401,{error:'Sessão encerrada.'},{'Set-Cookie':cookie()});return true;}
      if(path==='/api/logout'&&req.method==='POST'){
        sessions.delete(sessionId);await session.client.auth.signOut({scope:'local'});json(res,200,{authenticated:false},{'Set-Cookie':cookie()});return true;
      }
      if(path==='/api/workspace'&&req.method==='GET'){
        const client=session.client;
        const results=await Promise.all([
          client.from('log_companies').select('id,name,active').order('name'),
          client.from('log_memberships').select('id,company_id,role,active'),
          ...Object.keys(tables).map(kind=>client.from(tables[kind]).select(fields[kind]).order(kind==='vehicles'?'identifier':'name').limit(500))
        ]);
        if(results.some(r=>r.error)){json(res,503,{error:'Estrutura indisponível. Confirme a instalação local da migration.'});return true;}
        json(res,200,{user:{id:userData.user.id,email:userData.user.email},companies:results[0].data,memberships:results[1].data,branches:results[2].data,customers:results[3].data,vehicles:results[4].data,limit:500});return true;
      }
      if(await handleCollaboration(req,res,{path,client:session.client,body,json,text,UUID}))return true;
      if(path==='/api/collections'&&req.method==='POST'){
        const input=await body(req);
        if(!UUID.test(input.company_id)||!['list','create','assign','release','accept','start','collect','receive','advance'].includes(input.action))throw Error('validation');
        const payload={};
        if(input.action!=='list'){
          if(!UUID.test(input.request_id))throw Error('validation');payload.request_id=input.request_id;payload.note=text(input.note,3,500);
          if(input.action==='create'){
            if(!UUID.test(input.branch_id)||!UUID.test(input.customer_id)||!Number.isInteger(input.volumes)||input.volumes<1||input.volumes>100000)throw Error('validation');
            Object.assign(payload,{branch_id:input.branch_id,customer_id:input.customer_id,destination:text(input.destination,3,300),volumes:input.volumes});
            if(input.destination_address_id){if(!UUID.test(input.destination_address_id))throw Error('validation');payload.destination_address_id=input.destination_address_id;}
            if(input.pickup_address_id){if(!UUID.test(input.pickup_address_id))throw Error('validation');payload.pickup_address_id=input.pickup_address_id;}
            else payload.pickup_address=text(input.pickup_address,3,300);
          }else{
            if(!UUID.test(input.id)||!Number.isInteger(input.expected_version)||input.expected_version<1)throw Error('validation');
            payload.id=input.id;payload.expected_version=input.expected_version;
            if(input.action==='assign'){if(!UUID.test(input.assignee_id)||!UUID.test(input.vehicle_id))throw Error('validation');payload.assignee_id=input.assignee_id;payload.vehicle_id=input.vehicle_id;}
            if(input.action==='advance'){if(!['shipped','destination','out_for_delivery','delivered'].includes(input.next_status))throw Error('validation');payload.next_status=input.next_status;}
          }
        }
        const savedAddress=input.action==='create'&&payload.pickup_address_id;
        const savedDestination=input.action==='create'&&payload.destination_address_id;
        const {data,error}=await session.client.rpc(savedDestination?'log_create_with_destination':savedAddress?'log_collection_from_address':'log_collections',{p_company:input.company_id,...(savedDestination?{p_kind:'collection'}:savedAddress?{}:{p_action:input.action}),p_payload:payload});
        if(error){json(res,403,{error:'Operação recusada. Atualize os dados e confira etapa, empresa, filial e permissões.'});return true;}
        json(res,200,{result:data});return true;
      }
      if(['/api/pickup-addresses','/api/destination-addresses'].includes(path)&&req.method==='POST'){
        const input=await body(req);
        if(!UUID.test(input.company_id)||!['list','create','update'].includes(input.action))throw Error('validation');
        const columns='id,company_id,branch_id,customer_id,label,address,active,created_at';
        const destination=path==='/api/destination-addresses';
        let query=session.client.from(destination?'log_customer_destination_addresses':'log_customer_pickup_addresses');
        if(input.action==='list'){
          query=query.select(columns).eq('company_id',input.company_id);
          if(input.customer_id){if(!UUID.test(input.customer_id))throw Error('validation');query=query.eq('customer_id',input.customer_id);}
          query=query.order('label').limit(500);
        }else{
          const record={label:text(input.label,2,80),address:text(input.address,3,300)};
          if(input.action==='create'){
            if(!UUID.test(input.customer_id)||!UUID.test(input.branch_id))throw Error('validation');
            query=query.insert({...record,company_id:input.company_id,customer_id:input.customer_id,branch_id:input.branch_id});
          }else{
            if(!UUID.test(input.id)||typeof input.active!=='boolean')throw Error('validation');
            query=query.update({...record,active:input.active}).eq('company_id',input.company_id).eq('id',input.id);
          }
          query=query.select(columns).single();
        }
        const {data,error}=await query;
        if(error){const pending=['42P01','PGRST205'].includes(error.code);json(res,pending?503:403,{error:'Endereços indisponíveis ou operação recusada. Confira filial, cliente e permissões.',...(pending?{code:destination?'destination_address_schema_pending':'pickup_address_schema_pending'}:{})});return true;}
        json(res,input.action==='create'?201:200,input.action==='list'?{records:data,limit:500}:{record:data});return true;
      }
      if(path==='/api/team'&&req.method==='POST'){
        const input=await body(req);
        if(!['incoming','list','invite','accept','revoke','update'].includes(input.action))throw Error('validation');
        if(input.action!=='incoming'&&!UUID.test(input.company_id))throw Error('validation');
        const payload={};
        if(['accept','revoke','update'].includes(input.action)){if(!UUID.test(input.id))throw Error('validation');payload.id=input.id;}
        if(['invite','update'].includes(input.action)){
          if(!['administrative','manager','collector','driver'].includes(input.role)||!Array.isArray(input.branch_ids)||(input.branch_ids.length<1&&!(input.action==='update'&&input.active===false))||input.branch_ids.length>100||input.branch_ids.some(id=>!UUID.test(id)))throw Error('validation');
          payload.role=input.role;payload.branch_ids=[...new Set(input.branch_ids)];
          if(input.action==='invite')payload.email=text(input.email,3,254);
          else {if(typeof input.active!=='boolean')throw Error('validation');payload.active=input.active;}
        }
        const {data,error}=await session.client.rpc('log_team',{p_company:input.action==='incoming'?null:input.company_id,p_action:input.action,p_payload:payload});
        if(error){json(res,403,{error:'Operação de equipe recusada. Confira convite, filiais e permissão de proprietário.'});return true;}
        json(res,200,{result:data});return true;
      }
      if(path==='/api/company'&&req.method==='POST'){
        const input=await body(req),{data,error}=await session.client.rpc('log_create_company',{p_name:text(input.name,2,120),p_branch:text(input.branch,2,120)});
        if(error){json(res,403,{error:'Empresa não criada. Exige identidade verificada e permite uma empresa própria por usuário.'});return true;}
        json(res,201,{id:data});return true;
      }
      if(path==='/api/cargo-issues'&&req.method==='POST'){
        const input=await body(req),payload={};
        if(!UUID.test(input.company_id)||!['queue','detail','create','resolve'].includes(input.action))throw Error('validation');
        if(input.action==='queue'){
          payload.page=input.page??1;if(!Number.isInteger(payload.page)||payload.page<1||payload.page>1000000)throw Error('validation');
          payload.status=input.status??'open';if(!['open','resolved','all'].includes(payload.status))throw Error('validation');
          if(input.branch_id){if(!UUID.test(input.branch_id))throw Error('validation');payload.branch_id=input.branch_id;}
        }else {
          const key=input.action==='resolve'?'id':'cargo_id';if(!UUID.test(input[key]))throw Error('validation');payload[key]=input[key];
          if(input.action!=='detail'){
            if(!UUID.test(input.request_id))throw Error('validation');payload.request_id=input.request_id;payload.note=text(input.note,3,500);
            if(input.action==='create'){
              if(!['damage','volume'].includes(input.kind)||!['self','central'].includes(input.responsibility))throw Error('validation');
              payload.kind=input.kind;payload.responsibility=input.responsibility;
              if(input.kind==='volume'){payload.observed_volumes=Number(input.observed_volumes);if(!Number.isInteger(payload.observed_volumes)||payload.observed_volumes<0||payload.observed_volumes>100000)throw Error('validation');}
            }else {if(!Number.isInteger(input.expected_version)||input.expected_version<1)throw Error('validation');payload.expected_version=input.expected_version;}
          }
        }
        const {data,error}=await session.client.rpc('log_cargo_issues',{p_company:input.company_id,p_action:input.action,p_payload:payload});
        if(error){json(res,403,{error:'Pendência recusada. Confira acesso, versão e migration de pendências.'});return true;}
        json(res,200,{result:data});return true;
      }
      if(path==='/api/freight'&&req.method==='POST'){
        const input=await body(req),payload={};
        if(!UUID.test(input.company_id)||!['search','detail'].includes(input.action))throw Error('validation');
        if(input.action==='detail'){if(!UUID.test(input.id))throw Error('validation');payload.id=input.id;}
        else {
          payload.term=input.term==null?'':text(input.term,0,120);
          for(const [key,max,initial] of [['page',1000000,1],['page_size',50,20]]){const v=input[key]??initial;if(!Number.isInteger(v)||v<1||v>max)throw Error('validation');payload[key]=v;}
          if(input.branch_id){if(!UUID.test(input.branch_id))throw Error('validation');payload.branch_id=input.branch_id;}
          if(input.status){if(!['received','shipped','destination','out_for_delivery','delivered'].includes(input.status))throw Error('validation');payload.status=input.status;}
        }
        const {data,error}=await session.client.rpc('log_freight_read',{p_company:input.company_id,p_action:input.action,p_payload:payload});
        if(error){json(res,403,{error:'Busca indisponível. Confira permissões e instalação da migration de busca.'});return true;}
        json(res,200,{result:data});return true;
      }
      if(path==='/api/cargos'&&req.method==='POST'){
        const input=await body(req);
        if(!UUID.test(input.company_id)||!['list','detail','create_direct','references','advance'].includes(input.action))throw Error('validation');
        const payload={};
        if(input.action==='create_direct'){
          for(const key of ['branch_id','customer_id']){if(!UUID.test(input[key]))throw Error('validation');payload[key]=input[key];}
          payload.destination=text(input.destination,3,300);payload.volumes=Number(input.volumes);
          if(input.destination_address_id){if(!UUID.test(input.destination_address_id))throw Error('validation');payload.destination_address_id=input.destination_address_id;}
          if(!Number.isInteger(payload.volumes)||payload.volumes<1||payload.volumes>100000)throw Error('validation');
        }else if(input.action!=='list'){if(!UUID.test(input.id))throw Error('validation');payload.id=input.id;}
        if(['create_direct','references'].includes(input.action))for(const key of ['nf_reference','cte_reference'])payload[key]=input[key]==null||input[key]===''?null:text(input[key],1,80);
        if(!['list','detail'].includes(input.action)){
          if(!UUID.test(input.request_id))throw Error('validation');payload.request_id=input.request_id;payload.note=text(input.note,3,500);
          if(input.action!=='create_direct'){if(!Number.isInteger(input.expected_version)||input.expected_version<1)throw Error('validation');payload.expected_version=input.expected_version;}
          if(input.action==='advance'){if(!['shipped','destination','out_for_delivery','delivered'].includes(input.next_status))throw Error('validation');payload.next_status=input.next_status;}
        }
        const savedDestination=input.action==='create_direct'&&payload.destination_address_id;
        const {data,error}=await session.client.rpc(savedDestination?'log_create_with_destination':'log_cargos_workspace',{p_company:input.company_id,...(savedDestination?{p_kind:'direct'}:{p_action:input.action}),p_payload:payload});
        if(error){json(res,403,{error:'Carga indisponivel ou operacao recusada. Confira empresa, filial, permissao, versao e migration de recebimento.'});return true;}
        json(res,200,{result:data});return true;
      }
      if(path==='/api/customers'&&req.method==='POST'){
        const input=await body(req);
        if(!UUID.test(input.company_id)||!['list','create','update'].includes(input.action))throw Error('validation');
        let query=session.client.from('log_customers');
        if(input.action==='list')query=query.select(customerFields).eq('company_id',input.company_id).order('name').limit(500);
        else {
          const record=customerRecord(input);
          if(input.action==='create'){
            if(input.branch_id!=null&&input.branch_id!==''&&!UUID.test(input.branch_id))throw Error('validation');
            query=query.insert({...record,company_id:input.company_id,branch_id:input.branch_id||null});
          }else{
            if(!UUID.test(input.id)||typeof input.active!=='boolean')throw Error('validation');
            query=query.update({...record,active:input.active}).eq('company_id',input.company_id).eq('id',input.id);
          }
          query=query.select(customerFields).single();
        }
        const {data,error}=await query;
        if(error){const missingSchema=['42703','PGRST204'].includes(error.code);json(res,missingSchema?503:403,{error:'Cadastro de clientes indisponivel ou recusado. Confira campos, permissao e migration de clientes.',...(missingSchema?{code:'customer_schema_pending'}:{})});return true;}
        json(res,input.action==='create'?201:200,input.action==='list'?{records:data,limit:500}:{record:data});return true;
      }
      if(path==='/api/records'&&req.method==='POST'){
        const input=await body(req),kind=input.kind;
        if(!Object.hasOwn(tables,kind)||!UUID.test(input.company_id))throw Error('validation');
        const record={company_id:input.company_id};
        if(kind==='vehicles'){
          record.identifier=text(input.identifier,2,40);record.capacity_volumes=input.capacity_volumes==null||input.capacity_volumes===''?null:Number(input.capacity_volumes);
          if(record.capacity_volumes!==null&&(!Number.isInteger(record.capacity_volumes)||record.capacity_volumes<1||record.capacity_volumes>100000))throw Error('validation');
        }else record.name=text(input.name,2,120);
        if(kind!=='branches'){
          if(input.branch_id==null||input.branch_id===''){if(kind==='vehicles')throw Error('validation');record.branch_id=null;}
          else {if(!UUID.test(input.branch_id))throw Error('validation');record.branch_id=input.branch_id;}
        }
        // The SDK uses this user's session. No service key or RLS bypass.
        const {data,error}=await session.client.from(tables[kind]).insert(record).select(fields[kind]).single();
        if(error){json(res,403,{error:'Cadastro recusado. Confira empresa, filial, permissões e campos.'});return true;}
        json(res,201,{record:data});return true;
      }
      json(res,404,{error:'Operação indisponível.'});
    }catch{json(res,400,{error:'Não foi possível concluir. Confira os campos e a conexão local.'});}
    return true;
  };
}
