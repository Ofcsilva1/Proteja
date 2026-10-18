// Generates a disposable, static demo. Never changes the production source files.
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { resolve, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || join(root, '.preview-dist'));
const rootFromOutput = relative(output, root);
if (!rootFromOutput || (!rootFromOutput.startsWith('..' + sep) && !isAbsolute(rootFromOutput))) throw new Error('Use a separate preview output directory.');
await mkdir(output, { recursive: true });
for (const name of await readdir(root)) {
  if (name.endsWith('.js') || ['index.html', 'style.css', 'Logo.png', 'Logo-dark.png'].includes(name)) {
    await cp(join(root, name), join(output, name));
  }
}
await cp(join(root, 'vendor'), join(output, 'vendor'), { recursive: true });
await mkdir(join(output, 'preview'), { recursive: true });
await cp(join(root, 'preview/demo-firebase.js'), join(output, 'preview/demo-firebase.js'));
await cp(join(root, 'tests/fixtures/bootstrap-5.3.0'), join(output, 'preview/bootstrap'), { recursive: true });
let script = await readFile(join(root, 'script.js'), 'utf8');
script = script.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^"']+/g, './preview/demo-firebase.js')
  .replace(/const firebaseConfig = \{[\s\S]*?\n\};/, "const firebaseConfig = { projectId: 'proteja-demo-isolada' };")
  .replace('loginButton.textContent = "Acessar sistema";', 'loginButton.textContent = "Entrar na demonstração";');
await writeFile(join(output, 'script.js'), script);
let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace('<title>Sistema PROTEJA | Gestão de Casos</title>', '<title>PROTEJA — Demonstração da Fase 1</title>')
  .replace('<head>', `<head>
<meta name="robots" content="noindex,nofollow" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" />
<link rel="stylesheet" href="preview/demo.css" />`)
  .replace('https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css', 'preview/bootstrap/bootstrap.min.css')
  .replace('https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js', 'preview/bootstrap/bootstrap.bundle.min.js')
  .replace('https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css', 'preview/assets/bootstrap-icons.css')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css', 'preview/assets/animate.min.css')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'preview/assets/jspdf.umd.min.js')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js', 'preview/assets/jspdf.plugin.autotable.min.js')
  .replace('<body>', '<body><div class="demo-banner" role="note"><strong>Demonstração — Fase 1</strong><span>Dados fictícios. Sem Firebase real. Alterações desaparecem ao recarregar.</span><button type="button" id="demo-reset">Reiniciar</button></div><script src="preview/demo-ui.js" defer></script>')
  .replace('id="username" class="form-control"', 'id="username" value="demo@example.org" readonly class="form-control"')
  .replace('id="password" class="form-control"', 'id="password" value="demonstracao" readonly class="form-control"')
  .replace('O acesso é destinado a contas autorizadas pela instituição.', 'Acesso fictício. Não informe credenciais ou dados pessoais reais.');
await writeFile(join(output, 'index.html'), html);
await writeFile(join(output, 'preview/demo-ui.js'), "document.getElementById('demo-reset').addEventListener('click', () => location.reload());\n");
await writeFile(join(output, 'preview/demo.css'), `:root { --demo-height: 68px; }
.demo-banner { position: fixed; z-index: 10010; inset: 0 0 auto; height: var(--demo-height); display: flex; align-items: center; gap: 16px; padding: 10px 18px; background: #fff4cf; color: #49370b; border-bottom: 1px solid #d5b75f; font: 13px/1.4 system-ui; }
.demo-banner strong { flex-shrink: 0; }.demo-banner span { flex: 1; }.demo-banner button { padding: 8px 12px; border: 1px solid #8b702d; border-radius: 8px; background: #fff; color: #49370b; }
.auth-wrapper { top: var(--demo-height) !important; }.app-layout { padding-top: var(--demo-height); }.sidebar { top: var(--demo-height) !important; height: calc(100vh - var(--demo-height)) !important; }
@media(max-width:820px) { .sidebar { top: auto !important; height: auto !important; } }
@media(max-width:520px) { :root { --demo-height: 112px; }.demo-banner { flex-wrap: wrap; gap: 4px 12px; }.demo-banner span { order: 3; flex-basis: 100%; }.demo-banner button { margin-left: auto; } }
`);
await mkdir(join(output, 'preview/assets'), { recursive: true });
const assets = {
  'bootstrap-icons.css': 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
  'fonts/bootstrap-icons.woff2': 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/fonts/bootstrap-icons.woff2',
  'fonts/bootstrap-icons.woff': 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/fonts/bootstrap-icons.woff',
  'animate.min.css': 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
  'jspdf.umd.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'jspdf.plugin.autotable.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'
};
for (const [name, url] of Object.entries(assets)) {
  const target = join(output, 'preview/assets', name);
  await mkdir(dirname(target), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not retrieve preview asset: ${name}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}
// Fail closed if any generated source still mentions the real Firebase project or SDK.
for (const name of ['script.js', 'index.html', 'preview/demo-firebase.js']) {
  if (/proteja-5d929|firebaseio\.com|gstatic\.com\/firebasejs|AIza/.test(await readFile(join(output, name), 'utf8'))) throw new Error('Unsafe preview: production Firebase reference detected.');
}
await writeFile(join(output, 'vercel.json'), JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] }, null, 2));
console.log(`Isolated preview generated at ${output}`);
