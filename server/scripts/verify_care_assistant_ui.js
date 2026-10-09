// Headless Chrome smoke against the compiled Flutter UI + actual Express/SQL.
// Fictitious seed account only; no external AI and no credentials/records logged.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const capabilities=process.argv.includes('--capabilities');
if(!capabilities) process.env.AI_PROVIDER='local-verification';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main({fixture=null,flow=null}={}) {
  const {poolPromise}=require('../src/config/db');const pool=await poolPromise;
  const verified=await pool.request().query(`SELECT nct.CCCD AS cccd,nct.NguoiCaoTuoiID AS id FROM NguoiDung nd
    JOIN HoSoNguoiCaoTuoi nct ON nct.UserID=nd.UserID WHERE nd.TenDangNhap='nct.an'`);
  if(fixture)assert.match(fixture.database,/^CareAssistant_Test_[0-9]+_[a-f0-9]+$/);
  else assert.equal(verified.recordset[0]?.cccd,'079047000101','DEMO_NOT_VERIFIED');
  assert.ok(fixture?.password||process.env.SEED_PASSWORD,'DEMO_PASSWORD_MISSING');
  const chatReplies=[];
  const app=capabilities||fixture ? async(req,res)=>{
    try {
      const upstream=await fetch((fixture?'http://127.0.0.1:5059':'http://127.0.0.1:5000')+req.originalUrl,{method:req.method,headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},...(['GET','HEAD'].includes(req.method)?{}:{body:await new Promise(resolve=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>resolve(body));})}),signal:AbortSignal.timeout(40000)});
      const body=await upstream.text();
      if(req.originalUrl.endsWith('/care-assistant/chat')&&upstream.status===200) chatReplies.push(JSON.parse(body).data);
      res.status(upstream.status).type('json').send(body);
    } catch (_) {res.status(503).json({success:false,message:'Không kết nối được máy chủ.'});}
  } : require('../src/app');
  const root=require('express')();root.use((req,res,next)=>req.path.startsWith('/api/') ? app(req,res,next) : next());
  const webRoot=process.env.ASSISTANT_UI_WEB_DIR || path.resolve(__dirname,'../../mobile/build/web');
  assert.ok(fs.existsSync(path.join(webRoot,'main.dart.js')),'WEB_BUILD_MISSING');
  const localEngine=process.env.FLUTTER_WEB_ENGINE_DIR||'C:/tools/flutter/bin/cache/flutter_web_sdk/canvaskit';
  if(!fs.existsSync(path.join(webRoot,'canvaskit'))&&fs.existsSync(localEngine))root.use('/canvaskit',require('express').static(localEngine));
  root.use(require('express').static(webRoot));
  const server=root.listen(5039,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
  assert.ok(chrome,'CHROME_UNAVAILABLE');
  const tempRoot=fs.realpathSync(os.tmpdir());
  const browserDir=fs.mkdtempSync(path.join(tempRoot,'care-assistant-ui-'));
  let socket,browser;
  try {
    browser=spawn(chrome,['--headless=new','--remote-debugging-port=0','--user-data-dir='+browserDir,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--window-size=430,932','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('CHROME_TIMEOUT')),15000);
      browser.stderr.on('data',chunk=>{output+=chunk.toString();const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
      browser.once('error',reject);
    });
    socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let counter=0,recordTarget=null,sosPosted=false;const pending=new Map();
    socket.onmessage=event=>{const data=JSON.parse(event.data);
      if(data.method==='Network.requestWillBeSent') {
        const req=data.params.request;
        if(req.url.endsWith('/api/care-assistant/query'))recordTarget=JSON.parse(req.postData||'{}').elderlyId;
        if(req.method==='POST'&&req.url.includes('/emergency-alerts'))sosPosted=true;
      }
      if(data.id&&pending.has(data.id)){const p=pending.get(data.id);pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error('CDP_ERROR')):p.resolve(data.result);}};
    socket.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP_CLOSED'));}pending.clear();};
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TIMEOUT'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
    const {targetId}=await send('Target.createTarget',{url:'http://127.0.0.1:5039/'});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const cdp=(method,params={})=>send(method,params,sessionId);
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    const evaluate=async expression=>(await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
    const waitFor=async expression=>{for(let n=0;n<60;n++){if(await evaluate(expression))return;await delay(250);}throw new Error('UI_WAIT_TIMEOUT');};
    try {await waitFor('Boolean(document.querySelector("flt-semantics-placeholder")||document.querySelector("flt-semantics"))');}
    catch(error){const capture=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve(__dirname,'../../mobile/build/mobile-bootstrap-failed.png'),Buffer.from(capture.data,'base64'));throw error;}
    await evaluate('document.querySelector("flt-semantics-placeholder")?.click()');
    console.log('UI_STEP: ACCESSIBILITY_ENABLED');
    const clickText=async label=>{
      await waitFor(`Array.from(document.querySelectorAll('flt-semantics')).some(e=>(e.getAttribute('aria-label')||e.innerText||'').includes(${JSON.stringify(label)}))`);
      const rect=await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('flt-semantics')).find(e=>(e.getAttribute('aria-label')||e.innerText||'').includes(${JSON.stringify(label)})&&(e.getAttribute('role')==='button'||e.hasAttribute('flt-tappable')));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      assert.ok(rect,'UI_BUTTON_NOT_FOUND');
      await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});
      await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});
      await delay(300);
    };
    await clickText('Đăng nhập');
    console.log('UI_STEP: LOGIN_FORM');
    const fields="Array.from(document.querySelectorAll('flt-semantics input,flt-semantics textarea')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.readOnly&&!e.disabled&&e.getAttribute('type')!=='checkbox';})";
    await waitFor(`(${fields}).length>=2`);
    const fill=async(index,text)=>{
      const rect=await evaluate(`(()=>{const e=(${fields})[${index}];const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});
      await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});
      await delay(300);
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
      await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
      await cdp('Input.insertText',{text});
      await delay(300);
    };
    await fill(0,fixture?.user||'nct.an');await fill(1,fixture?.password||process.env.SEED_PASSWORD);await clickText('ĐĂNG NHẬP');
    if(flow){
      await flow({cdp,evaluate,waitFor,clickText,fill,delay,fixture});
      await send('Browser.close');return;
    }
    await clickText('Trợ lý chăm sóc');
    console.log('UI_STEP: ASSISTANT_OPENED');
    if(capabilities) {
      await delay(1500);
      const submit=async text=>{
        const before=chatReplies.length;
        await waitFor(`(${fields}).length>=1`);await fill(0,text);await clickText('Gửi câu hỏi');
        for(let n=0;n<160&&chatReplies.length===before;n++)await delay(250);
        assert.ok(chatReplies.length>before,'UI_CHAT_NOT_SUBMITTED');await delay(500);
        return chatReplies.at(-1);
      };
      for(const stage of ['new_chat','after_medication']) {
        if(stage==='after_medication') {
          await submit('thuốc ngày 2026-10-03?');
        }
        const reply=await submit('bạn có thể hỗ trợ tôi được gì');
        console.log(JSON.stringify({stage:'ui_'+stage,intent:reply.intent,mode:reply.mode,modeReason:reply.modeReason,aiFailureCode:reply.aiFailureCode||null,personalRows:reply.rows.length}));
        const shot=await cdp('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.resolve(__dirname,'../../mobile/build/capability-'+stage+(process.argv.includes('--before')?'-before':'-after')+'.png'),Buffer.from(shot.data,'base64'));
        if(!process.argv.includes('--before')) {
          assert.equal(reply.intent,'capabilities');assert.equal(reply.rows.length,0);
          // Flutter paints SelectableText on canvas; verify its API metadata here,
          // then inspect the saved screenshots for the full rendered answer.
          assert.equal(reply.modeReason,'capabilities');
          assert.deepEqual(reply.actions,[]);
        }
      }
      console.log('CAPABILITY_UI: COMPLETED_RUNNING_APP_API');
      await send('Browser.close');return;
    }
    await clickText('Chỉ số sức khỏe gần nhất của tôi?');
    await delay(1000);
    const preview=await cdp('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.resolve(__dirname,'../../mobile/build/chat-ui-demo.png'),Buffer.from(preview.data,'base64'));
    await clickText('Chỉ số sức khỏe');
    await delay(800);
    assert.equal(recordTarget,verified.recordset[0].id,'UI_NAVIGATION_PROFILE_MISMATCH');
    assert.equal(sosPosted,false,'UNREQUESTED_SOS');
    const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.resolve(__dirname,'../../mobile/build/chat-ui-detail-demo.png'),Buffer.from(screenshot.data,'base64'));
    console.log('UI_SMOKE: PASS_DEMO_LOGIN_CHAT_ANSWER_AND_ACTION');
    await send('Browser.close');
  } finally {
    socket?.close();
    if(browser && browser.exitCode===null){browser.kill();await delay(300);}
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(!fixture)await pool.close();
    // Only remove this newly created, owned browser profile inside the known temp root.
    const resolved=path.resolve(browserDir);
    if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('care-assistant-ui-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
if(require.main===module) main().catch(()=>{console.log('UI_SMOKE: FAILED_OR_UNSUPPORTED');process.exitCode=1;});
module.exports={main};
