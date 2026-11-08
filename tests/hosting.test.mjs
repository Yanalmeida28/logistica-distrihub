import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {hostingSettings,logisticsOrigin} from '../backend/hosting.mjs';
import {createApi} from '../backend/api.mjs';

test('hosting accepts the dedicated domain and assigned port, preserving local defaults',()=>{
  assert.deepEqual(hostingSettings({}),{publicOrigin:null,port:4180,host:'127.0.0.1'});
  assert.deepEqual(hostingSettings({LOGISTICS_PUBLIC_ORIGIN:logisticsOrigin,PORT:'3000'}),{publicOrigin:logisticsOrigin,port:3000,host:'0.0.0.0'});
  for(const origin of ['http://logistica.distrihub.com.br','https://distrihub.com.br','https://evil.example'])assert.throws(()=>hostingSettings({LOGISTICS_PUBLIC_ORIGIN:origin}));
  for(const PORT of ['-1','65536','abc','1.5'])assert.throws(()=>hostingSettings({PORT}));
});

test('public origin and host are independently enforced; session cookies are Secure and HttpOnly',async()=>{
  let logins=0;
  const client={auth:{signInWithPassword:async()=>{logins++;return {data:{user:{id:'synthetic'},session:{expires_at:Math.floor(Date.now()/1000)+3600}}};}}};
  const api=createApi({publicOrigin:logisticsOrigin,config:{enabled:true,url:'http://127.0.0.1:54321',key:'synthetic'},clientFactory:()=>client});
  const server=http.createServer(async(req,res)=>{if(!await api(req,res)){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const send=(host,origin,path='/api/login')=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{Host:host,Origin:origin,'Content-Type':'application/json'}},res=>{
      res.resume();res.on('end',()=>resolve({status:res.statusCode,cookie:res.headers['set-cookie']?.[0]}));
    });req.on('error',reject);req.end(JSON.stringify({email:'test@example.invalid',password:'synthetic'}));
  });
  try{
    const host=new URL(logisticsOrigin).host;
    assert.equal((await send('evil.example',logisticsOrigin)).status,421);
    for(const origin of ['', 'http://'+host,'https://evil.example'])assert.equal((await send(host,origin)).status,403);
    assert.equal(logins,0);
    const login=await send(host,logisticsOrigin);
    assert.equal(login.status,200);assert.match(login.cookie,/; Secure/);assert.match(login.cookie,/; HttpOnly/);assert.match(login.cookie,/; SameSite=Strict/);
    assert.equal(logins,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
