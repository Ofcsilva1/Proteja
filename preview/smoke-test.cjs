const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

test('isolated preview supports phase 1 flows without external data connections', async () => {
  const root = path.resolve(process.env.PROTEJA_PREVIEW_DIR);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PROTEJA_BROWSER_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'proteja-preview.test') {
      external.push(url.href);
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort();
    }
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return route.abort();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
    return route.fulfill({ contentType: types[path.extname(filename)] || 'application/octet-stream', body: fs.readFileSync(filename) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto('https://proteja-preview.test/');
    await page.waitForFunction(() => document.documentElement.dataset.authReady === 'true');
    assert.match(await page.title(), /Demonstração/);
    assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
    await page.locator('#btnLogin').click();
    await page.waitForFunction(() => document.getElementById('summary-total').textContent === '2');
    assert.equal(await page.locator('.demo-banner').isVisible(), true);
    await page.locator('#nav-new').click();
    for (const id of ['origem-caso','cor','situacao-atual','comunicacao-violencia','retorno-solicitado','estudo-caso','pia-elaborado']) assert.equal(await page.locator('#'+id).inputValue(), '');
    await page.locator('#btnSalvarCaso').click();
    assert.equal(await page.locator('#numero-prontuario').getAttribute('aria-invalid'), 'true');
    await page.locator('#numero-prontuario').fill('5');
    await page.locator('#data-entrada').fill('2026-10-17');
    await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(() => document.getElementById('numero-prontuario-error').textContent.includes('já está cadastrado'));
    await page.locator('#numero-prontuario').fill('TESTE-PREVIA');
    await page.locator('#btnSalvarCaso').click();
    await page.waitForFunction(() => document.getElementById('summary-total').textContent === '3');
    await page.locator('#nav-agenda').click();
    await page.locator('#agenda-new').click();
    await page.locator('#workflow-case').selectOption('demo-case-5');
    await page.locator('#workflow-owner').fill('Equipe fictícia da prévia');
    await page.locator('#workflow-date').fill('2026-10-17');
    await page.locator('#workflow-save').click();
    await page.waitForFunction(() => !document.getElementById('workflow-dialog').open);
    assert.equal(await page.locator('#agenda-rows tr').count(), 2);
    await page.locator('#nav-tasks').click();
    assert.equal(await page.locator('#tarefas-rows tr').count(), 1);
    await page.locator('#nav-list').click();
    for (const id of ['btnExportCSV', 'btnExportPDF']) {
      const downloaded = page.waitForEvent('download'); await page.locator('#'+id).click();
      assert.ok((await downloaded).suggestedFilename().startsWith('proteja_casos'));
    }
    await page.locator('#nav-new').click();
    await page.locator('#numero-prontuario').fill('RASCUNHO-FICTICIO');
    const dialogEvent = page.waitForEvent('dialog'); const reload = page.reload().catch(() => {});
    const dialog = await dialogEvent; assert.equal(dialog.type(), 'beforeunload'); await dialog.dismiss(); await reload;
    assert.equal(await page.locator('#numero-prontuario').inputValue(), 'RASCUNHO-FICTICIO');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height:1000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.PROTEJA_QA_ASSETS) await page.screenshot({ path:path.join(process.env.PROTEJA_QA_ASSETS, `preview-${width}.png`), fullPage:true });
    }
    assert.deepEqual(errors, []);
    assert.ok(external.every(url => new URL(url).hostname === 'fonts.googleapis.com'));
    const discardEvent = page.waitForEvent('dialog'); const restarted = page.reload();
    await (await discardEvent).accept(); await restarted;
    await page.waitForFunction(() => document.documentElement.dataset.authReady === 'true');
    await page.locator('#btnLogin').click();
    await page.waitForFunction(() => document.getElementById('summary-total').textContent === '2');
    console.log('Preview: synthetic case/agenda writes, CSV/PDF, reload guard, reset, CSP, 1440/390px and console verified.');
  } finally { await context.close(); await browser.close(); }
});
