const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture({role='NguoiChamSoc',allowed=true,assigned=true,author=3,failUpdate=false}={}){
 const trace={begun:0,committed:0,rolledBack:0,updates:0};
 const sql={Int:'int',NVarChar:()=>'',ISOLATION_LEVEL:{SERIALIZABLE:'serializable'},
  Transaction:class{async begin(){trace.begun++;}async commit(){trace.committed++;}async rollback(){trace.rolledBack++;}},
  Request:class{input(){return this;}async query(query){
   if(query.includes('FROM NhatKyChamSoc'))return {recordset:[{elderlyId:1,status:'HOAN_THANH',author,version:'F'.repeat(64)}]};
   if(query.includes('SELECT v.TenVaiTro'))return {recordset:[{role}]};
   if(query.includes('SELECT p.ChoPhepSua'))return {recordset:[{allowed}]};
   if(query.includes('SELECT TOP 1 n.NguoiChamSocID'))return {recordset:assigned?[{NguoiChamSocID:1}]:[]};
   if(query.startsWith('UPDATE')){trace.updates++;if(failUpdate)throw new Error('SYNTHETIC_SQL_FAILURE');return {rowsAffected:[1]};}
   throw new Error('UNEXPECTED_QUERY');
  }},
 };
 const db={sql,poolPromise:Promise.resolve({})};
 const load=(name,workflow)=>{const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/services/'+name),'utf8'),
  {module,exports:module.exports,require:dep=>dep==='../config/db'?db:dep==='./alertWorkflow.service'?workflow:require(dep)});
  return module.exports;};
 const workflow=load('alertWorkflow.service.js');
 return {trace,workflow,notes:load('careNoteMutation.service.js',workflow),user:{userId:3,tenVaiTro:role}};
}
for(const allowed of [true,1,false,0]){
 test('SOS doctor permission BIT '+allowed,async()=>{
  const {workflow,user}=fixture({role:'BacSi',allowed});
  const operation=workflow.authorizeWrite({},user,1,'QLCANHBAO');
  if(allowed===true||allowed===1)await operation;
  else await assert.rejects(operation,e=>e.status===403);
 });
}
test('Revoked caregiver assignment denies a transaction write',async()=>{
 const {workflow,user}=fixture({assigned:false});
 await assert.rejects(workflow.authorizeWrite({},user,1,'QLNHATKY'),e=>e.status===403);
});
for(const options of [{author:4},{assigned:false},{role:'BacSi'}]){
 test('Note mutation requires current assignment and author/admin: '+JSON.stringify(options),async()=>{
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
