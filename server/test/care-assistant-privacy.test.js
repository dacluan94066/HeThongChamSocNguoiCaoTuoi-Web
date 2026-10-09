const test=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const express=require('express');
function load(relative,stubs,consoleMock){const filename=path.resolve(__dirname,relative);const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,
    require:id=>stubs[id] || createRequire(filename)(id),console:consoleMock},{filename});return module.exports;
}
test('Assistant JSON errors and URLs never enter app logs or echo private input',async()=>{
  const logs=[];const consoleMock={error:(...args)=>logs.push(args),log:(...args)=>logs.push(args)};
  const error=load('../src/middlewares/error.middleware.js',{},consoleMock);
  const router=express.Router();router.post('/care-assistant/chat',(req,res)=>res.json({success:true}));router.get('/ping',(req,res)=>res.json({success:true}));
  const app=load('../src/app.js',{'./routes/index':router,'./middlewares/error.middleware':error,
    morgan:(_,options)=>(req,res,next)=>{if(!options.skip(req))logs.push(req.originalUrl);next();}},consoleMock);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const malformed=await fetch(base+'/api/care-assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"question":"private health note" BROKEN'});
    assert.equal(malformed.status,400);const data=await malformed.json();assert.equal(data.errorCode,'INVALID_JSON');assert.ok(!JSON.stringify(data).includes('private'));
    const oversized=await fetch(base+'/api/care-assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'private'.repeat(20000)})});assert.equal(oversized.status,413);
    const valid=await fetch(base+'/api/care-assistant/chat?question=private-health',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(valid.status,200);
    assert.deepEqual(logs,[]);
    await fetch(base+'/api/ping?public=1');assert.equal(logs.length,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
