import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectDocument,handleCollaboration,documentBucket} from '../backend/collaboration.mjs';
const id='00000000-0000-4000-8000-000000000001';
const pdf={filename:'teste.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-test').toString('base64')};
const parsed=inspectDocument(pdf);
const doc={id,path:id+'/'+id+'/'+id,state:'pending',filename:pdf.filename,mime:pdf.mime,byte_size:parsed.byte_size,sha256:parsed.sha256};
const upload={...pdf,company_id:id,order_id:id,request_id:id,action:'upload'};
async function call(input,client){
 const result={};const res={writeHead(status,headers){result.status=status;result.headers=headers;},end(bytes){result.bytes=bytes;}};
 await handleCollaboration({method:'POST'},res,{path:'/api/documents',client,body:async()=>input,json:(_r,status,data)=>Object.assign(result,{status,data}),text:v=>v,UUID:/^[0-9a-f-]{36}$/});
 return result;
}
test('documento exige assinatura inicial, base64 canonico, nome seguro e limite de 5 MB',()=>{
 assert.equal(parsed.byte_size,9);assert.equal(parsed.sha256.length,64);
 for(const patch of [{filename:'../segredo.pdf'},{filename:'a\\b.pdf'},{filename:'a\r\nX-Header:yes'},{filename:'pagina.html'},{filename:'foto.jpg'},{mime:'text/html'},{base64:'%%%='},{base64:''},{base64:Buffer.from('HTML').toString('base64')}])assert.throws(()=>inspectDocument({...pdf,...patch}));
 const bytes=Buffer.alloc(5*1024*1024);bytes.write('%PDF-');assert.equal(inspectDocument({...pdf,base64:bytes.toString('base64')}).byte_size,bytes.length);
 assert.throws(()=>inspectDocument({...pdf,base64:Buffer.alloc(5*1024*1024+1).toString('base64')}));
});
test('upload privado prepara metadados, envia com JWT do usuario e finaliza sem URL publica',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push(args.p_action);return {data:args.p_action==='prepare'?doc:{id}};},storage:{from(bucket){assert.equal(bucket,documentBucket);return {upload:async(path,bytes,options)=>{assert.equal(path,doc.path);assert.equal(options.upsert,false);assert.equal(bytes.length,9);return {};}};}}};
 const result=await call(upload,client);assert.equal(result.status,200);assert.deepEqual(calls,['prepare','finalize']);assert.deepEqual(result.data,{result:{id}});assert(!JSON.stringify(result).includes(doc.path));
});
test('upload com resultado incerto compara hash antes de finalizar, sem reenviar cegamente',async()=>{
 let finalized=0;
 const client={rpc:async(name,args)=>{if(args.p_action==='finalize')finalized++;return {data:args.p_action==='prepare'?doc:{id}};},storage:{from:()=>({upload:async()=>({error:{message:'TIMEOUT PRIVATE'}}),download:async()=>({data:new Blob([parsed.bytes])})})}};
 assert.equal((await call(upload,client)).status,200);assert.equal(finalized,1);
 client.storage.from=()=>({upload:async()=>({error:{}}),download:async()=>({data:new Blob(['different'])})});
 assert.equal((await call(upload,client)).status,403);assert.equal(finalized,1);
});
test('download autentica pelo Storage, confere hash e entrega anexo sem cache',async()=>{
 let downloadCalls=0;const client={rpc:async()=>({data:{...doc,state:'ready'}}),storage:{from:()=>({download:async()=>{downloadCalls++;return {data:new Blob([parsed.bytes])};}})}};
 const response=await call({company_id:id,action:'download',id},client);assert.equal(response.status,200);assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(response.headers['Content-Type'],'application/octet-stream');assert(response.headers['Content-Disposition'].startsWith('attachment;'));assert(Buffer.isBuffer(response.bytes));
 client.rpc=async()=>({error:{message:'PRIVATE ACCESS DENIED'}});
 const denied=await call({company_id:id,action:'download',id},client);assert.equal(denied.status,403);assert.equal(downloadCalls,1);assert(!JSON.stringify(denied).includes('PRIVATE'));
});
test('objeto alterado ou formato invalido nao e servido ao cliente',async()=>{
 const client={rpc:async()=>({data:{...doc,state:'ready'}}),storage:{from:()=>({download:async()=>({data:new Blob(['not a pdf'])})})}};
 assert.equal((await call({company_id:id,action:'download',id},client)).status,403);
});
