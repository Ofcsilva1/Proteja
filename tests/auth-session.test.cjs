const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PROTEJA_BROWSER_PATH ? { executablePath: process.env.PROTEJA_BROWSER_PATH } : {})
  });
});
after(async () => { await browser?.close(); });

// All external requests are fulfilled locally. No test contacts live Firebase.
const authModule = [
  'const opts=window.__fixtureOptions;',
  'const auth={currentUser:opts.legacy?{uid:"legacy-user"}:null};',
  'const listeners=new Set();',
  'const debug=window.__authTest={calls:[],auth,subscriptions:0,unsubscribed:0};',
  'export const inMemoryPersistence={type:"NONE"};',
  'export const getAuth=()=>auth;',
  'export const setPersistence=async(a,p)=>{debug.calls.push("persistence:"+p.type);await new Promise(r=>{if(opts.initBlocked)debug.releaseInit=r;else setTimeout(r,opts.initDelay||0);});if(opts.initFail)throw new Error("fixture");};',
  'export const signOut=async()=>{debug.calls.push("signOut");auth.currentUser=null;listeners.forEach(cb=>cb(null));};',
  'export const onAuthStateChanged=(a,cb)=>{debug.calls.push("observe");listeners.add(cb);queueMicrotask(()=>cb(auth.currentUser));return()=>listeners.delete(cb);};',
  'export const signInWithEmailAndPassword=async()=>{debug.calls.push("signIn");await new Promise(r=>setTimeout(r,opts.loginDelay||0));if(opts.loginFail)throw {code:"auth/invalid-credential"};auth.currentUser={uid:"fixture-user"};listeners.forEach(cb=>cb(auth.currentUser));return {user:auth.currentUser};};'
].join("\n");
const databaseModule = [
  'const opts=window.__fixtureOptions;const stored={};',
  'const workflowCases=opts.workflows?(opts.workflowCases||[{key:"workflow-case",data:{numeroProntuario:"0005",dataEntrada:"2026-01-01",situacaoAtual:"ativo",nomeCriad:"Pessoa fictícia",datasTexto:"Histórico fictício com data incompleta: 01/02",outrasPendencias:"Anotação fictícia preservada",tecnicosReferencia:"Equipe fictícia"}}]):null;',
  'export const get=async p=>({val:()=>({active:true,role:opts.readOnly?"consulta":(opts.role||"administrador"),canWrite:!opts.readOnly}),forEach:fn=>[...(workflowCases||[]).map(c=>({key:c.key,data:c.data})),...(opts.existing||[]).map((data,i)=>({key:"existing-"+i,data})),...Object.entries(stored).map(([key,data])=>({key:key.split("/").pop(),data}))].forEach(c=>fn({key:c.key,val:()=>c.data}))});',
  'export const runTransaction=async(p,fn)=>{const d=window.__authTest;if(workflowCases){d.workflowAttempts=(d.workflowAttempts||0)+1;await new Promise(r=>setTimeout(r,opts.writeDelay||0));if(d.failWorkflow){d.failWorkflow=false;throw {code:"PERMISSION_DENIED"};}const [,caseKey,field]=p.split("/");let row=workflowCases.find(c=>c.key===caseKey);if(!field){if(row&&d.forceCaseConflict){row.data.nomeCriad="Atualização remota fictícia";d.forceCaseConflict=false;d.emitCases();}const value=fn(row?.data??null);if(value===undefined)return {committed:false};if(row)row.data=value;else workflowCases.push({key:caseKey,data:value});d.caseWrites=(d.caseWrites||0)+1;d.emitCases();return {committed:true};}if(!row)throw {code:"PERMISSION_DENIED"};if(d.forceConflict&&row.data[field]){const next=JSON.parse(row.data[field]);next.revisao++;next.observacao="Atualizado por outra pessoa fictícia";row.data[field]=JSON.stringify(next);d.forceConflict=false;d.emitCases();}const value=fn(row.data[field]??null);if(value===undefined)return {committed:false};row.data[field]=value;d.workflowWrites=(d.workflowWrites||0)+1;d.emitCases();return {committed:true};}d.importAttempts=(d.importAttempts||0)+1;await new Promise(r=>setTimeout(r,opts.writeDelay||0));if(opts.failImportAt===d.importAttempts)throw new Error("fixture");const value=fn(stored[p]??null);if(value===undefined)return {committed:false};stored[p]=value;d.imported=Object.values(stored);return {committed:true};};',
  'export const getDatabase=()=>({});export const ref=(_db,p)=>p;',
  'export const push=async()=>{window.__authTest.writes=(window.__authTest.writes||0)+1;};export const update=async()=>{window.__authTest.writes=(window.__authTest.writes||0)+1;};',
  'export const onValue=(p,cb)=>{const d=window.__authTest;d.subscriptions++;d.workflowCases=workflowCases;d.setReadOnly=v=>{opts.readOnly=v;};d.emitCases=()=>cb({forEach:fn=>workflowCases?workflowCases.forEach(c=>fn({key:c.key,val:()=>c.data})):fn({key:"fake-key",val:()=>({numeroProntuario:"CASE-01",dataEntrada:"2026-10-14",situacaoAtual:"ativo",nomeCriad:"DADO-FICTICIO",detalheOrigem:"DETALHE-FICTICIO"})})});d.emitCases();return()=>{d.unsubscribed++;};};'
].join("\n");

// UI fixtures model the callable protocol. Authorization itself is tested in the real emulators.
const functionsModule = `
import {runTransaction} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';
import {caseKey,caseReplacement} from 'https://proteja.test/case-save.js';
export const getFunctions=()=>({});
export const httpsCallable=(_functions,name)=>async payload=>{
 const debug=window.__authTest,uid=debug.auth.currentUser?.uid;
 debug.remoteCalls??=[];debug.remoteCalls.push({name,payload});
 if(name==='consultarResumo')return {data:{schema:1,casesRange:'Menos de 10'}};
 if(name==='salvarAtividade')return {data:await runTransaction('casos/'+payload.caseKey+'/'+payload.field,current=>current===payload.expected?payload.value:undefined)};
 if(name==='salvarCaso'){
  const key=payload.caseKey||await caseKey(payload.data.numeroProntuario),now=new Date().toISOString();
  const data={...payload.data,atualizadoPor:uid,atualizadoEm:now};
  const result=await runTransaction('casos/'+key,current=>payload.operation==='update'
   ?caseReplacement(current,payload.expected,data,Object.keys(payload.data))
   :current===null?{...data,criadoPor:uid,criadoEm:now,origemCadastro:payload.operation==='import'?'planilha':'manual'}:undefined);
  return {data:result};
 }
 throw new Error('Unexpected callable '+name);
};`;

async function fixture(options = {}) {
  const context = await browser.newContext();
  await context.addInitScript(opts => { window.__fixtureOptions = opts; }, options);
  await context.route("**/*", route => {
    const target = new URL(route.request().url());
    if (target.hostname === "proteja.test") {
      const name = target.pathname.slice(1) || "index.html";
      if (name === "import-worker.js" && options.importBook) return route.fulfill({contentType:"text/javascript",body:'self.onmessage=()=>self.postMessage('+JSON.stringify(options.importBook)+');'});
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) return route.abort();
      const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png" };
      return route.fulfill({ contentType: types[path.extname(file)] || "text/plain", body: fs.readFileSync(file) });
    }
    if (target.hostname === "www.gstatic.com" && target.pathname.includes("/firebasejs/")) {
      if (options.loadFail) return route.abort();
      const body = target.pathname.includes("firebase-auth.js") ? authModule
        : target.pathname.includes("firebase-functions.js") ? functionsModule
        : target.pathname.includes("firebase-database.js") ? databaseModule
        : 'export const initializeApp=()=>({});';
      return route.fulfill({ contentType: "text/javascript", body });
    }
    if (options.realBootstrap && target.hostname === 'cdn.jsdelivr.net' && target.pathname.includes('/bootstrap@5.3.0/')) {
      const name = target.pathname.endsWith('.js') ? 'bootstrap.bundle.min.js' : 'bootstrap.min.css';
      return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/css',body:fs.readFileSync(path.join(__dirname, 'fixtures', 'bootstrap-5.3.0', name))});
    }
    // Never fall through to a real external service.
    return route.fulfill({ contentType: target.pathname.endsWith(".js") ? "text/javascript" : "text/css", body: "" });
  });
  const page = await context.newPage();
  page.fixtureErrors = [];
  page.on('pageerror', error => page.fixtureErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.fixtureErrors.push(message.text()); });
  if(options.fastPreparationTimeout) await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => original(fn, delay === 15000 ? 100 : delay, ...args);
  });
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => console.error("Fixture page error:", error.message));
  await page.goto("https://proteja.test/", { waitUntil: "domcontentloaded" });
  return { page, context };
}
async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.authReady === "true");
}
async function credentials(page) {
  await page.locator("#username").fill("teste@example.org");
  await page.locator("#password").fill("SenhaFicticia123!");
}

test("legacy session is cleared and login is blocked until initialization finishes", async () => {
  const { page, context } = await fixture({ legacy: true, initBlocked: true });
  try {
    await page.waitForFunction(() => Boolean(window.__authTest?.releaseInit));
    const disabled = await page.locator("#btnLogin").isDisabled();
    assert.equal(disabled, true);
    await page.evaluate(() => document.getElementById("login-form").dispatchEvent(new Event("submit", {cancelable:true})));
    await page.evaluate(() => window.__authTest.releaseInit());
    await ready(page);
    assert.equal(await page.locator("#app-wrapper").isVisible(), false);
    assert.equal(await page.locator("#auth-wrapper").isVisible(), true);
    assert.deepEqual(await page.evaluate(() => window.__authTest.calls), ["persistence:NONE", "signOut", "observe"]);
    assert.equal(await page.evaluate(() => window.__authTest.subscriptions), 0);
    assert.equal(await page.locator("#register-form").count(), 0);
  } finally { await context.close(); }
});

test("explicit sign-in works, reload requires login, and no passwords stay in the form", async () => {
  const { page, context } = await fixture();
  try {
    await ready(page); await credentials(page); await page.locator("#btnLogin").click();
    await page.waitForFunction(() => !document.getElementById("app-wrapper").hidden);
    assert.equal(await page.locator("#password").inputValue(), "");
    assert.equal(await page.locator("#summary-total").textContent(), "1");
    await page.reload({waitUntil:"domcontentloaded"}); await ready(page);
    assert.equal(await page.locator("#app-wrapper").isVisible(), false);
    assert.equal(await page.locator("#case-table tbody tr").count(), 0);
  } finally { await context.close(); }
});

test("slow sign-in has feedback and does not send duplicate requests", {timeout:20000}, async () => {
  const { page, context } = await fixture({loginDelay:9000});
  try {
    await ready(page); await credentials(page); await page.locator("#btnLogin").click();
    assert.equal(await page.locator("#btnLogin").isDisabled(), true);
    await page.evaluate(() => document.getElementById("login-form").dispatchEvent(new Event("submit", {cancelable:true})));
    await page.waitForFunction(() => document.getElementById("auth-status").textContent.includes("demorando"), undefined, {timeout:10000});
    assert.equal(await page.evaluate(() => window.__authTest.calls.filter(v=>v==="signIn").length), 1);
    await page.waitForFunction(() => !document.getElementById("app-wrapper").hidden);
  } finally { await context.close(); }
});

test("wrong credentials keep the panel closed and allow retry", async () => {
  const { page, context } = await fixture({loginFail:true});
  try {
    await ready(page); await credentials(page); await page.locator("#btnLogin").click();
    await page.waitForFunction(() => document.getElementById("auth-status").textContent.includes("incorretos"));
    assert.equal(await page.locator("#app-wrapper").isVisible(), false);
    assert.equal(await page.locator("#btnLogin").isDisabled(), false);
    assert.equal(await page.evaluate(() => window.__authTest.subscriptions), 0);
  } finally { await context.close(); }
});

test("sign-out clears cases/form and ignores a late database callback", async () => {
  const { page, context } = await fixture();
  try {
    await ready(page); await credentials(page); await page.locator("#btnLogin").click();
    await page.waitForFunction(() => document.getElementById("summary-total").textContent==="1");
    await page.locator(".btnEditar").click();
    assert.equal(await page.locator("#detalhe-origem").inputValue(), "DETALHE-FICTICIO");
    await page.locator("#btnLogout").click();
    await page.waitForFunction(() => document.getElementById("app-wrapper").hidden);
    await page.evaluate(() => window.__authTest.emitCases());
    await page.evaluate(() => document.getElementById("case-form").dispatchEvent(new Event("submit", {cancelable:true})));
    assert.equal(await page.evaluate(() => window.__authTest.writes || 0), 0);
    assert.equal(await page.locator("#detalhe-origem").inputValue(), "");
    assert.equal(await page.locator("#case-table tbody tr").count(), 0);
    assert.equal(await page.locator("#summary-total").textContent(), "0");
    assert.equal(await page.evaluate(() => window.__authTest.unsubscribed), 1);
  } finally { await context.close(); }
});

test("preparation timeout stays closed even when Firebase finishes late",async()=>{
  const {page,context}=await fixture({initBlocked:true,fastPreparationTimeout:true});
  try {
    await page.waitForFunction(()=>document.documentElement.dataset.authFailed==='true');
    assert.equal(await page.locator('#btnLogin').isDisabled(),true);
    assert.match(await page.locator('#auth-status').textContent(),/internet pode estar funcionando/);
    assert.equal(await page.locator('#btnReloadAuth').isVisible(),true);
    await page.evaluate(()=>window.__authTest.releaseInit());
    await page.waitForTimeout(150);
    assert.notEqual(await page.evaluate(()=>document.documentElement.dataset.authReady),'true');
    assert.equal(await page.locator('#app-wrapper').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__authTest.subscriptions),0);
    await Promise.all([page.waitForURL(url=>url.searchParams.has('atualizar')),page.locator('#btnReloadAuth').click()]);
    assert.equal(new URL(page.url()).pathname,'/');
  }finally{await context.close();}
});

test("initialization failure leaves login disabled and shows recovery", async () => {
  const { page, context } = await fixture({initFail:true});
  try {
    await page.waitForFunction(() => !document.getElementById("btnReloadAuth").hidden);
    assert.equal(await page.locator("#btnLogin").isDisabled(), true);
    assert.equal(await page.locator("#app-wrapper").isVisible(), false);
  } finally { await context.close(); }
});

test("Firebase module failure is reported without enabling a native form submission", async () => {
  const { page, context } = await fixture({loadFail:true});
  try {
    await page.waitForFunction(() => !document.getElementById("btnReloadAuth").hidden);
    assert.equal(await page.locator("#btnLogin").isDisabled(), true);
    assert.match(await page.locator("#auth-status").textContent(), /carregar|demorando/);
    const url=page.url(); await credentials(page); await page.locator("#password").press("Enter");
    assert.equal(page.url(), url);
  } finally { await context.close(); }
});

const importRow = (id, date='15/02/2026', row=6) => ({row, values:{'Prontuário':id,'Entrada no PROTEJA':date,'Status no Proteja':'Ativo','Nome da CRIAD':'Pessoa fictícia','Sexo':'Valor legado','Origem do caso recebido no PROTEJA':'Origem legada'}, errors:[]});
const importBook = rows => ({sheets:[{name:'Casos',headers:['Prontuário','Entrada no PROTEJA'],rows}]});
async function importPreview(page) {
  await ready(page); await credentials(page); await page.locator('#btnLogin').click();
  await page.locator('#btnImport').click();
  await page.locator('#import-file').setInputFiles({name:'planilha-ficticia.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('synthetic mocked worker input')});
  await page.waitForFunction(()=>document.getElementById('import-summary').textContent.includes('prontos'));
}
test('import preview requires confirmation, skips existing and preserves original columns', async()=>{
  const {page,context}=await fixture({importBook:importBook([importRow('00001'),importRow('EXISTENTE','15/02/2026',7),importRow('SEM-DATA','',8)]),existing:[{numeroProntuario:'EXISTENTE'}]});
  try {
    await importPreview(page);
    await page.waitForFunction(()=>document.getElementById('import-summary').textContent.startsWith('1 prontos'));
    assert.equal(await page.locator('#import-save').isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__authTest.importAttempts||0),0);
    await page.locator('#import-confirm').check(); await page.locator('#import-save').click();
    await page.waitForFunction(()=>document.getElementById('import-status').textContent.includes('1 registros processados'));
    const saved=await page.evaluate(()=>window.__authTest.imported);
    assert.equal(saved.length,1); assert.equal(saved[0].numeroProntuario,'00001');
    assert.equal(saved[0].origemCaso,'Origem legada');
    assert.equal(JSON.parse(saved[0].dadosPlanilha).Sexo,'Valor legado');
    await page.locator('#import-close').click(); await page.locator('#btnImport').click();
    await page.locator('#import-file').setInputFiles({name:'planilha-ficticia.xlsx',buffer:Buffer.from('synthetic')});
    await page.waitForFunction(()=>document.getElementById('import-summary').textContent.startsWith('0 prontos'));
    assert.equal(await page.locator('#import-save').isDisabled(),true);
  }finally{await context.close();}
});
test('preview corrections enable a pending record and require confirmation again',async()=>{
  const {page,context}=await fixture({importBook:importBook([importRow('00002','')])});
  try{
    await importPreview(page);await page.waitForFunction(()=>document.querySelector('#import-rows input[type=date]'));
    await page.locator('#import-rows input[type=date]').fill('2026-02-15');await page.locator('#import-title').click();
    await page.waitForFunction(()=>document.getElementById('import-summary').textContent.startsWith('1 prontos'));
    await page.locator('#import-confirm').check();await page.locator('#import-save').click();
    await page.waitForFunction(()=>window.__authTest.imported?.length===1);
    assert.equal(await page.evaluate(()=>window.__authTest.imported[0].dataEntrada),'2026-02-15');
  }finally{await context.close();}
});
test('read-only account cannot prepare or submit an import',async()=>{
  const {page,context}=await fixture({readOnly:true,importBook:importBook([importRow('00003')])});
  try{
    await ready(page);await credentials(page);await page.locator('#btnLogin').click();
    await page.waitForFunction(()=>!document.getElementById('app-wrapper').hidden);
    assert.equal(await page.locator('#btnImport').isVisible(),false);
    await page.evaluate(()=>document.getElementById('btnImport').click());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#import-dialog').isVisible(),false);
    assert.equal(await page.locator('#import-save').isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__authTest.importAttempts||0),0);
  }finally{await context.close();}
});
test('stopping after an in-flight record prevents the next writes and ignores duplicate clicks',async()=>{
  const {page,context}=await fixture({writeDelay:700,importBook:importBook([importRow('00004'),importRow('00005','15/02/2026',7)])});
  try{
    await importPreview(page);await page.waitForFunction(()=>document.getElementById('import-summary').textContent.startsWith('2 prontos'));
    await page.locator('#import-confirm').check();await page.locator('#import-save').click();
    await page.waitForFunction(()=>window.__authTest.importAttempts===1);
    await page.evaluate(()=>document.getElementById('import-save').click());await page.locator('#import-close').click();
    await page.waitForFunction(()=>document.getElementById('import-status').textContent.includes('1 registros processados'));
    assert.equal(await page.evaluate(()=>window.__authTest.imported.length),1);
  }finally{await context.close();}
});
test('write failure keeps confirmed records and pending rows for retry',async()=>{
  const {page,context}=await fixture({failImportAt:2,importBook:importBook([importRow('00006'),importRow('00007','15/02/2026',7)])});
  try{
    await importPreview(page);await page.waitForFunction(()=>document.getElementById('import-summary').textContent.startsWith('2 prontos'));
    await page.locator('#import-confirm').check();await page.locator('#import-save').click();
    await page.waitForFunction(()=>document.getElementById('import-status').textContent.includes('Importação interrompida'));
    assert.equal(await page.evaluate(()=>window.__authTest.imported.length),1);
    assert.match(await page.locator('#import-summary').textContent(),/^1 prontos/);
    await page.locator('#import-confirm').check();await page.locator('#import-save').click();
    await page.waitForFunction(()=>window.__authTest.imported.length===2);
  }finally{await context.close();}
});
test('sign-out clears a spreadsheet preview and prevents its submission',async()=>{
  const {page,context}=await fixture({importBook:importBook([importRow('00008')])});
  try{
    await importPreview(page);await page.waitForFunction(()=>document.querySelector('#import-rows input'));
    await page.evaluate(()=>document.getElementById('btnLogout').click());
    await page.waitForFunction(()=>document.getElementById('app-wrapper').hidden);
    assert.equal(await page.locator('#import-dialog').isVisible(),false);
    assert.equal(await page.locator('#import-rows tr').count(),0);
    assert.equal(await page.locator('#import-file').inputValue(),'');
    await page.evaluate(()=>document.getElementById('import-save').click());
    assert.equal(await page.evaluate(()=>window.__authTest.importAttempts||0),0);
  }finally{await context.close();}
});
test('500-row preview fits mobile and desktop without overflowing the page',async()=>{
  const {page,context}=await fixture({importBook:importBook(Array.from({length:500},(_,i)=>importRow(String(i).padStart(6,'0'),'15/02/2026',i+6)))});
  try{
    await importPreview(page);await page.waitForFunction(()=>document.querySelectorAll('#import-rows tr').length===500);
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.PROTEJA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.PROTEJA_SCREENSHOT_DIR,`import-${width}.png`)});
    }
  }finally{await context.close();}
});

async function workflowLogin(page, readOnly=false) {
  await ready(page);await credentials(page);await page.locator('#btnLogin').click();
  await page.waitForFunction(()=>window.__authTest.workflowCases?.length>0);
  if(!readOnly)await page.waitForFunction(()=>!document.getElementById('agenda-new').disabled);
}
async function newAppointment(page) {
  await page.locator('#nav-agenda').click();await page.locator('#agenda-new').click();
  await page.locator('#workflow-case').selectOption('workflow-case');
  await page.locator('#workflow-owner').fill('Técnico fictício');
  await page.locator('#workflow-date').fill('2026-10-14');await page.locator('#workflow-time').fill('09:00');
}
async function workflowSaved(page) {await page.waitForFunction(()=>!document.getElementById('workflow-dialog').open);}
test('agenda saves independent dated records, prevents duplicate submission and preserves legacy text',async()=>{
  const {page,context}=await fixture({workflows:true,writeDelay:200});
  try {
    await workflowLogin(page);await page.locator('#nav-agenda').click();await page.locator('#agenda-case').selectOption('workflow-case');
    assert.match(await page.locator('#agenda-legacy').textContent(),/01\/02/);
    await newAppointment(page);await page.locator('#workflow-notes').fill('<img src=x onerror=alert(1)> Nota fictícia');
    await page.locator('#workflow-save').click();await page.evaluate(()=>document.getElementById('workflow-save').click());await workflowSaved(page);
    assert.equal(await page.evaluate(()=>window.__authTest.workflowWrites),1);
    assert.equal(await page.locator('#agenda-rows tr').count(),1);
    assert.match(await page.locator('#agenda-rows').textContent(),/14\/10\/2026 às 09:00/);
    assert.equal(await page.locator('#agenda-rows img').count(),0);
    const data=await page.evaluate(()=>window.__authTest.workflowCases[0].data);
    assert.equal(data.datasTexto,'Histórico fictício com data incompleta: 01/02');
    assert.equal(data.outrasPendencias,'Anotação fictícia preservada');
    const field=Object.keys(data).find(k=>k.startsWith('agenda_'));assert.equal(typeof data[field],'string');
    await page.locator('#agenda-rows .btn').click();await page.locator('#workflow-status').selectOption('realizado');
    await page.locator('#workflow-save').click();assert.equal(await page.locator('#workflow-dialog').isVisible(),true);
    await page.locator('#workflow-completed').fill('2026-10-15');await page.locator('#workflow-save').click();await workflowSaved(page);
    const saved=await page.evaluate(field=>JSON.parse(window.__authTest.workflowCases[0].data[field]),field);
    assert.equal(saved.revisao,2);assert.equal(saved.data,'2026-10-14');assert.equal(saved.dataConclusao,'2026-10-15');
  }finally{await context.close();}
});
test('single case search matches exact numbers and also CRIAD, owner and technician',async()=>{
  const workflowCases=[5,15,105].map(n=>({key:'case-'+n,data:{numeroProntuario:String(n),dataEntrada:'2026-01-01',situacaoAtual:'ativo',nomeCriad:'Pessoa fictícia '+n,responsavelNome:'Responsável '+n,tecnicosReferencia:'Equipe '+n}}));
  const {page,context}=await fixture({workflows:true,workflowCases});
  try {
    await workflowLogin(page);
    assert.equal(await page.locator('#filtroProntuario, #filtroCriad').count(),0);
    for(const query of ['05','Pessoa fictícia 5','Responsável 5','Equipe 5']){
      await page.locator('#filtroBusca').fill(query);
      assert.equal(await page.locator('#case-table tbody tr:not(.details-row)').count(),1);
      assert.equal(await page.locator('#case-table .case-number').textContent(),'5');
    }
    await page.locator('#btnLimparFiltros').click();
    assert.equal(await page.locator('#case-table tbody tr:not(.details-row)').count(),3);
  }finally{await context.close();}
});

test('long names reserve arrow space and show their complete text in both themes',async()=>{
  const fullName='Pessoa fictícia com nome longo para conferir a seta do seletor';
  const {page,context}=await fixture({workflows:true,workflowCases:[{key:'workflow-case',data:{numeroProntuario:'24',dataEntrada:'2026-01-01',situacaoAtual:'ativo',nomeCriad:fullName}}]});
  try {
    await workflowLogin(page);await page.locator('#nav-agenda').click();
    await page.locator('#agenda-case').selectOption('workflow-case');
    for(const theme of ['light','dark']) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      if(theme==='dark') await page.waitForFunction(()=>getComputedStyle(document.getElementById('agenda-case')).backgroundColor==='rgb(36, 52, 78)');
      const style=await page.locator('#agenda-case').evaluate(el=>({padding:parseFloat(getComputedStyle(el).paddingRight),background:getComputedStyle(el).backgroundColor,title:el.title}));
      assert.ok(style.padding>=48);assert.ok(style.title.includes(fullName));
      assert.equal(await page.locator('#agenda-case + .workflow-selected-case').textContent(),'24 — '+fullName);
      if(theme==='dark')assert.equal(style.background,'rgb(36, 52, 78)');
    }
    assert.ok((await page.locator('.app-version').first().textContent()).includes('20261015.3'));
  }finally{await context.close();}
});

test('search controls explain date ranges and never create appointments',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await page.locator('#nav-agenda').click();
    assert.equal(await page.locator('#agenda-search-title').textContent(),'Buscar atendimentos registrados');
    await page.getByLabel('Data agendada a partir de',{exact:true}).fill('2026-01-01');
    await page.getByLabel('Data agendada até',{exact:true}).fill('2026-12-31');
    await page.locator('#agenda-case').selectOption('workflow-case');
    assert.equal(await page.evaluate(()=>window.__authTest.workflowAttempts||0),0);
    await page.locator('#agenda-new').click();
    assert.equal(await page.locator('#workflow-date').inputValue(),'');
    assert.equal(await page.locator('#workflow-notes-title').textContent(),'Descrição / relato do atendimento');
    await page.locator('#workflow-cancel').click();
  }finally{await context.close();}
});

test('case shortcut opens appointment form directly and honors unsaved changes',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await page.locator('.btnEditar').click();
    // Bootstrap JS is intercepted in this fixture; reveal the pane for testing its controls.
    await page.evaluate(()=>{document.getElementById('tab8').classList.add('show','active');});
    await page.locator('#btnCaseAgenda').click();
    assert.equal(await page.locator('#workflow-dialog').isVisible(),true);
    assert.equal(await page.locator('#workflow-case').inputValue(),'workflow-case');
    await page.locator('#workflow-cancel').click();
    await page.locator('#nav-list').click();await page.locator('.btnEditar').click();
    await page.evaluate(()=>{document.getElementById('tab8').classList.add('show','active');});
    await page.locator('#tecnicos-referencia').fill('Alteração não salva');
    page.once('dialog',d=>d.dismiss());await page.locator('#btnCaseAgenda').click();
    assert.equal(await page.locator('#workflow-dialog').isVisible(),false);
    assert.equal(await page.locator('#form-section').isVisible(),true);
  }finally{await context.close();}
});

test('tasks support deadlines, manual priority, completion and exact-case filters',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await page.locator('#nav-tasks').click();await page.locator('#tarefas-new').click();
    await page.locator('#workflow-case').selectOption('workflow-case');await page.locator('#workflow-owner').fill('Equipe fictícia');
    await page.locator('#workflow-description').fill('Conferir documento fictício');await page.locator('#workflow-date').fill('2000-01-01');
    await page.locator('#workflow-priority').selectOption('alta');await page.locator('#workflow-save').click();await workflowSaved(page);
    assert.match(await page.locator('#tarefas-rows').textContent(),/Prazo vencido/);
    await page.locator('#tarefas-case').selectOption('workflow-case');assert.equal(await page.locator('#tarefas-rows tr').count(),1);
    await page.locator('#tarefas-owner').fill('inexistente');assert.equal(await page.locator('#tarefas-rows tr').count(),0);
    await page.locator('#tarefas-clear').click();await page.locator('#tarefas-rows .btn').click();
    await page.locator('#workflow-status').selectOption('concluida');await page.locator('#workflow-completed').fill('2026-10-14');
    await page.locator('#workflow-save').click();await workflowSaved(page);
    assert.doesNotMatch(await page.locator('#tarefas-rows').textContent(),/Prazo vencido/);
    assert.match(await page.locator('#tarefas-rows').textContent(),/Concluída em 14\/10\/2026/);
  }finally{await context.close();}
});
test('concurrent changes reject stale edits without overwriting newer content',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await newAppointment(page);await page.locator('#workflow-save').click();await workflowSaved(page);
    await page.locator('#agenda-rows .btn').click();await page.locator('#workflow-notes').fill('Edição local fictícia');
    await page.evaluate(()=>{window.__authTest.forceConflict=true;});await page.locator('#workflow-save').click();
    await page.waitForFunction(()=>document.getElementById('workflow-error').textContent.includes('mudou'));
    assert.equal(await page.evaluate(()=>window.__authTest.workflowWrites),1);
    assert.equal(await page.locator('#workflow-notes').inputValue(),'Edição local fictícia');
    const current=await page.evaluate(()=>JSON.parse(Object.entries(window.__authTest.workflowCases[0].data).find(([k])=>k.startsWith('agenda_'))[1]));
    assert.equal(current.observacao,'Atualizado por outra pessoa fictícia');
    page.once('dialog',d=>d.accept());await page.locator('#workflow-cancel').click();await workflowSaved(page);
  }finally{await context.close();}
});
test('write failure preserves the draft for retry under the same item key',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await newAppointment(page);await page.evaluate(()=>{window.__authTest.failWorkflow=true;});
    await page.locator('#workflow-save').click();await page.waitForFunction(()=>document.getElementById('workflow-error').textContent.includes('Não foi possível'));
    assert.equal(await page.locator('#workflow-date').inputValue(),'2026-10-14');
    await page.locator('#workflow-save').click();await workflowSaved(page);
    assert.equal(await page.evaluate(()=>Object.keys(window.__authTest.workflowCases[0].data).filter(k=>k.startsWith('agenda_')).length),1);
  }finally{await context.close();}
});
test('read-only access and permission revocation block new workflow writes',async()=>{
  const first=await fixture({workflows:true,readOnly:true,realBootstrap:true});
  try {
    await ready(first.page);await credentials(first.page);await first.page.locator('#btnLogin').click();
    await first.page.waitForFunction(()=>document.getElementById('shared-summary-value').textContent==='Menos de 10');
    assert.equal(await first.page.locator('#nav-agenda').isVisible(),false);
    assert.equal(await first.page.evaluate(()=>window.__authTest.subscriptions),0);
    assert.equal(await first.page.locator('#list-section').isVisible(),false);
    assert.equal(await first.page.locator('#case-table tbody tr').count(),0);
    assert.deepEqual(await first.page.evaluate(()=>window.__authTest.remoteCalls.map(c=>c.name)),['consultarResumo']);
    if(process.env.PROTEJA_QA_ASSETS) await first.page.screenshot({path:path.join(process.env.PROTEJA_QA_ASSETS,'consulta-security.png'),fullPage:true});
  }finally{await first.context.close();}
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await newAppointment(page);await page.evaluate(()=>window.__authTest.setReadOnly(true));
    await page.locator('#workflow-save').click();await page.waitForFunction(()=>document.getElementById('workflow-error').textContent.includes('não tem permissão'));
    assert.equal(await page.evaluate(()=>window.__authTest.workflowAttempts||0),0);
    assert.equal(await page.locator('#workflow-save').isDisabled(),true);
  }finally{await context.close();}
});
test('sign-out clears workflow forms and ignores an already submitted server response',async()=>{
  const {page,context}=await fixture({workflows:true,writeDelay:300});
  try {
    await workflowLogin(page);await newAppointment(page);await page.locator('#workflow-save').click();
    await page.waitForFunction(()=>window.__authTest.workflowAttempts===1);
    await page.evaluate(()=>document.getElementById('btnLogout').click());await page.waitForFunction(()=>document.getElementById('app-wrapper').hidden);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#workflow-dialog').isVisible(),false);assert.equal(await page.locator('#workflow-owner').inputValue(),'');
    assert.equal(await page.locator('#agenda-rows tr').count(),0);assert.equal(await page.evaluate(()=>window.__authTest.workflowWrites||0),1);
  }finally{await context.close();}
});
test('new navigation protects unsaved case edits and reduced motion disables count animation',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await page.emulateMedia({reducedMotion:'reduce'});await workflowLogin(page);await page.locator('.btnEditar').click();
    await page.locator('#detalhe-origem').fill('Alteração fictícia não salva');page.once('dialog',d=>d.dismiss());
    await page.locator('#nav-agenda').click();assert.equal(await page.locator('#form-section').isVisible(),true);
    assert.equal(await page.locator('#detalhe-origem').inputValue(),'Alteração fictícia não salva');
    page.once('dialog',d=>d.accept());await page.locator('#nav-list').click();await page.locator('#filtroBusca').fill('inexistente');
    assert.equal(await page.evaluate(()=>document.getElementById('summary-total').getAnimations().length),0);
  }finally{await context.close();}
});

test('case form rejects stale edits, retains the draft and keeps remote content',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await page.locator('.btnEditar').click();
    assert.equal(await page.locator('#numero-prontuario').getAttribute('readonly'),'');
    await page.locator('#detalhe-origem').fill('Rascunho local fictício');
    await page.evaluate(()=>{window.__authTest.forceCaseConflict=true;});
    await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(()=>document.getElementById('case-save-status').textContent.includes('outra pessoa'));
    assert.equal(await page.locator('#detalhe-origem').inputValue(),'Rascunho local fictício');
    assert.equal(await page.locator('#form-section').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.__authTest.workflowCases[0].data.nomeCriad),'Atualização remota fictícia');
    assert.equal(await page.evaluate(()=>window.__authTest.caseWrites||0),0);
  } finally {await context.close();}
});

test('case edit preserves activity fields and saves once during repeated submission',async()=>{
  const {page,context}=await fixture({workflows:true,writeDelay:200});
  try {
    await workflowLogin(page);await page.locator('.btnEditar').click();
    await page.locator('#detalhe-origem').fill('Detalhe corrigido fictício');
    await page.evaluate(()=>{window.__authTest.workflowCases[0].data.agenda_preservada='Registro fictício';window.__authTest.emitCases();});
    await page.locator('#btnSalvarCaso').click();
    await page.evaluate(()=>document.getElementById('case-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await page.waitForFunction(()=>window.__authTest.caseWrites===1);
    const record=await page.evaluate(()=>window.__authTest.workflowCases[0].data);
    assert.equal(record.agenda_preservada,'Registro fictício');
    assert.equal(record.detalheOrigem,'Detalhe corrigido fictício');
    assert.equal(record.atualizadoPor,'fixture-user');
  } finally {await context.close();}
});

test('manual registration blocks a legacy duplicate with different leading zeros',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await page.locator('#nav-new').click();
    await page.locator('#numero-prontuario').fill('5');await page.locator('#data-entrada').fill('2026-10-15');
    await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(()=>document.getElementById('case-save-status').textContent.includes('já está cadastrado'));
    assert.equal(await page.evaluate(()=>window.__authTest.caseWrites||0),0);
  } finally {await context.close();}
});

test('sign-out while saving a case clears the UI and ignores the server response',async()=>{
  const {page,context}=await fixture({workflows:true,writeDelay:300});
  try {
    await workflowLogin(page);await page.locator('.btnEditar').click();
    await page.locator('#detalhe-origem').fill('Alteração fictícia');await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(()=>window.__authTest.workflowAttempts===1);
    await page.evaluate(()=>document.getElementById('btnLogout').click());
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#app-wrapper').isVisible(),false);
    assert.equal(await page.locator('#case-save-status').textContent(),'');
    assert.equal(await page.evaluate(()=>window.__authTest.caseWrites||0),1);
  } finally {await context.close();}
});

test('new manual case and import preview share the same prontuario identity',async()=>{
  const {page,context}=await fixture({workflows:true,importBook:importBook([importRow('00006')])});
  try {
    await workflowLogin(page);await page.locator('#nav-new').click();
    await page.locator('#numero-prontuario').fill('06');await page.locator('#data-entrada').fill('2026-10-15');
    await page.locator('#btnSalvarCaso').click();await page.waitForFunction(()=>window.__authTest.caseWrites===1);
    const record=await page.evaluate(()=>window.__authTest.workflowCases.find(c=>c.data.numeroProntuario==='06'));
    assert.match(record.key,/^case_[0-9a-f]{64}$/);
    assert.equal(record.data.origemCadastro,'manual');
    await page.locator('#btnImport').click();
    await page.locator('#import-file').setInputFiles({name:'teste-ficticio.xlsx',buffer:Buffer.from('mocked worker')});
    await page.waitForFunction(()=>document.getElementById('import-summary').textContent.includes('1 já existentes'));
    assert.match(await page.locator('#import-summary').textContent(),/^0 prontos/);
    assert.equal(await page.locator('#import-save').isDisabled(),true);
  } finally {await context.close();}
});


// Phase 1: all persistence below is the in-memory Firebase fixture.
const neutralFields = ['origem-caso','cor','situacao-atual','comunicacao-violencia','retorno-solicitado','estudo-caso','pia-elaborado'];
async function beforeUnloadBlocked(page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', {cancelable:true});
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}
async function newCase(page) {
  await workflowLogin(page);
  await page.locator('#nav-new').click();
}
test('phase1 neutral defaults save no invented answers and clean drafts do not warn', async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await newCase(page);
    for(const id of neutralFields) assert.equal(await page.locator('#'+id).inputValue(),'');
    assert.equal(await beforeUnloadBlocked(page),false);
    await page.locator('#numero-prontuario').fill('FASE1-NEUTRO');
    await page.locator('#data-entrada').fill('2026-10-17');
    assert.equal(await beforeUnloadBlocked(page),true);
    await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(()=>window.__authTest.caseWrites===1);
    const saved=await page.evaluate(()=>window.__authTest.workflowCases.find(c=>c.data.numeroProntuario==='FASE1-NEUTRO').data);
    assert.equal(Object.hasOwn(saved,'situacaoAtual'),false);
    for(const key of ['origemCaso','cor','comunicacaoViolencia','retornoSolicitado','estudoCaso','piaElaborado']) assert.equal(saved[key],'');
    await page.waitForFunction(()=>document.getElementById('form-section').hidden);
    assert.equal(await beforeUnloadBlocked(page),false);
  } finally {await context.close();}
});
test('phase1 editing preserves imported selections and optional unanswered fields',async()=>{
  const original={numeroProntuario:'LEGADO-1',dataEntrada:'2026-01-01',cor:'Valor importado',origemCaso:'enc_saude',retornoSolicitado:'nao',estudoCaso:'sim',piaElaborado:'',comunicacaoViolencia:'nao'};
  const {page,context}=await fixture({workflows:true,workflowCases:[{key:'legacy-case',data:original}],realBootstrap:true});
  try {
    await workflowLogin(page);await page.locator('.btnEditar').click();
    assert.equal(await beforeUnloadBlocked(page),false);
    await page.locator('#detalhe-origem').fill('Descrição fictícia');
    await page.locator('#btnSalvarCaso').click();await page.waitForFunction(()=>window.__authTest.caseWrites===1);
    const saved=await page.evaluate(()=>window.__authTest.workflowCases[0].data);
    for(const [key,value] of Object.entries(original)) assert.equal(saved[key],value);
    await page.locator('#nav-new').click();
    for(const id of neutralFields) assert.equal(await page.locator('#'+id).inputValue(),'');
  } finally {await context.close();}
});
test('phase1 native and whitespace errors focus the correct tab and keep input',async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await newCase(page);
    await page.locator('#numero-prontuario').fill('   ');
    await page.locator('[data-bs-target="#tab3"]').click();
    await page.locator('#responsavel-nome').fill('Responsável fictício');
    await page.locator('#btnSalvarCaso').click();
    assert.equal(await page.locator('#numero-prontuario').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#numero-prontuario').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('#tab1').isVisible(),true);
    assert.match(await page.locator('#numero-prontuario-error').textContent(),/Informe/);
    assert.match(await page.locator('#numero-prontuario').getAttribute('aria-describedby'),/numero-prontuario-error/);
    assert.equal(await page.locator('#responsavel-nome').inputValue(),'Responsável fictício');
    await page.locator('#numero-prontuario').fill('VALIDO');
    assert.equal(await page.locator('#numero-prontuario').getAttribute('aria-invalid'),null);
    await page.locator('#btnSalvarCaso').click();
    assert.equal(await page.locator('#data-entrada').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(()=>window.__authTest.caseWrites||0),0);
    await page.locator('#numero-prontuario').evaluate(el=>{el.value='X'.repeat(101);});
    await page.locator('#btnSalvarCaso').click();
    assert.match(await page.locator('#numero-prontuario-error').textContent(),/100/);
  } finally {await context.close();}
});
test('phase1 duplicate error is inline and changing the number permits retry',async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await newCase(page);await page.locator('#numero-prontuario').fill('5');await page.locator('#data-entrada').fill('2026-10-17');
    await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(()=>document.getElementById('numero-prontuario').getAttribute('aria-invalid')==='true');
    await page.waitForFunction(()=>document.activeElement.id==='numero-prontuario');
    assert.match(await page.locator('#numero-prontuario-error').textContent(),/já está cadastrado/);
    assert.equal(await beforeUnloadBlocked(page),true);
    await page.locator('#numero-prontuario').fill('NOVO-6');await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(()=>window.__authTest.caseWrites===1);
  } finally {await context.close();}
});
test('phase1 discard and restoring the original values remove exit warnings',async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await newCase(page);await page.locator('#numero-prontuario').fill('RASCUNHO');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#btnCancelarForm').click();
    assert.equal(await page.locator('#form-section').isVisible(),true);
    assert.equal(await beforeUnloadBlocked(page),true);
    await page.locator('#numero-prontuario').fill('');assert.equal(await beforeUnloadBlocked(page),false);
    await page.locator('#numero-prontuario').fill('DESCARTAR');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#btnCancelarForm').click();
    assert.equal(await beforeUnloadBlocked(page),false);
  } finally {await context.close();}
});
test('phase1 real reload can be canceled without losing the draft',async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await newCase(page);await page.locator('#numero-prontuario').fill('MANTER');
    const shown=page.waitForEvent('dialog');
    const reload=page.reload().catch(()=>null);
    const dialog=await shown;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reload;
    assert.equal(await page.locator('#numero-prontuario').inputValue(),'MANTER');
    const second=page.waitForEvent('dialog');const accepted=page.reload();await (await second).accept();await accepted;
    await ready(page);assert.equal(await page.locator('#auth-wrapper').isVisible(),true);
  } finally {await context.close();}
});
test('phase1 workflow errors are inline and pending drafts protect reload and cancel',async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await workflowLogin(page);await page.locator('#nav-agenda').click();await page.locator('#agenda-new').click();
    assert.equal(await beforeUnloadBlocked(page),false);
    await page.locator('#workflow-case').selectOption('workflow-case');await page.locator('#workflow-owner').fill('   ');
    await page.locator('#workflow-save').click();
    assert.equal(await page.locator('#workflow-owner').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#workflow-owner').evaluate(el=>el===document.activeElement),true);
    assert.equal(await beforeUnloadBlocked(page),true);
    await page.locator('#workflow-owner').fill('Equipe fictícia');await page.locator('#workflow-date').fill('2026-10-17');
    await page.locator('#workflow-status').selectOption('realizado');await page.locator('#workflow-save').click();
    assert.equal(await page.locator('#workflow-completed').getAttribute('aria-invalid'),'true');
    await page.locator('#workflow-completed').fill('2026-10-17');await page.locator('#workflow-save').click();
    await workflowSaved(page);assert.equal(await beforeUnloadBlocked(page),false);
    await page.locator('#nav-tasks').click();await page.locator('#tarefas-new').click();
    await page.locator('#workflow-description').fill('Pendência fictícia');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#workflow-cancel').click();
    assert.equal(await page.locator('#workflow-dialog').isVisible(),true);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#workflow-cancel').click();
    assert.equal(await beforeUnloadBlocked(page),false);
  } finally {await context.close();}
});
test('phase1 in-flight and failed saves keep the draft protected',async()=>{
  const {page,context}=await fixture({workflows:true,writeDelay:400,realBootstrap:true});
  try {
    await workflowLogin(page);await page.locator('.btnEditar').click();
    await page.locator('#detalhe-origem').fill('Manter ap?s falha');
    await page.evaluate(()=>{window.__authTest.failWorkflow=true;});
    await page.locator('#btnSalvarCaso').click();await page.waitForFunction(()=>window.__authTest.workflowAttempts===1);
    assert.equal(await beforeUnloadBlocked(page),true);
    await page.waitForFunction(()=>document.getElementById('case-save-status').textContent.length>0);
    assert.equal(await page.locator('#detalhe-origem').inputValue(),'Manter ap?s falha');
    assert.equal(await beforeUnloadBlocked(page),true);
    assert.equal(await page.evaluate(()=>window.__authTest.caseWrites||0),0);
  } finally {await context.close();}
});
test('phase1 actual tabs preserve input and errors fit desktop/mobile in both themes',async()=>{
  const {page,context}=await fixture({workflows:true,realBootstrap:true});
  try {
    await newCase(page);await page.locator('#numero-prontuario').fill('FICTICIO-UI');
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      for(const theme of ['light','dark']) {
        await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.bsTheme=theme;},theme);
        for(let tab=1;tab<=8;tab++) {
          const button=page.locator(`[data-bs-target="#tab${tab}"]`);await button.click();
          await page.waitForFunction(id => { const pane=document.getElementById(id); return pane.classList.contains('show') && getComputedStyle(pane).opacity==='1'; }, 'tab'+tab);
          assert.equal(await page.locator('#tab'+tab).isVisible(),true);
        }
        assert.equal(await page.locator('#numero-prontuario').inputValue(),'FICTICIO-UI');
        await page.locator('#btnSalvarCaso').click();
        assert.equal(await page.locator('#tab1').isVisible(),true);
        await page.waitForFunction(()=>document.getElementById('tab1').classList.contains('show') && getComputedStyle(document.getElementById('tab1')).opacity==='1');
        await page.evaluate(()=>document.querySelectorAll('.notification').forEach(n=>n.remove()));
        const message=page.locator('#data-entrada-error');assert.equal(await message.isVisible(),true);
        const box=await message.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        const activeTab=await page.locator('[data-bs-target="#tab1"]').boundingBox();
        assert.ok(activeTab.x>=0 && activeTab.x+activeTab.width<=width);
        assert.deepEqual(page.fixtureErrors, []);
        if(process.env.PROTEJA_QA_ASSETS) await page.screenshot({path:path.join(process.env.PROTEJA_QA_ASSETS,`fase1-${width}-${theme}.png`),fullPage:true});
      }
    }
  } finally {await context.close();}
});
