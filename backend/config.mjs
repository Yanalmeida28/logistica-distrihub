export function databaseConfig(env=process.env){
  const mode=env.LOGISTICS_DATABASE_MODE;
  if(!['local','homologation'].includes(mode))return {enabled:false,reason:'not_configured'};
  let url;try{url=new URL(env.LOGISTICS_SUPABASE_URL);}catch{return {enabled:false,reason:'invalid_url'};}
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return {enabled:false,reason:'invalid_url'};
  // Remote access is restricted to the independent project explicitly authorized.
  if(mode==='local'&&(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:'))return {enabled:false,reason:'local_only'};
  if(mode==='homologation'&&(url.origin!=='https://cbbvmtinbgsmehthlhgn.supabase.co'||env.LOGISTICS_PROJECT_REF!=='cbbvmtinbgsmehthlhgn'))return {enabled:false,reason:'project_not_authorized'};
  const key=env.LOGISTICS_PUBLISHABLE_KEY??'';
  let legacyAnon=false;
  try{legacyAnon=JSON.parse(Buffer.from(key.split('.')[1]??'','base64url')).role==='anon';}catch{}
  if(!(key.startsWith('sb_publishable_')&&key.length>25)&&!legacyAnon)return {enabled:false,reason:'publishable_key_required'};
  if(mode==='homologation'&&!key.startsWith('sb_publishable_'))return {enabled:false,reason:'publishable_key_required'};
  return {enabled:true,url:url.origin,key,mode};
}
