import { prepareImport, classifyPlans, STATUS } from './import-core.js';

export function setupImport({ getUser, getExisting, getPermission, createCase }) {
  const $ = id => document.getElementById(id);
  const dialog = $('import-dialog');
  const file = $('import-file');
  let plans = [], unmatched = [], owner = null, generation = 0, worker = null, timer = null;
  let busy = false, stop = false, report = [], previewed = false;
  let existingPreview = [];
  const status = message => { $('import-status').textContent = message; };
  function finishWorker() { worker?.terminate(); worker = null; clearTimeout(timer); }
  function reset() {
    generation++; finishWorker(); stop = true; plans = []; unmatched = []; report = []; owner = null; previewed = false; existingPreview = [];
    file.value = ''; $('import-rows').replaceChildren(); $('import-summary').textContent = '';
    $('import-confirm').checked = false; $('import-save').disabled = true; $('import-report').disabled = true;
    dialog.close();
  }
  function setBusy(value) {
    busy = value; file.disabled = value; $('import-confirm').disabled = value;
    $('import-close').textContent = value ? 'Parar após o registro atual' : 'Fechar';
  }
  function render() {
    const classified = classifyPlans(plans, existingPreview);
    plans = classified;
    const ready = classified.filter(p => p.state === 'ready').length;
    const existing = classified.filter(p => p.state === 'existing').length;
    const invalid = classified.filter(p => p.state === 'invalid').length;
    $('import-summary').textContent = `${ready} prontos · ${existing} já existentes · ${invalid} para corrigir · ${unmatched.length} históricos sem vínculo`;
    $('import-save').disabled = busy || !ready || !$('import-confirm').checked || !previewed;
    $('import-report').disabled = !plans.length && !report.length && !unmatched.length;
    $('import-rows').replaceChildren();
    for (const plan of classified) {
      const tr = document.createElement('tr');
      const source = document.createElement('td'); source.textContent = `${plan.sheet} / ${plan.row}`;
      const id = document.createElement('input'); id.type = 'text'; id.value = plan.data.numeroProntuario; id.maxLength = 100;
      id.setAttribute('aria-label', `Prontuário da linha ${plan.row} da aba ${plan.sheet}`);
      const date = document.createElement('input'); date.type = 'date'; date.value = plan.data.dataEntrada;
      date.setAttribute('aria-label', `Data de entrada da linha ${plan.row} da aba ${plan.sheet}`);
      const select = document.createElement('select'); select.setAttribute('aria-label', `Situação da linha ${plan.row} da aba ${plan.sheet}`);
      select.add(new Option('Sem situação informada', ''));
      for (const [value, label] of Object.entries(STATUS)) select.add(new Option(label, value));
      if (plan.data.situacaoAtual === '__revisar__') select.add(new Option('Selecione uma situação válida', '__revisar__'));
      select.value = plan.data.situacaoAtual || '';
      const message = document.createElement('td');
      message.textContent = plan.state === 'existing' ? 'Já existe: será ignorado, sem alterações.' : plan.errors.join(' ') || 'Pronto para importar';
      message.className = plan.state === 'invalid' ? 'import-error' : '';
      for (const [input, key] of [[id, 'numeroProntuario'], [date, 'dataEntrada'], [select, 'situacaoAtual']]) {
        input.disabled = busy || plan.state === 'existing'; input.className = 'form-control';
        input.addEventListener('change', () => {
          plan.data[key] = input.value;
          if (key === 'situacaoAtual' && !input.value) delete plan.data[key];
          $('import-confirm').checked = false; render();
        });
        const td = document.createElement('td'); td.append(input); tr.append(td);
      }
      tr.prepend(source); tr.append(message); $('import-rows').append(tr);
    }
  }
  $('btnImport').addEventListener('click', () => {
    if (busy) return;
    reset(); owner = getUser()?.uid;
    if (!owner) return;
    stop = false; status('Selecione a planilha otimizada. Nada será gravado antes da confirmação.'); dialog.showModal();
  });
  $('import-close').addEventListener('click', () => {
    if (busy) { stop = true; status('Aguardando o registro atual. Os já concluídos serão mantidos.'); }
    else reset();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (busy) { stop = true; status('Aguardando o registro atual para parar.'); } else reset();
  });
  $('import-confirm').addEventListener('change', () => render());
  file.addEventListener('change', async () => {
    const selected = file.files[0];
    finishWorker(); const request = ++generation;
    plans = []; unmatched = []; report = []; previewed = false; $('import-confirm').checked = false; render();
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name) || selected.size > 15 * 1024 * 1024) { status('Escolha um arquivo .xlsx de até 15 MB.'); return; }
    status('Lendo a planilha no seu navegador...');
    try {
      const buffer = await selected.arrayBuffer();
      if (request !== generation || getUser()?.uid !== owner) return;
      worker = new Worker(new URL('./import-worker.js', import.meta.url));
      timer = setTimeout(() => { finishWorker(); status('A leitura demorou demais. Confira o arquivo e tente novamente.'); }, 45000);
      worker.onerror = () => { finishWorker(); status('Não foi possível carregar o leitor. Recarregue a página e tente novamente.'); };
      worker.onmessage = async ({ data }) => {
        finishWorker();
        try {
          if (request !== generation || getUser()?.uid !== owner) return;
          if (data.error) throw new Error(data.error);
          const prepared = prepareImport(data);
          const permission = await getPermission(owner);
          if (request !== generation || getUser()?.uid !== owner) return;
          if (!permission) throw new Error('Sua conta precisa de active e canWrite para importar.');
          const existing = await getExisting();
          if (request !== generation || getUser()?.uid !== owner) return;
          plans = classifyPlans(prepared.plans, existing); unmatched = prepared.unmatchedHistory; previewed = true;
          status('Confira os prontuários, datas e situações. Colunas originais e históricos vinculados serão preservados nos detalhes do caso. Corrija as pendências ou importe somente os prontos.');
          renderWithExisting(existing);
        } catch (error) { if (request === generation) status(error.message || 'Não foi possível preparar a importação. Verifique seu acesso e a conexão.'); }
      };
      worker.postMessage(buffer, [buffer]);
    } catch { if (request === generation) status('Não foi possível abrir o arquivo.'); }
  });
  function renderWithExisting(existing) {
    existingPreview = existing;
    render();
  }
  $('import-save').addEventListener('click', async () => {
    if (busy || !previewed || !$('import-confirm').checked || getUser()?.uid !== owner) return;
    const request = generation;
    setBusy(true); stop = false; report = []; $('import-save').disabled = true;
    try {
      if (!await getPermission(owner)) throw new Error('Sua conta não tem permissão para importar.');
      const existing = await getExisting();
      if (request !== generation || getUser()?.uid !== owner) return;
      existingPreview = existing;
      plans = classifyPlans(plans, existing);
      const pending = plans.filter(p => p.state === 'ready');
      render();
      let completed = 0;
      for (const plan of pending) {
        if (stop || request !== generation || getUser()?.uid !== owner) break;
        status(`Importando ${completed + 1} de ${pending.length}. Não feche a página. Se a conexão cair, aguarde ou retome depois.`);
        const result = await createCase(plan.data, owner);
        if (request !== generation || getUser()?.uid !== owner) return;
        report.push({ sheet: plan.sheet, row: plan.row, message: result ? 'Importado' : 'Já existe: ignorado' });
        existingPreview.push(plan.data);
        plan.state = 'existing'; completed++;
      }
      if (request === generation) {
        status(`${completed} registros processados. ${stop ? 'Importação interrompida; você pode selecionar o arquivo novamente para retomar.' : 'Baixe o relatório para conferir os resultados e pendências.'}`);
        $('import-confirm').checked = false;
      }
    } catch {
      if (request === generation) status('Importação interrompida por falta de acesso ou falha de conexão. Os registros confirmados foram mantidos. Baixe o relatório e selecione o arquivo novamente para retomar.');
    } finally {
      setBusy(false);
      if (request === generation) render();
    }
  });
  $('import-report').addEventListener('click', () => {
    const completed = new Set(report.map(r => `${r.sheet}:${r.row}`));
    const all = [...report, ...plans.filter(p => !completed.has(`${p.sheet}:${p.row}`)).map(p => ({ sheet: p.sheet, row: p.row, message: p.errors.join(' ') || (p.state === 'existing' ? 'Já existe: ignorado' : 'Não importado') })), ...unmatched];
    const escape = value => `"${String(value).replace(/"/g, '""')}"`;
    // Only source row and outcome: no names, CPF or clinical content in the report.
    const csv = '\ufeff' + [['Aba', 'Linha', 'Resultado'], ...all.map(r => [r.sheet, r.row, r.message])].map(r => r.map(escape).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'relatorio-importacao.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { reset };
}

export function appendImportedDetails(container, data) {
  for (const [key, title] of [['dadosPlanilha', 'Colunas originais da planilha'], ['historicoPlanilha', 'Histórico importado']]) {
    if (!data[key]) continue;
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = title;
    const list = document.createElement('dl'); list.className = 'import-original';
    try {
      const parsed = JSON.parse(data[key]);
      for (const record of Array.isArray(parsed) ? parsed : [parsed]) {
        for (const [label, value] of Object.entries(record)) {
          if (value === '') continue;
          const dt = document.createElement('dt'); dt.textContent = label;
          const dd = document.createElement('dd'); dd.textContent = String(value); list.append(dt, dd);
        }
        list.append(document.createElement('hr'));
      }
    } catch { const text = document.createElement('dd'); text.textContent = data[key]; list.append(text); }
    details.append(summary, list); container.append(details);
  }
}
