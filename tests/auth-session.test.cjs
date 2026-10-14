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
  'export const get=async p=>({val:()=>({active:true,canWrite:!opts.readOnly}),forEach:fn=>[...(opts.existing||[]),...Object.values(stored)].forEach(v=>fn({val:()=>v}))});',
  'export const runTransaction=async(p,fn)=>{const d=window.__authTest;if(workflowCases){d.workflowAttempts=(d.workflowAttempts||0)+1;await new Promise(r=>setTimeout(r,opts.writeDelay||0));if(d.failWorkflow){d.failWorkflow=false;throw {code:"PERMISSION_DENIED"};}const [,caseKey,field]=p.split("/");const row=workflowCases.find(c=>c.key===caseKey);if(!row)throw {code:"PERMISSION_DENIED"};if(d.forceConflict&&row.data[field]){const next=JSON.parse(row.data[field]);next.revisao++;next.observacao="Atualizado por outra pessoa fictícia";row.data[field]=JSON.stringify(next);d.forceConflict=false;d.emitCases();}const value=fn(row.data[field]??null);if(value===undefined)return {committed:false};row.data[field]=value;d.workflowWrites=(d.workflowWrites||0)+1;d.emitCases();return {committed:true};}d.importAttempts=(d.importAttempts||0)+1;await new Promise(r=>setTimeout(r,opts.writeDelay||0));if(opts.failImportAt===d.importAttempts)throw new Error("fixture");const value=fn(stored[p]??null);if(value===undefined)return {committed:false};stored[p]=value;d.imported=Object.values(stored);return {committed:true};};',
  'export const getDatabase=()=>({});export const ref=(_db,p)=>p;',
  'export const push=async()=>{window.__authTest.writes=(window.__authTest.writes||0)+1;};export const update=async()=>{window.__authTest.writes=(window.__authTest.writes||0)+1;};',
  'export const onValue=(p,cb)=>{const d=window.__authTest;d.subscriptions++;d.workflowCases=workflowCases;d.setReadOnly=v=>{opts.readOnly=v;};d.emitCases=()=>cb({forEach:fn=>workflowCases?workflowCases.forEach(c=>fn({key:c.key,val:()=>c.data})):fn({key:"fake-key",val:()=>({numeroProntuario:"CASE-01",dataEntrada:"2026-10-14",situacaoAtual:"ativo",nomeCriad:"DADO-FICTICIO",detalheOrigem:"DETALHE-FICTICIO"})})});d.emitCases();return()=>{d.unsubscribed++;};};'
].join("\n");

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
        : target.pathname.includes("firebase-database.js") ? databaseModule
        : 'export const initializeApp=()=>({});';
      return route.fulfill({ contentType: "text/javascript", body });
    }
    // Never fall through to a real external service.
    return route.fulfill({ contentType: target.pathname.endsWith(".js") ? "text/javascript" : "text/css", body: "" });
  });
  const page = await context.newPage();
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
    await importPreview(page);await page.waitForFunction(()=>document.getElementById('import-status').textContent.includes('canWrite'));
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
    await page.waitForFunction(()=>document.getElementById('import-status').textContent.includes('interrompida por'));
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
  await page.waitForFunction(()=>window.__authTest.workflowCases?.length===1);
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
test('tasks support deadlines, manual priority, completion and exact-case filters',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await page.locator('#nav-tasks').click();await page.locator('#tarefas-new').click();
    await page.locator('#workflow-case').selectOption('workflow-case');await page.locator('#workflow-owner').fill('Equipe fictícia');
    await page.locator('#workflow-description').fill('Conferir documento fictício');await page.locator('#workflow-date').fill('2000-01-01');
    await page.locator('#workflow-priority').selectOption('alta');await page.locator('#workflow-save').click();await workflowSaved(page);
    assert.match(await page.locator('#tarefas-rows').textContent(),/Prazo vencido/);
    await page.locator('#tarefas-numero').fill('05');assert.equal(await page.locator('#tarefas-rows tr').count(),1);
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
  const first=await fixture({workflows:true,readOnly:true});
  try {await workflowLogin(first.page,true);await first.page.locator('#nav-agenda').click();assert.equal(await first.page.locator('#agenda-new').isDisabled(),true);}finally{await first.context.close();}
  const {page,context}=await fixture({workflows:true});
  try {
    await workflowLogin(page);await newAppointment(page);await page.evaluate(()=>window.__authTest.setReadOnly(true));
    await page.locator('#workflow-save').click();await page.waitForFunction(()=>document.getElementById('workflow-error').textContent.includes('não tem permissão'));
    assert.equal(await page.evaluate(()=>window.__authTest.workflowAttempts||0),0);
    assert.equal(await page.locator('#workflow-save').isDisabled(),true);
  }finally{await context.close();}
});
test('sign-out clears workflow forms and prevents a pending transaction from writing',async()=>{
  const {page,context}=await fixture({workflows:true,writeDelay:300});
  try {
    await workflowLogin(page);await newAppointment(page);await page.locator('#workflow-save').click();
    await page.waitForFunction(()=>window.__authTest.workflowAttempts===1);
    await page.evaluate(()=>document.getElementById('btnLogout').click());await page.waitForFunction(()=>document.getElementById('app-wrapper').hidden);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#workflow-dialog').isVisible(),false);assert.equal(await page.locator('#workflow-owner').inputValue(),'');
    assert.equal(await page.locator('#agenda-rows tr').count(),0);assert.equal(await page.evaluate(()=>window.__authTest.workflowWrites||0),0);
  }finally{await context.close();}
});
test('new navigation protects unsaved case edits and reduced motion disables count animation',async()=>{
  const {page,context}=await fixture({workflows:true});
  try {
    await page.emulateMedia({reducedMotion:'reduce'});await workflowLogin(page);await page.locator('.btnEditar').click();
    await page.locator('#detalhe-origem').fill('Alteração fictícia não salva');page.once('dialog',d=>d.dismiss());
    await page.locator('#nav-agenda').click();assert.equal(await page.locator('#form-section').isVisible(),true);
    assert.equal(await page.locator('#detalhe-origem').inputValue(),'Alteração fictícia não salva');
    page.once('dialog',d=>d.accept());await page.locator('#nav-list').click();await page.locator('#filtroProntuario').fill('inexistente');
    assert.equal(await page.evaluate(()=>document.getElementById('summary-total').getAnimations().length),0);
  }finally{await context.close();}
});

