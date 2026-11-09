import {createHash} from 'node:crypto';
export const documentBucket='logistics-private-documents';
const maxBytes=5*1024*1024;
export function inspectDocument({filename,mime,base64}){
  if(typeof filename!=='string'||!filename.trim()||filename.length>160||/[\x00-\x1f\x7f/\\]/.test(filename))throw Error('Invalid filename');
  const extensions={'application/pdf':/\.pdf$/i,'image/png':/\.png$/i,'image/jpeg':/\.jpe?g$/i};
  if(!extensions[mime]?.test(filename.trim()))throw Error('Extension mismatch');
  if(typeof base64!=='string'||base64.length>Math.ceil(maxBytes/3)*4||!base64.length||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('Invalid content');
  const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>maxBytes||bytes.toString('base64')!==base64)throw Error('Invalid size');
  const signatures={'application/pdf':[37,80,68,70,45],'image/png':[137,80,78,71,13,10,26,10],'image/jpeg':[255,216,255]};
  const signature=signatures[mime];if(!signature||bytes.length<signature.length||!signature.every((b,i)=>bytes[i]===b))throw Error('Invalid format');
  return {filename:filename.trim(),mime,bytes,byte_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function handleCollaboration(req,res,{path,client,body,json,text,UUID}){
  if(req.method!=='POST'||!['/api/portal','/api/chat','/api/documents'].includes(path))return false;
  const input=await body(req,path==='/api/documents'?8*1024*1024:16384);
  const id=(value)=>{if(!UUID.test(value))throw Error('validation');return value;};
  const resource=()=>{if(input.order_id&&input.cargo_id)throw Error('validation');return input.cargo_id?{cargo_id:id(input.cargo_id)}:{order_id:id(input.order_id)};};
  const company=input.action==='incoming'&&path==='/api/portal'?null:id(input.company_id);
  const invoke=async(name,action,payload)=>{
    const {data,error}=await client.rpc(name,{p_company:company,p_action:action,p_payload:payload});
    if(error)throw Error('Operation denied');return data;
  };
  if(path==='/api/portal'){
    if(!['incoming','list','manage','invite','accept','revoke_invite','revoke'].includes(input.action))throw Error('validation');
    const payload={};
    if(['manage','invite','revoke_invite','revoke'].includes(input.action))Object.assign(payload,resource());
    if(['accept','revoke_invite'].includes(input.action))payload.id=id(input.id);
    if(input.action==='invite')payload.email=text(input.email,3,254);
    if(input.action==='revoke')payload.membership_id=id(input.membership_id);
    try{json(res,200,{result:await invoke('log_portal',input.action,payload)});}catch{json(res,403,{error:'Portal indisponível ou acesso recusado. Confira o convite e as permissões.'});}return true;
  }
  if(path==='/api/chat'){
    if(!['contacts','list','send'].includes(input.action))throw Error('validation');
    const payload={branch_id:id(input.branch_id)};
    if(input.action!=='contacts')payload.recipient_id=id(input.recipient_id);
    if(input.action==='send'){payload.body=text(input.body,1,2000);payload.request_id=id(input.request_id);}
    try{json(res,200,{result:await invoke('log_chat',input.action,payload)});}catch{json(res,403,{error:'Conversa recusada. Confira empresa, filial e participantes ativos.'});}return true;
  }
  if(!['list','upload','download','share','unshare','revoke'].includes(input.action))throw Error('validation');
  const payload=input.action==='download'?{id:id(input.id)}:resource();
  if(['share','unshare','revoke'].includes(input.action))payload.id=id(input.id);
  if(['share','unshare'].includes(input.action))payload.membership_id=id(input.membership_id);
  try{
    if(input.action==='upload'){
      const file=inspectDocument(input),request_id=id(input.request_id);
      const doc=await invoke('log_documents','prepare',{...payload,request_id,filename:file.filename,mime:file.mime,byte_size:file.byte_size,sha256:file.sha256});
      const storage=client.storage.from(documentBucket);
      if(doc.state!=='ready'){
        const uploaded=await storage.upload(doc.path,file.bytes,{contentType:file.mime,upsert:false,cacheControl:'0'});
        if(uploaded.error){
          // An upload timeout may follow acceptance; compare the existing object before retry/finalize.
          const existing=await storage.download(doc.path);if(existing.error||!existing.data)throw Error('Upload unavailable');
          const bytes=Buffer.from(await existing.data.arrayBuffer());if(bytes.length!==file.byte_size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Object mismatch');
        }
        await invoke('log_documents','finalize',{...payload,id:doc.id});
      }
      json(res,200,{result:{id:doc.id}});return true;
    }
    if(input.action==='download'){
      const doc=await invoke('log_documents','download',payload);
      const {data,error}=await client.storage.from(documentBucket).download(doc.path);if(error||!data)throw Error('Download denied');
      if(data.size>maxBytes||data.size!==doc.byte_size)throw Error('Object mismatch');
      const bytes=Buffer.from(await data.arrayBuffer());
      if(createHash('sha256').update(bytes).digest('hex')!==doc.sha256)throw Error('Object mismatch');
      inspectDocument({filename:doc.filename,mime:doc.mime,base64:bytes.toString('base64')});
      const ext={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[doc.mime];
      const encodedName=encodeURIComponent(doc.filename).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':'attachment; filename="documento.'+ext+'"; filename*=UTF-8\'\''+encodedName});res.end(bytes);return true;
    }
    json(res,200,{result:await invoke('log_documents',input.action,payload)});
  }catch{json(res,403,{error:'Documento indisponível ou operação recusada. Confira formato, limite de 5 MB, instalação do Storage e permissões.'});}
  return true;
}
