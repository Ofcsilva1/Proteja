import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {caseKey}=require('../../functions/service.cjs');
const project='demo-proteja-security',ns=project+'-default-rtdb';
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:19099');
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'127.0.0.1:19000');
const results=[],accounts={};
async function request(url,{method='GET',body,token,owner=false}={}) {
  const u=new URL(url);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');assert.ok(['19000','19099','15001'].includes(u.port));
  const headers={'content-type':'application/json'};
  if(token)headers.authorization='Bearer '+token;
  if(owner)headers.authorization='Bearer owner';
  const response=await fetch(u,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  return {status:response.status,body:await response.json()};
}
async function db(actor,method,path,body) {
  const u=new URL(`http://127.0.0.1:19000/${path}.json`);u.searchParams.set('ns',ns);
  if(accounts[actor])u.searchParams.set('auth',accounts[actor].token);
  return request(u,{method,body,owner:actor==='seed'});
}
async function call(actor,name,data) {
  return request(`http://127.0.0.1:15001/${project}/us-central1/${name}`,{method:'POST',token:accounts[actor]?.token,body:{data}});
}
const synthetic=numeroProntuario=>({numeroProntuario,dataEntrada:'2026-10-20',nomeCriad:'PESSOA FICTICIA',responsavelCpf:'000.000.000-00'});
async function test(name,fn) {
  const started=Date.now();await fn();results.push({name,result:'passed',durationMs:Date.now()-started});console.log('PASS '+name);
}
const denied=r=>{assert.equal(r.status,401);assert.equal(r.body.error,'Permission denied');};
const error=(r,status)=>assert.equal(r.body.error?.status,status,JSON.stringify(r.body));
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.result;};
for(const actor of ['tecnico','admin','consulta','sem-cargo','inativo','desconhecido']) {
  const r=await request('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',{method:'POST',body:{email:actor+'@example.invalid',password:'Ficticia-2026-Only!',returnSecureToken:true}});
  assert.equal(r.status,200);accounts[actor]={uid:r.body.localId,token:r.body.idToken};
}
const access={};
for(const [actor,role,active] of [['tecnico','tecnico',true],['admin','administrador',true],['consulta','consulta',true],['inativo','tecnico',false],['desconhecido','inventado',true]])access[accounts[actor].uid]={role,active};
const legacy={...synthetic('0099'),origemCadastro:'planilha',dadosPlanilha:'{"nome":"FICTICIO"}',historicoPlanilha:'[]',criadoPor:'autor-legado',criadoEm:'2020-01-01T00:00:00Z'};
assert.equal((await db('seed','PUT','',{access,casos:{legacy_import:legacy}})).status,200);
try {
  await test('rules loaded in the tested namespace exactly match the proposed file',async()=>{
    const loaded=await db('seed','GET','.settings/rules');
    assert.deepEqual(typeof loaded.body==='string'?JSON.parse(loaded.body):loaded.body,JSON.parse(fs.readFileSync(new URL('../../database.rules.example.json',import.meta.url),'utf8')));
  });
  await test('positive control: Auth token and Admin SDK use the seeded namespace',async()=>{
    assert.equal(ok(await call('admin','salvarCaso',{operation:'create',data:synthetic('POSITIVE-CONTROL')})).committed,true);
    assert.equal((await db('seed','GET','casos/'+caseKey('POSITIVE-CONTROL'))).body.criadoPor,accounts.admin.uid);
  });
  for(const actor of ['tecnico','admin']) {
    for(const origin of ['planilha','manual',undefined])await test(`${actor}: direct import/write denied with origin ${origin??'omitted'}`,async()=>{
      const data={...synthetic('BLOCKED'),dadosPlanilha:'{}'};if(origin)data.origemCadastro=origin;
      denied(await db(actor,'PUT','casos/alternate_'+(origin??'none'),data));
    });
  }
  for(const actor of ['tecnico','consulta','inativo','sem-cargo','desconhecido'])await test(`${actor}: callable import denied`,async()=>{
    error(await call(actor,'salvarCaso',{operation:'import',data:synthetic('FORBIDDEN')}),'PERMISSION_DENIED');
  });
  for(const actor of ['sem-cargo','inativo','consulta','desconhecido','anonimo']) {
    await test(`${actor}: collection, individual CPF and direct mutation denied`,async()=>{
      denied(await db(actor,'GET','casos'));denied(await db(actor,'GET','casos/legacy_import/responsavelCpf'));
      denied(await db(actor,'PUT','casos/direct',synthetic('BLOCKED')));
      error(await call(actor,'salvarCaso',{operation:'create',data:synthetic('FORBIDDEN')}),actor==='anonimo'?'UNAUTHENTICATED':'PERMISSION_DENIED');
    });
  }
  for(const actor of ['tecnico','admin','inativo','sem-cargo'])await test(`${actor}: own access promotion/reactivation denied`,async()=>{
    denied(await db(actor,'PATCH',`access/${accounts[actor].uid}`,{role:'administrador',active:true}));
  });
  await test('root multipath promotion is denied atomically; counters cannot be reset',async()=>{
    denied(await db('tecnico','PATCH','',{[`access/${accounts.tecnico.uid}/role`]:'administrador','casos/forged':synthetic('X')}));
    assert.equal((await db('seed','GET',`access/${accounts.tecnico.uid}/role`)).body,'tecnico');
    assert.equal((await db('seed','GET','casos/forged')).body,null);
    denied(await db('tecnico','PUT',`writeLimits/${accounts.tecnico.uid}`,{count:0,window:0}));
    denied(await db('tecnico','GET','writeLimits'));
  });
  for(const field of ['origemCadastro','dadosPlanilha','historicoPlanilha','origemImportacao','criadoPor','criadoEm','atualizadoPor','atualizadoEm'])await test(`manual callable rejects ${field}`,async()=>{
    error(await call('tecnico','salvarCaso',{operation:'create',data:{...synthetic('FORGED'),[field]:'forged'}}),'INVALID_ARGUMENT');
  });
  await test('manual create stamps identity/origin/time from server',async()=>{
    const before=Date.now(),result=ok(await call('tecnico','salvarCaso',{operation:'create',data:synthetic('001')}));
    assert.equal(result.committed,true);assert.equal(result.caseKey,caseKey('1'));
    const saved=(await db('seed','GET','casos/'+result.caseKey)).body;
    assert.equal(saved.criadoPor,accounts.tecnico.uid);assert.equal(saved.atualizadoPor,accounts.tecnico.uid);assert.equal(saved.origemCadastro,'manual');
    assert.ok(Date.parse(saved.criadoEm)>=before&&Date.parse(saved.criadoEm)<=Date.now());assert.equal(saved.criadoEm,saved.atualizadoEm);
  });
  await test('admin imports with trusted origin and identical canonical identity',async()=>{
    assert.equal(ok(await call('admin','salvarCaso',{operation:'import',data:{...synthetic('2'),dadosPlanilha:'{"valor":"FICTICIO"}'}})).committed,true);
    const saved=(await db('seed','GET','casos/'+caseKey('2'))).body;
    assert.equal(saved.origemCadastro,'planilha');assert.equal(saved.criadoPor,accounts.admin.uid);
    assert.equal(ok(await call('admin','salvarCaso',{operation:'import',data:synthetic('００１')})).committed,false);
  });
  await test('legacy duplicates and concurrent creates cannot overwrite records',async()=>{
    assert.equal(ok(await call('admin','salvarCaso',{operation:'import',data:synthetic('99')})).committed,false);
    const pair=await Promise.all(['admin','tecnico'].map(actor=>call(actor,'salvarCaso',{operation:'create',data:synthetic('CONCURRENT')})));
    assert.equal(pair.map(ok).filter(r=>r.committed).length,1);
  });
  await test('legacy edits preserve import snapshots, origin and recorded creation metadata',async()=>{
    assert.deepEqual((await db('seed','GET','casos/legacy_import')).body,legacy);
    const data={...synthetic('0099'),nomeCriad:'ALTERACAO FICTICIA'};
    assert.equal(ok(await call('tecnico','salvarCaso',{operation:'update',caseKey:'legacy_import',expected:synthetic('0099'),data})).committed,true);
    const stored=(await db('seed','GET','casos/legacy_import')).body;
    for(const field of ['dadosPlanilha','historicoPlanilha','origemCadastro','criadoEm','criadoPor'])assert.equal(stored[field],legacy[field]);
    assert.equal(stored.atualizadoPor,accounts.tecnico.uid);
    assert.equal(ok(await call('tecnico','salvarCaso',{operation:'update',caseKey:'legacy_import',expected:synthetic('0099'),data})).committed,false);
    error(await call('tecnico','salvarCaso',{operation:'update',caseKey:'legacy_import',expected:synthetic('0099'),data:{...data,criadoPor:'forged'}}),'INVALID_ARGUMENT');
  });
  await test('server rejects impossible calendar dates in creates, updates and imports',async()=>{
    for(const operation of ['create','import'])error(await call('admin','salvarCaso',{operation,data:{...synthetic('DATE'),dataEntrada:'2026-99-99'}}),'INVALID_ARGUMENT');
    error(await call('tecnico','salvarCaso',{operation:'update',caseKey:caseKey('1'),expected:synthetic('001'),data:{...synthetic('001'),dataEntrada:'2026-02-29'}}),'INVALID_ARGUMENT');
  });
  const task={schema:1,kind:'tarefas',revisao:999,responsavel:'EQUIPE FICTICIA',observacao:'FICTICIO',situacao:'aberta',tipo:'Documento',dataConclusao:'',descricao:'DOCUMENTO FICTICIO',prazo:'2026-10-20',prioridade:'normal',criadoPor:'forged',criadoEm:'1900',atualizadoPor:'forged',atualizadoEm:'2100'};
  let taskStored;
  await test('activity creation ignores spoofed authors/dates and stamps server metadata',async()=>{
    assert.equal(ok(await call('tecnico','salvarAtividade',{caseKey:caseKey('1'),field:'pendencia_test',expected:null,value:JSON.stringify(task)})).committed,true);
    taskStored=(await db('seed','GET','casos/'+caseKey('1')+'/pendencia_test')).body;
    const data=JSON.parse(taskStored);assert.equal(data.criadoPor,accounts.tecnico.uid);assert.equal(data.atualizadoPor,accounts.tecnico.uid);assert.equal(data.revisao,1);assert.notEqual(data.criadoEm,'1900');
  });
  await test('activity update preserves creation, rejects stale edits and invalid dates',async()=>{
    const payload={caseKey:caseKey('1'),field:'pendencia_test',expected:taskStored,value:JSON.stringify({...task,observacao:'NOVO FICTICIO'})};
    assert.equal(ok(await call('admin','salvarAtividade',payload)).committed,true);
    const saved=JSON.parse((await db('seed','GET','casos/'+caseKey('1')+'/pendencia_test')).body);
    assert.equal(saved.criadoPor,accounts.tecnico.uid);assert.equal(saved.atualizadoPor,accounts.admin.uid);assert.equal(saved.revisao,2);
    assert.equal(ok(await call('tecnico','salvarAtividade',payload)).committed,false);
    error(await call('tecnico','salvarAtividade',{...payload,value:JSON.stringify({...task,prazo:'2026-02-30'})}),'INVALID_ARGUMENT');
    error(await call('tecnico','salvarAtividade',{...payload,field:'criadoPor'}),'INVALID_ARGUMENT');
    error(await call('consulta','salvarAtividade',payload),'PERMISSION_DENIED');
  });
  await test('consulta receives only bounded aggregate with no personal data, IDs or filters',async()=>{
    const summary=ok(await call('consulta','consultarResumo',{}));
    assert.deepEqual(summary,{schema:1,casesRange:'Menos de 10'});
    error(await call('consulta','consultarResumo',{caseKey:'legacy_import'}),'INVALID_ARGUMENT');
    for(const actor of ['sem-cargo','inativo','desconhecido'])error(await call(actor,'consultarResumo',{}),'PERMISSION_DENIED');
  });
  await test('shared summary groups larger populations into ranges of ten',async()=>{
    for(let i=0;i<12;i++)assert.equal((await db('seed','PUT','casos/synthetic_'+i,synthetic('EXTRA-'+i))).status,200);
    assert.deepEqual(ok(await call('consulta','consultarResumo',{})),{schema:1,casesRange:'10 a 19'});
  });
  await test('manual quota is server-side, persistent and unaffected by client origins',async()=>{
    await db('seed','PUT',`writeLimits/${accounts.tecnico.uid}`,{window:Math.floor(Date.now()/3600000),count:29});
    assert.equal(ok(await call('tecnico','salvarCaso',{operation:'create',data:synthetic('QUOTA-LAST')})).committed,true);
    error(await call('tecnico','salvarCaso',{operation:'create',data:synthetic('QUOTA-BLOCKED')}),'RESOURCE_EXHAUSTED');
    assert.equal(ok(await call('admin','salvarCaso',{operation:'import',data:synthetic('ADMIN-QUOTA')})).committed,true);
  });
  await test('active revocation blocks REST and new callable operations with the same token',async()=>{
    await db('seed','PATCH',`access/${accounts.tecnico.uid}`,{active:false});
    denied(await db('tecnico','GET','casos'));
    error(await call('tecnico','salvarCaso',{operation:'create',data:synthetic('REVOKED')}),'PERMISSION_DENIED');
    error(await call('tecnico','consultarResumo',{}),'PERMISSION_DENIED');
  });
  await test('retired import endpoint remains closed',async()=>{
    error(await call('admin','importarCaso',{data:synthetic('LEGACY')}),'FAILED_PRECONDITION');
    error(await call('tecnico','importarCaso',{data:synthetic('LEGACY')}),'PERMISSION_DENIED');
  });
} finally {
  await db('seed','DELETE','');
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/security-emulator.json',JSON.stringify({project,syntheticOnly:true,results},null,2)+'\n');
}
console.log(`${results.length} security integration scenarios passed; Auth, RTDB and Functions emulators only.`);
