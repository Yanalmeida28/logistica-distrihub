import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {databaseConfig} from './config.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cookieName='logistics_session';
const fields={branches:'id,company_id,name,active',customers:'id,company_id,branch_id,name,active',vehicles:'id,company_id,branch_id,identifier,capacity_volumes,active'};
const tables={branches:'log_branches',customers:'log_customers',vehicles:'log_vehicles'};
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
function text(value,min,max){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw Error('validation');return value.trim();}
async function body(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw Error('validation');
  let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>16384)throw Error('validation');chunks.push(chunk);}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('validation');return data;
}
const cookie=(id='',seconds=0)=>cookieName+'='+id+'; HttpOnly; SameSite=Strict; Path=/api; Max-Age='+seconds;
export function createApi({config=databaseConfig(),clientFactory=createClient,clock=Date.now}={}){
  const sessions=new Map(),attempts=new Map();
  const makeClient=()=>clientFactory(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})}});
  return async function api(req,res){
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(!path.startsWith('/api/'))return false;
    const host=req.headers.host;
    if(!['127.0.0.1:4180','localhost:4180'].includes(host)){json(res,421,{error:'Host inválido.'});return true;}
    if(!['GET','POST'].includes(req.method)){json(res,405,{error:'Método não permitido.'},{Allow:'GET, POST'});return true;}
    if(req.method==='POST'&&req.headers.origin!=='http://'+host){json(res,403,{error:'Origem não autorizada.'});return true;}
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
      if(path==='/api/company'&&req.method==='POST'){
        const input=await body(req),{data,error}=await session.client.rpc('log_create_company',{p_name:text(input.name,2,120),p_branch:text(input.branch,2,120)});
        if(error){json(res,403,{error:'Empresa não criada. Exige identidade verificada e permite uma empresa própria por usuário.'});return true;}
        json(res,201,{id:data});return true;
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
