const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function flow({cdp,evaluate,waitFor,fill,delay,fixture}){
 const shot=async name=>{const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve(__dirname,'../../mobile/build/mobile-flow-'+name+'.png'),Buffer.from(r.data,'base64'));};
 const click=async(x,y)=>{await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});await delay(400);};
 const tap=async label=>{
  for(let n=0;n<16;n++){
   const rect=await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('flt-semantics')).find(e=>(e.getAttribute('aria-label')||e.innerText||'').includes(${JSON.stringify(label)})&&(e.getAttribute('role')==='button'||e.hasAttribute('flt-tappable')));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:innerHeight};})()`);
   if(rect&&rect.y>0&&rect.y<rect.h-(label==='TEST CLINIC A'?110:0)){await click(rect.x,rect.y);return;}
   await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:220,y:500,deltaX:0,deltaY:rect&&rect.y<0?-450:450});await delay(350);
  }
  throw new Error('UI_TARGET_MISSING_'+label);
 };
 const back=async()=>{await click(28,28);await delay(600);};
 const fillVisible=async(index,value)=>{
  for(let n=0;n<16;n++){
   const r=await evaluate(`(()=>{const es=Array.from(document.querySelectorAll('flt-semantics input,flt-semantics textarea')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.readOnly&&!e.disabled&&e.type!=='checkbox';});const r=es[${index}]?.getBoundingClientRect();return r?{y:r.y+r.height/2,h:innerHeight}:null;})()`);
   if(r&&r.y>60&&r.y<r.h-80){await fill(index,value);return;}
   await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:220,y:350,deltaX:0,deltaY:r&&r.y<60?-300:300});await delay(350);
  }
  throw new Error('UI_FIELD_NOT_VISIBLE');
 };
 try{
 await delay(1300);await shot('home');console.log('MOBILE_UI: LOGIN_HOME');
 await tap('Thuốc');await delay(800);await tap('TEST MED A EVENING');await tap('Đã uống');await delay(4500);await shot('medication');await back();
 console.log('MOBILE_UI: MEDICATION_BACK');
 await tap('TEST CLINIC A');await delay(800);await shot('appointments');await back();
 console.log('MOBILE_UI: APPOINTMENTS_BACK');
 await tap('Sức khỏe');await delay(800);await shot('health');await back();
 console.log('MOBILE_UI: HEALTH_BACK');
 await tap('Thông báo');await delay(800);await tap('TEST READ');await delay(500);await tap('Đóng');await shot('notifications');await back();
 console.log('MOBILE_UI: NOTIFICATIONS_BACK');
 await tap('Cá nhân');await delay(800);await shot('profile');
 await tap('Chỉnh sửa hồ sơ');await delay(800);
 await fill(0,'TEST ONLY A');await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:500,deviceScaleFactor:1,mobile:true});await delay(500);await shot('profile-keyboard-size');
 await cdp('Emulation.clearDeviceMetricsOverride');
 await fillVisible(3,'test-only-a@example.invalid');await fillVisible(4,'TEST UI ADDRESS');await tap('LƯU THAY ĐỔI');await delay(900);
 await tap('Người chăm sóc');await delay(800);await tap('GỬI CẢNH BÁO SOS');await tap('GỬI SOS');await delay(1000);await shot('sos');await delay(9000);await back();
 await tap('ĐĂNG XUẤT');await tap('ĐĂNG XUẤT');await delay(800);
 console.log('MOBILE_UI: PROFILE_LOGOUT');
 await waitFor("document.querySelectorAll('flt-semantics input').length>=2");
 await fill(0,'test.caregiver');await fill(1,fixture.password);await tap('ĐĂNG NHẬP');await delay(1300);await shot('assigned');
 for(const name of ['TEST ONLY A','TEST ONLY B']){await tap(name);await delay(1100);await shot(name.endsWith('A')?'caregiver-a':'caregiver-b');await back();}
 console.log('MOBILE_UI: CAREGIVER_TWO_PROFILES');
 await tap('Đăng xuất');await tap('Đăng xuất');await delay(700);await shot('logout');
 console.log('MOBILE_UI: COMPLETED_ALL_READ_NAVIGATION');
 }catch(error){await shot('failed');throw error;}
}
module.exports={flow};
