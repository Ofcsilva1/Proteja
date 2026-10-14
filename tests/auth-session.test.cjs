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
  await page.goto("http://proteja.test/", { waitUntil: "domcontentloaded" });
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

