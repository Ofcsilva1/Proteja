const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function callable(access={active:true,role:'administrador'}) {
  const paths=[];
  let writes=0;
  class HttpsError extends Error { constructor(code,message){super(message);this.code=code;} }
  const database={ref(path){
    paths.push(path);
    return {get:async()=>({val:()=>access}),transaction:async()=>{writes++;return {committed:true};}};
  }};
  const exports={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8'),{
    exports,Buffer,process:{env:{}},require(name){
      if(name==='firebase-admin/app')return {initializeApp:()=>({})};
      if(name==='firebase-admin/database')return {getDatabase:()=>database};
      if(name==='firebase-functions/v2/https')return {HttpsError,onCall:(_options,handler)=>handler};
      if(name==='node:crypto')return require(name);
      if(name==='./service.cjs')return require('../functions/service.cjs');
      throw new Error(`Unexpected dependency ${name}`);
    }
  });
  return {invoke:exports.importarCaso,paths,writes:()=>writes};
}

test('legacy import rejects anonymous requests without database access',async()=>{
  const f=callable();
  await assert.rejects(f.invoke({data:{}}),{code:'unauthenticated'});
  assert.deepEqual(f.paths,[]);assert.equal(f.writes(),0);
});
test('legacy import rejects inactive and non-administrator profiles',async()=>{
  for(const access of [null,{active:false,role:'administrador'},{active:true,role:'tecnico'},{active:true,role:'consulta'},{active:true,role:'unknown'}]){
    const f=callable(access);
    await assert.rejects(f.invoke({auth:{uid:'test-user'},data:{}}),{code:'permission-denied'});
    assert.deepEqual(f.paths,['access/test-user']);assert.equal(f.writes(),0);
  }
});
test('retired import never creates an equivalent manual or imported case',async()=>{
  const f=callable();
  for(const numeroProntuario of ['1','001',' １ ']){
    await assert.rejects(f.invoke({auth:{uid:'test-user'},data:{data:{numeroProntuario,dataEntrada:'2026-10-19'}}}),{code:'failed-precondition'});
  }
  assert.equal(f.writes(),0);assert.ok(f.paths.every(p=>p==='access/test-user'));
});
test('retirement is explicit for old and current payloads without processing case data',async()=>{
  for(const data of [undefined,{}, {data:{numeroProntuario:'TEST',dataEntrada:'2026-10-19',origemImportacao:'Casos, linha 2'}}]){
    const f=callable();
    await assert.rejects(f.invoke({auth:{uid:'test-user'},data}),error=>error.code==='failed-precondition'&&/importação.*aplicativo/i.test(error.message));
    assert.equal(f.writes(),0);
  }
});
