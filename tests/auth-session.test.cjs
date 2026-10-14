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
  'export const get=async p=>({val:()=>({active:true,canWrite:!opts.readOnly}),forEach:fn=>[...(opts.existing||[]),...Object.values(stored)].forEach(v=>fn({val:()=>v}))});',
  'export const runTransaction=async(p,fn)=>{const d=window.__authTest;d.importAttempts=(d.importAttempts||0)+1;await new Promise(r=>setTimeout(r,opts.writeDelay||0));if(opts.failImportAt===d.importAttempts)throw new Error("fixture");const value=fn(stored[p]??null);if(value===undefined)return {committed:false};stored[p]=value;d.imported=Object.values(stored);return {committed:true};};',
  'export const getDatabase=()=>({});export const ref=(_db,p)=>p;',
  'export const push=async()=>{window.__authTest.writes=(window.__authTest.writes||0)+1;};export const update=async()=>{window.__authTest.writes=(window.__authTest.writes||0)+1;};',
  'export const onValue=(p,cb)=>{const d=window.__authTest;d.subscriptions++;d.emitCases=()=>cb({forEach:fn=>fn({key:"fake-key",val:()=>({numeroProntuario:"CASE-01",dataEntrada:"2026-10-14",situacaoAtual:"ativo",nomeCriad:"DADO-FICTICIO",detalheOrigem:"DETALHE-FICTICIO"})})});d.emitCases();return()=>{d.unsubscribed++;};};'
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

