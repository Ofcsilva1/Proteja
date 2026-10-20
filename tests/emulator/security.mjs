import assert from 'node:assert/strict';
import fs from 'node:fs';
import {caseKey} from '../../case-save.js';
import {identityFields,auditFor,activityForDisplay} from '../../spark-policy.js';
import {createSparkStore} from '../../spark-store-core.js';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import * as databaseAPI from 'firebase/database';
import {buildActivity} from '../../workflow-core.js';
const project='demo-proteja-security',ns=project+'-default-rtdb';
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:19099');
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'127.0.0.1:19000');
const stamp=()=>({'.sv':'timestamp'}),accounts={},results=[];
const start=()=>Math.floor(Date.now()/3600000)*3600000;
async function local(url,{method='GET',body,owner=false}={}) {
  const u=new URL(url);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert.ok(['19099','19000'].includes(u.port));
  const r=await fetch(u,{method,headers:{'content-type':'application/json',...(owner?{authorization:'Bearer owner'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
  return {status:r.status,body:await r.json()};
}
async function db(actor,method,path,body) {
  const url=new URL(`http://127.0.0.1:19000/${path}.json`);url.searchParams.set('ns',ns);
  if(accounts[actor])url.searchParams.set('auth',accounts[actor].token);
  return local(url,{method,body,owner:actor==='seed'});
}
const allowed=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const denied=r=>{assert.equal(r.status,401,JSON.stringify(r.body));assert.equal(r.body.error,'Permission denied');};
async function test(name,run) {await run();results.push({name,result:'passed'});console.log('PASS '+name);}
const input=number=>({numeroProntuario:number,dataEntrada:'2026-10-20',nomeCriad:'PESSOA FICTICIA',responsavelCpf:'000.000.000-00'});
async function creation(actor,number,{slot='0',origin='manual',key,window=start()}={}) {
  key??=await caseKey(number);const id=identityFields(number),uid=accounts[actor].uid;
  const record={...input(number),...id,origemCadastro:origin,auditoria:auditFor(null,uid,stamp())};
  const patch={[`casos/${key}`]:record,[`identidades/${id.identidade}`]:key};
  if(actor!=='admin') {
    record.quota={inicioMs:window,slot};
    patch[`cotasManuais/${uid}/${window}/${slot}`]={caseId:key,inicioMs:window,criadoEmMs:stamp()};
  }
  return {key,record,patch};
}
async function edit(actor,key,change={}) {
  const old=allowed(await db('seed','GET',`casos/${key}`));
  return {...old,...change,origemCadastro:old.origemCadastro??'legado',auditoria:auditFor(old.auditoria,accounts[actor].uid,stamp(),true)};
}
function event(actor,previous=null,extra={}) {
  return {schema:1,kind:'tarefas',responsavel:'EQUIPE FICTICIA',observacao:'FICTICIO',situacao:'aberta',tipo:'Documento',dataConclusao:'',descricao:'CONFERIR FICTICIO',prazo:'2026-10-20',prioridade:'normal',...extra,auditoria:auditFor(previous?.auditoria,accounts[actor].uid,stamp())};
}
for(const actor of ['tecnico','admin','consulta','sem-cargo','inativo','desconhecido','tecnico2']) {
  const r=await local('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',{method:'POST',body:{email:actor+'@example.invalid',password:'Ficticia-2026-Only!',returnSecureToken:true}});
  assert.equal(r.status,200);accounts[actor]={uid:r.body.localId,token:r.body.idToken};
}
const access={};
for(const [actor,role,active] of [['tecnico','tecnico',true],['tecnico2','tecnico',true],['admin','administrador',true],['consulta','consulta',true],['inativo','tecnico',false],['desconhecido','inventado',true]])access[accounts[actor].uid]={role,active};
const legacy={...input('0099'),origemCadastro:'planilha',dadosPlanilha:'{"nome":"FICTICIO"}',historicoPlanilha:'[]',criadoPor:'autor-legado',criadoEm:'2020-01-01T00:00:00Z',agenda_legada:'{"evidencia":"FICTICIA"}'};
allowed(await db('seed','PUT','',{access,casos:{legacy_import:legacy}}));
try {
  await test('exact proposed Rules loaded in the tested namespace',async()=>{
    const r=allowed(await db('seed','GET','.settings/rules'));
    assert.deepEqual(typeof r==='string'?JSON.parse(r):r,JSON.parse(fs.readFileSync(new URL('../../database.rules.example.json',import.meta.url),'utf8')));
  });
  await test('new records remain blocked before legacy index readiness',async()=>{
    denied(await db('admin','PATCH','',(await creation('admin','GATED')).patch));
    denied(await db('admin','PUT','securityPolicy/identityRegistryReady',true));
    allowed(await db('seed','PATCH','',{'securityPolicy/identityRegistryReady':true,'identidades/99':'legacy_import'}));
  });
  let manual,imported;
  await test('positive control: admin imports with UID and server timestamp',async()=>{
    imported=await creation('admin','IMPORT-1',{origin:'planilha'});imported.record.dadosPlanilha='{"nome":"FICTICIO"}';
    allowed(await db('admin','PATCH','',imported.patch));
    const saved=allowed(await db('seed','GET','casos/'+imported.key));
    assert.equal(saved.auditoria.criadoPor,accounts.admin.uid);assert.equal(saved.auditoria.criacaoVerificada,true);assert.equal(typeof saved.auditoria.criadoEmMs,'number');
  });
  await test('positive control: technical manual creation atomically consumes one quota slot',async()=>{
    manual=await creation('tecnico','001');allowed(await db('tecnico','PATCH','',manual.patch));
    const saved=allowed(await db('seed','GET','casos/'+manual.key));assert.equal(saved.auditoria.criadoPor,accounts.tecnico.uid);assert.equal(saved.auditoria.criadoEmMs,saved.auditoria.atualizadoEmMs);
  });
  for(const actor of ['sem-cargo','inativo','desconhecido','consulta','anonimo'])await test(`${actor}: direct collection, record, CPF, activities and mutation denied`,async()=>{
    for(const path of ['casos','casos/'+manual.key,'casos/'+manual.key+'/responsavelCpf','atividades','identidades','legadoProtegido'])denied(await db(actor,'GET',path));
    const c=await creation(actor==='anonimo'?'tecnico':actor,'BLOCKED-'+actor,{slot:'1'});denied(await db(actor,'PATCH','',c.patch));
  });
  for(const actor of ['admin','tecnico','sem-cargo','inativo'])await test(`${actor}: self promotion, reactivation and other-profile writes denied`,async()=>{
    denied(await db(actor,'PATCH',`access/${accounts[actor].uid}`,{role:'administrador',active:true}));
    denied(await db(actor,'PUT',`access/${accounts.consulta.uid}/role`,'administrador'));
  });
  await test('multipath privilege escalation is denied atomically',async()=>{
    const c=await creation('tecnico','ESCALATE',{slot:'1'});c.patch[`access/${accounts.tecnico.uid}/role`]='administrador';denied(await db('tecnico','PATCH','',c.patch));
    assert.equal(allowed(await db('seed','GET','casos/'+c.key)),null);assert.equal(allowed(await db('seed','GET',`access/${accounts.tecnico.uid}/role`)),'tecnico');
  });
  await test('technical planilha origin, missing origin and disguised import fields denied',async()=>{
    const c=await creation('tecnico','BAD-IMPORT',{origin:'planilha',slot:'1'});denied(await db('tecnico','PATCH','',c.patch));
    c.record.origemCadastro='manual';c.record.dadosPlanilha='{}';denied(await db('tecnico','PATCH','',c.patch));
    delete c.record.dadosPlanilha;delete c.record.origemCadastro;denied(await db('tecnico','PATCH','',c.patch));
    c.record.origemCadastro='manual';c.record.historicoPlanilha='[]';denied(await db('tecnico','PATCH','',c.patch));
    delete c.record.historicoPlanilha;c.record.origemImportacao='origem-ficticia';denied(await db('tecnico','PATCH','',c.patch));
  });
  await test('legacy import keys do not bypass origin, quota and registry checks',async()=>{
    const c=await creation('tecnico','OLD-PATH',{slot:'1',origin:'planilha',key:'import_'+'a'.repeat(64)});denied(await db('tecnico','PATCH','',c.patch));
  });
  await test('origin, original import snapshots and creation audit cannot be changed or deleted',async()=>{
    for(const field of ['origemCadastro','dadosPlanilha','auditoria/criadoPor','auditoria/criadoEmMs','auditoria/criacaoVerificada']) {
      const next=await edit('tecnico',imported.key);let obj=next;const parts=field.split('/');for(const p of parts.slice(0,-1))obj=obj[p];obj[parts.at(-1)]='forged';
      denied(await db('tecnico','PUT','casos/'+imported.key,next));
    }
    const next=await edit('admin',imported.key);delete next.dadosPlanilha;denied(await db('admin','PUT','casos/'+imported.key,next));
    denied(await db('tecnico','DELETE','casos/'+manual.key+'/auditoria'));
    denied(await db('admin','DELETE','casos/'+manual.key));
  });
  await test('UID spoofing and arbitrary audit timestamps rejected on creates and updates',async()=>{
    for(const mutate of [a=>a.criadoPor=accounts.admin.uid,a=>a.atualizadoPor=accounts.admin.uid,a=>a.criadoEmMs=0,a=>a.atualizadoEmMs=4102444800000,a=>a.criacaoVerificada=false]) {
      const c=await creation('tecnico','FORGED',{slot:'1'});mutate(c.record.auditoria);denied(await db('tecnico','PATCH','',c.patch));
    }
    const next=await edit('tecnico',manual.key);next.auditoria.atualizadoEmMs='data-inventada';denied(await db('tecnico','PUT','casos/'+manual.key,next));
    const spoof=await edit('tecnico',manual.key);spoof.criadoPor='forged';denied(await db('tecnico','PUT','casos/'+manual.key,spoof));
  });
  await test('valid case update stamps current UID/time and advances revision',async()=>{
    const old=allowed(await db('seed','GET','casos/'+manual.key));const next=await edit('tecnico2',manual.key,{nomeCriad:'ATUALIZACAO FICTICIA'});
    allowed(await db('tecnico2','PUT','casos/'+manual.key,next));const saved=allowed(await db('seed','GET','casos/'+manual.key));
    assert.equal(saved.auditoria.criadoPor,old.auditoria.criadoPor);assert.equal(saved.auditoria.criadoEmMs,old.auditoria.criadoEmMs);assert.equal(saved.auditoria.atualizadoPor,accounts.tecnico2.uid);assert.equal(saved.auditoria.revisao,2);
    denied(await db('tecnico2','PUT','casos/'+manual.key,next));
  });
  await test('impossible calendar dates rejected and valid leap dates accepted',async()=>{
    for(const date of ['2026-99-99','2026-02-29','1900-02-29','2100-02-29','2026-04-31','0000-01-01']) {
      const c=await creation('admin','DATE-'+date);c.record.dataEntrada=date;denied(await db('admin','PATCH','',c.patch));
    }
    for(const date of ['2024-02-29','2000-02-29','2026-04-30']) {const c=await creation('admin','VALID-'+date);c.record.dataEntrada=date;allowed(await db('admin','PATCH','',c.patch));}
  });
  await test('new unknown fields and post-create invalid dates denied',async()=>{
    const c=await creation('admin','UNKNOWN');c.record.adminSecret='FICTICIO';denied(await db('admin','PATCH','',c.patch));
    const e=await edit('tecnico',manual.key,{dataEntrada:'2026-02-30'});denied(await db('tecnico','PUT','casos/'+manual.key,e));
  });
  await test('canonical/legacy identity cannot be duplicated, forged or removed',async()=>{
    const duplicate=await creation('admin','0001',{key:'case_'+'b'.repeat(64)});denied(await db('admin','PATCH','',duplicate.patch));
    const legacyDup=await creation('admin','99');denied(await db('admin','PATCH','',legacyDup.patch));
    const forged=await creation('admin','00100');forged.record.identidade='1';delete forged.patch['identidades/100'];forged.patch['identidades/1']=forged.key;denied(await db('admin','PATCH','',forged.patch));
    denied(await db('admin','DELETE','identidades/1'));
    const noIndex=await creation('admin','NO-INDEX');delete noIndex.patch['identidades/NO-INDEX'];denied(await db('admin','PATCH','',noIndex.patch));
  });
  await test('concurrent identity creates yield one successful writer',async()=>{
    const a=await creation('admin','RACE',{key:'case_'+'c'.repeat(64)}),b=await creation('tecnico2','race',{slot:'0',key:'case_'+'d'.repeat(64)});
    const pair=await Promise.all([db('admin','PATCH','',a.patch),db('tecnico2','PATCH','',b.patch)]);assert.equal(pair.filter(r=>r.status===200).length,1);assert.equal(pair.filter(r=>r.status===401).length,1);
  });
  await test('quota enforces 30 total slots across requests and prevents reuse/removal',async()=>{
    for(let i=1;i<30;i++)allowed(await db('tecnico','PATCH','',(await creation('tecnico','QUOTA-'+i,{slot:String(i)})).patch));
    denied(await db('tecnico','PATCH','',(await creation('tecnico','QUOTA-31',{slot:'30'})).patch));
    denied(await db('tecnico','PATCH','',(await creation('tecnico','QUOTA-REUSE',{slot:'0'})).patch));
    denied(await db('tecnico','DELETE',`cotasManuais/${accounts.tecnico.uid}/${start()}/0`));
    const noQuota=await creation('tecnico','NO-QUOTA',{slot:'0'});delete noQuota.record.quota;denied(await db('tecnico','PATCH','',noQuota.patch));
    const empty=await creation('tecnico','NO-TICKET',{slot:'0'});delete empty.patch[`cotasManuais/${accounts.tecnico.uid}/${start()}/0`];denied(await db('tecnico','PATCH','',empty.patch));
  });
  await test('quota cannot use future, expired or fractional windows',async()=>{
    for(const window of [start()+3600000,start()-3600000,start()+1])denied(await db('tecnico','PATCH','',(await creation('tecnico','WINDOW-'+window,{slot:'0',window})).patch));
  });
  await test('concurrent writers cannot share one slot; batches cannot create two cases per ticket',async()=>{
    const a=await creation('tecnico2','SLOT-RACE-A',{slot:'5'}),b=await creation('tecnico2','SLOT-RACE-B',{slot:'5'});
    const pair=await Promise.all([db('tecnico2','PATCH','',a.patch),db('tecnico2','PATCH','',b.patch)]);assert.equal(pair.filter(r=>r.status===200).length,1);
    const c=await creation('tecnico2','BATCH-A',{slot:'6'}),d=await creation('tecnico2','BATCH-B',{slot:'6'});denied(await db('tecnico2','PATCH','',{...c.patch,...d.patch}));
    assert.equal(allowed(await db('seed','GET','casos/'+c.key)),null);
  });
  await test('legacy edits require reviewed protected archive and preserve old snapshots/audit',async()=>{
    denied(await db('tecnico','PUT','casos/legacy_import',await edit('tecnico','legacy_import',{nomeCriad:'EDITADO FICTICIO'})));
    allowed(await db('seed','PATCH','',{'securityPolicy/editableCases/legacy_import':true,'legadoProtegido/legacy_import':legacy}));
    allowed(await db('tecnico','PUT','casos/legacy_import',await edit('tecnico','legacy_import',{nomeCriad:'EDITADO FICTICIO'})));
    const stored=allowed(await db('seed','GET','casos/legacy_import'));assert.equal(stored.criadoPor,legacy.criadoPor);assert.equal(stored.dadosPlanilha,legacy.dadosPlanilha);assert.equal(stored.auditoria.criacaoVerificada,false);assert.equal(stored.auditoria.criadoPor,'desconhecido');
    denied(await db('tecnico','DELETE','legadoProtegido/legacy_import'));
  });
  let task;
  await test('structured activity creation succeeds and JSON-string bypass is denied',async()=>{
    task=event('tecnico');allowed(await db('tecnico','PUT',`atividades/${manual.key}/pendencia_test`,task));
    const stored=allowed(await db('seed','GET',`atividades/${manual.key}/pendencia_test`));assert.equal(stored.auditoria.criadoPor,accounts.tecnico.uid);
    denied(await db('tecnico','PUT',`atividades/${manual.key}/pendencia_string`,JSON.stringify(task)));
    const next=await edit('tecnico',manual.key,{agenda_bypass:JSON.stringify(task)});denied(await db('tecnico','PUT','casos/'+manual.key,next));
  });
  await test('activity authorship, deletion, stale revisions and calendar protected',async()=>{
    const path=`atividades/${manual.key}/pendencia_test`,old=allowed(await db('seed','GET',path));
    const changed=event('tecnico2',old,{observacao:'NOVO FICTICIO'});allowed(await db('tecnico2','PUT',path,changed));denied(await db('tecnico2','PUT',path,changed));
    const saved=allowed(await db('seed','GET',path));assert.equal(saved.auditoria.criadoPor,accounts.tecnico.uid);assert.equal(saved.auditoria.atualizadoPor,accounts.tecnico2.uid);
    const spoof=event('tecnico2',saved);spoof.auditoria.criadoPor=accounts.tecnico2.uid;denied(await db('tecnico2','PUT',path,spoof));
    denied(await db('tecnico','DELETE',path));denied(await db('admin','DELETE',`atividades/${manual.key}`));
    denied(await db('tecnico','PUT',`atividades/${manual.key}/pendencia_bad`,event('tecnico',null,{prazo:'2026-02-30'})));
    denied(await db('consulta','PUT',`atividades/${manual.key}/pendencia_bad`,event('consulta')));
  });
  await test('consulta reads only independently published summary; no raw-data aggregation',async()=>{
    assert.equal(allowed(await db('consulta','GET','compartilhavel/resumo')),null);
    denied(await db('tecnico','PUT','compartilhavel/resumo',{schema:1,faixa:1,revisao:1,publicadoEmMs:stamp()}));
    allowed(await db('admin','PUT','compartilhavel/resumo',{schema:1,faixa:1,revisao:1,publicadoEmMs:stamp()}));
    const summary=allowed(await db('consulta','GET','compartilhavel/resumo'));assert.deepEqual(Object.keys(summary).sort(),['faixa','publicadoEmMs','revisao','schema']);assert.equal(summary.faixa,1);
    denied(await db('admin','PUT','compartilhavel/resumo',{schema:1,faixa:1,revisao:2,publicadoEmMs:stamp(),nome:'FICTICIO'}));
    for(const actor of ['inativo','sem-cargo','desconhecido','anonimo'])denied(await db(actor,'GET','compartilhavel/resumo'));
  });
  await test('real SDK client creates/edits cases and structured activity against Rules',async()=>{
    const app=initializeApp({projectId:project,apiKey:'fake-api-key',databaseURL:`https://${ns}.firebaseio.com`},'sdk-test');
    const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:19099',{disableWarnings:true});
    const database=databaseAPI.getDatabase(app);databaseAPI.connectDatabaseEmulator(database,'127.0.0.1',19000);
    try {
      await signInWithEmailAndPassword(auth,'tecnico2@example.invalid','Ficticia-2026-Only!');
      const store=createSparkStore(database,auth,databaseAPI),data=input('SDK-1');
      const saved=await store.saveCase({operation:'create',data});assert.equal(saved.committed,true);
      assert.equal((await store.saveCase({operation:'create',data})).committed,false);
      assert.equal((await store.saveCase({operation:'update',caseKey:saved.caseKey,expected:data,data:{...data,nomeCriad:'SDK FICTICIO'}})).committed,true);
      const value=buildActivity('tarefas',{responsavel:'FICTICIO',observacao:'FICTICIO',situacao:'aberta',tipo:'Documento',dataConclusao:'',descricao:'FICTICIO',prazo:'2026-10-20',prioridade:'normal'},null,auth.currentUser.uid);
      assert.equal((await store.saveActivity({caseKey:saved.caseKey,field:'pendencia_sdk',expected:null,value})).committed,true);
      const existing=allowed(await db('seed','GET',`atividades/${saved.caseKey}/pendencia_sdk`));assert.equal(existing.auditoria.criadoPor,accounts.tecnico2.uid);
      assert.ok(!Object.hasOwn(existing,'criadoPor'));
      const snapshot=await databaseAPI.get(databaseAPI.ref(database,`atividades/${saved.caseKey}/pendencia_sdk`));
      const displayed=activityForDisplay(snapshot.val()),expected=JSON.stringify(displayed);
      const changed=JSON.stringify({...displayed,observacao:'SDK ATUALIZADO FICTICIO'});
      assert.equal((await store.saveActivity({caseKey:saved.caseKey,field:'pendencia_sdk',expected,value:changed})).committed,true);
      assert.equal((await store.saveActivity({caseKey:saved.caseKey,field:'pendencia_sdk',expected,value:changed})).committed,false);
      await signOut(auth);await signInWithEmailAndPassword(auth,'consulta@example.invalid','Ficticia-2026-Only!');
      assert.deepEqual(await store.sharedSummary(),{published:true,casesRange:'10 a 19'});
      await assert.rejects(store.saveCase({operation:'create',data:input('SDK-DENIED')}));
      await assert.rejects(store.publishSummary(25));
      await signOut(auth);await signInWithEmailAndPassword(auth,'admin@example.invalid','Ficticia-2026-Only!');
      await store.publishSummary(25);
      assert.deepEqual(await store.sharedSummary(),{published:true,casesRange:'20 a 29'});
    } finally {await signOut(auth);await deleteApp(app);}
  });
  await test('active revocation blocks new REST operations with the same token',async()=>{
    allowed(await db('seed','PATCH',`access/${accounts.tecnico.uid}`,{active:false}));
    denied(await db('tecnico','GET','casos'));denied(await db('tecnico','PUT',`atividades/${manual.key}/pendencia_revoked`,event('tecnico')));
  });
  await test('no Functions configuration, callable SDK or deployment in the Spark test runner',async()=>{
    for(const name of ['firebase.json','firebase.emulator.json'])assert.equal(JSON.parse(fs.readFileSync(name,'utf8')).functions,undefined);
    assert.ok(!fs.readFileSync('script.js','utf8').includes('firebase-functions.js'));
    assert.ok(!fs.readFileSync('scripts/test-emulator.cjs','utf8').includes('auth,database,functions'));
  });
} finally {
  allowed(await db('seed','DELETE',''));
  fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/security-emulator.json',JSON.stringify({project,syntheticOnly:true,functionsUsed:false,results},null,2)+'\n');
}
console.log(`${results.length} Spark security integration scenarios passed; Auth and RTDB emulators only.`);
