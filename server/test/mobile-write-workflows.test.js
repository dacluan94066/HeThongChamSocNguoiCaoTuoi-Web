const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function fixture({role='NguoiChamSoc',allowed=true,assigned=true,author=3,failUpdate=false}={}){
 const trace={begun:0,committed:0,rolledBack:0,updates:0};
 const sql={Int:'int',NVarChar:()=>'',VarChar:()=>'',MAX:'MAX',ISOLATION_LEVEL:{SERIALIZABLE:'serializable'},
  Transaction:class{async begin(){trace.begun++;}async commit(){trace.committed++;}async rollback(){trace.rolledBack++;}},
  Request:class{input(){return this;}async query(query){
   if(query.includes('FROM NhatKyChamSoc'))return {recordset:[{elderlyId:1,status:'HOAN_THANH',author,version:'F'.repeat(64),title:'OLD',content:'OLD CONTENT',type:'SU_CO',careTime:'2024-02-29T08:00:00'}]};
   if(query.includes('SELECT v.TenVaiTro'))return {recordset:[{role}]};
   if(query.includes('SELECT p.ChoPhep'))return {recordset:[{allowed}]};
   if(query.includes('AS available'))return {recordset:[{available:1}]};
   if(query.includes('AS latestId'))return {recordset:[]};
   if(query.includes('INSERT INTO dbo.LichSuNhatKyChamSoc'))return {recordset:[],rowsAffected:[1]};
   if(query.includes('SELECT TOP 1 n.NguoiChamSocID'))return {recordset:assigned?[{NguoiChamSocID:1}]:[]};
   if(query.trimStart().startsWith('UPDATE')){trace.updates++;if(failUpdate)throw new Error('SYNTHETIC_SQL_FAILURE');return {rowsAffected:[1]};}
   throw new Error('UNEXPECTED_QUERY');
  }},
 };
 const db={sql,poolPromise:Promise.resolve({})};
 const socket={emitToAdmin:()=>true};
 const load=(name,workflow)=>{const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/services/'+name),'utf8'),
  {module,exports:module.exports,require:dep=>dep==='../config/db'?db:dep==='../socket'?socket:dep==='./alertWorkflow.service'?workflow:createRequire(path.resolve(__dirname,'../src/services/'+name))(dep)});
  return module.exports;};
 const workflow=load('alertWorkflow.service.js');
 return {trace,workflow,notes:load('careNoteMutation.service.js',workflow),user:{userId:3,tenVaiTro:role}};
}
test('Admin can manage an alert and NCT cannot resolve it',async()=>{
 const admin=fixture({role:'QuanTriVien'});
 await admin.workflow.authorizeWrite({},admin.user,1,'QLCANHBAO');
 const elderly=fixture({role:'NguoiCaoTuoi'});
 await assert.rejects(elderly.workflow.authorizeWrite({},elderly.user,1,'QLCANHBAO'),e=>e.status===403);
});
test('Revoked caregiver assignment denies a transaction write',async()=>{
 const {workflow,user}=fixture({assigned:false});
 await assert.rejects(workflow.authorizeWrite({},user,1,'QLNHATKY'),e=>e.status===403);
});
test('Assigned caregiver may edit a note written by another caregiver',async()=>{
 const {notes,user,trace}=fixture({author:4});
 await notes.mutate({user,id:1,version:'F'.repeat(64),title:'TEST',content:'TEST'});
 assert.equal(trace.updates,1);assert.equal(trace.committed,1);
});
for(const options of [{assigned:false},{role:'NguoiCaoTuoi'}]){
 test('Note mutation requires current assignment and caregiver/admin role: '+JSON.stringify(options),async()=>{
  const {notes,user,trace}=fixture(options);
  await assert.rejects(notes.mutate({user,id:1,version:'F'.repeat(64),title:'TEST',content:'TEST'}),e=>e.status===403);
  assert.equal(trace.updates,0);assert.equal(trace.rolledBack,1);
 });
}
test('Note optimistic conflict rolls back without overwriting',async()=>{
 const {notes,user,trace}=fixture();
 await assert.rejects(notes.mutate({user,id:1,version:'A'.repeat(64),title:'TEST',content:'TEST'}),e=>e.status===409);
 assert.equal(trace.updates,0);assert.equal(trace.rolledBack,1);
});
test('SQL failure rolls back note transaction',async()=>{
 const {notes,user,trace}=fixture({failUpdate:true});
 await assert.rejects(notes.mutate({user,id:1,version:'F'.repeat(64),title:'TEST',content:'TEST'}),/SYNTHETIC_SQL_FAILURE/);
 assert.equal(trace.committed,0);assert.equal(trace.rolledBack,1);
});
test('Soft deletion commits without deleting SQL rows',async()=>{
 const {notes,user,trace}=fixture();
 assert.equal((await notes.mutate({user,id:1,version:'F'.repeat(64),remove:true})).deleted,true);
 assert.equal(trace.updates,1);assert.equal(trace.committed,1);
});
