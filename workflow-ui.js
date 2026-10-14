import { APPOINTMENT_STATUS, TASK_STATUS, APPOINTMENT_TYPES, TASK_TYPES, PREFIX, todayISO, strictDate, collectActivities, filterActivities, isLate, buildActivity } from './workflow-core.js';

const PAGE_SIZE = 10;
const textNode = (tag, text, className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
const displayDate = date => strictDate(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : 'Sem prazo';
export function setupWorkflows({ getCases, getUser, canWrite, saveActivity, openCase, notify, navigate }) {
  const $ = id => document.getElementById(id);
  const states = { agenda: { page: 1 }, tarefas: { page: 1 } };
  let writeEnabled = false, draft = null, busy = false, generation = 0;
  for (const kind of ['agenda', 'tarefas']) {
    const isAgenda = kind === 'agenda';
    const statuses = isAgenda ? APPOINTMENT_STATUS : TASK_STATUS;
    $(kind === 'agenda' ? 'agenda-section' : 'tasks-section').innerHTML = `
      <div class="workflow-heading"><div><h3>${isAgenda ? 'Quem vamos atender?' : 'O que precisamos resolver?'}</h3><p>${isAgenda ? 'Registre cada atendimento com data, horário e técnico. Datas passadas não são marcadas como falta automaticamente.' : 'Organize responsáveis, prazos e retornos. Prazos vencidos aparecem como atrasados enquanto a pendência estiver aberta.'}</p></div><button id="${kind}-new" class="btn btn-primary" type="button">${isAgenda ? 'Adicionar atendimento' : 'Adicionar pendência'}</button></div>
      <p id="${kind}-access" class="text-muted" role="status"></p>
      <div class="workflow-summary" id="${kind}-summary" aria-label="Resumo da seleção"></div>
      <section class="card-panel workflow-search" aria-labelledby="${kind}-search-title"><h4 id="${kind}-search-title">${isAgenda ? 'Buscar atendimentos registrados' : 'Buscar pendências registradas'}</h4><p class="workflow-help">Estes campos servem apenas para buscar. Para cadastrar ${isAgenda ? 'uma data e um relato, clique em “Adicionar atendimento” acima' : 'uma pendência, clique em “Adicionar pendência” acima'}.</p><div class="workflow-filters">
        <label>Buscar por prontuário<select id="${kind}-case" class="form-select"><option value="">Todos os prontuários</option></select></label>
        <label>Ou digitar o nº do prontuário<input id="${kind}-numero" class="form-control" type="search" placeholder="Número exato: 05 encontra 5" /></label>
        <label>${isAgenda ? 'Técnico' : 'Responsável'}<input id="${kind}-owner" class="form-control" type="search" placeholder="Buscar responsável" /></label>
        <label>Situação<select id="${kind}-status" class="form-select"><option value="">Todas as situações</option>${Object.entries(statuses).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
        <label>Período ${isAgenda ? '(data prevista)' : '(prazo)'}<select id="${kind}-period" class="form-select"><option value="">Todos os períodos</option><option value="hoje">Hoje</option><option value="semana">Hoje e próximos 6 dias</option><option value="atrasados">${isAgenda ? 'Data passada: conferir' : 'Atrasadas'}</option>${isAgenda ? '' : '<option value="sem_prazo">Sem prazo</option>'}</select></label>
        <label>${isAgenda ? 'Data agendada a partir de' : 'Prazo a partir de'}<input id="${kind}-from" class="form-control" type="date" /></label>
        <label>${isAgenda ? 'Data agendada até' : 'Prazo até'}<input id="${kind}-until" class="form-control" type="date" /></label>
        <button id="${kind}-clear" class="btn btn-outline-secondary" type="button">Limpar filtros</button>
      </div><p class="workflow-help">Preencha uma ou ambas as datas para limitar a busca ao intervalo desejado. ${isAgenda ? 'Essas datas não criam nem alteram atendimentos.' : 'Essas datas não alteram os prazos cadastrados.'}</p></section>
      <p id="${kind}-notice" role="status" class="workflow-notice"></p>
      <div class="card-panel workflow-table-wrap"><table class="table align-middle workflow-table"><thead><tr><th>Prontuário</th><th>${isAgenda ? 'Data e hora previstas' : 'Pendência'}</th><th>Responsável</th><th>${isAgenda ? 'Tipo' : 'Prazo'}</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="${kind}-rows"></tbody></table><p id="${kind}-empty" class="workflow-empty"></p><nav id="${kind}-pagination" aria-label="Páginas da ${isAgenda ? 'agenda' : 'lista de pendências'}"></nav></div>
      <details class="card-panel workflow-legacy"><summary>Histórico e anotações anteriores do prontuário</summary><p>Selecione um prontuário acima para consultar o texto anterior. Ele não é convertido automaticamente em datas, tarefas ou faltas.</p><div id="${kind}-legacy"></div></details>`;
    const ids = ['case', 'numero', 'owner', 'status', 'period', 'from', 'until'];
    for (const suffix of ids) $(`${kind}-${suffix}`).addEventListener('input', () => { states[kind].page = 1; renderKind(kind); });
    $(`${kind}-clear`).addEventListener('click', () => { ids.forEach(suffix => { $(`${kind}-${suffix}`).value = ''; }); states[kind].page = 1; renderKind(kind); });
    $(`${kind}-new`).addEventListener('click', () => openEditor(kind));
  }
  const dialog = document.createElement('dialog'); dialog.id = 'workflow-dialog'; dialog.className = 'workflow-dialog'; dialog.setAttribute('aria-labelledby', 'workflow-title');
  dialog.innerHTML = `<form id="workflow-form"><h3 id="workflow-title"></h3><p id="workflow-editor-hint" class="text-muted"></p><fieldset id="workflow-editor-fields" class="workflow-editor-fields">
    <label>Prontuário<select id="workflow-case" class="form-select" required></select></label>
    <label>Responsável<input id="workflow-owner" class="form-control" maxlength="120" required autocomplete="off" /></label>
    <label id="workflow-description-label">Pendência<input id="workflow-description" class="form-control" maxlength="240" /></label>
    <label id="workflow-date-label"><span id="workflow-date-title">Data prevista</span><input id="workflow-date" class="form-control" type="date" /></label>
    <label id="workflow-time-label">Horário (opcional)<input id="workflow-time" class="form-control" type="time" /></label>
    <label>Tipo<select id="workflow-type" class="form-select" required></select></label>
    <label>Situação<select id="workflow-status" class="form-select" required></select></label>
    <label id="workflow-priority-label">Prioridade<select id="workflow-priority" class="form-select"><option value="normal">Normal</option><option value="alta">Alta</option></select></label>
    <label id="workflow-completed-label" hidden><span id="workflow-completed-title"></span><input id="workflow-completed" class="form-control" type="date" /></label>
    <label class="workflow-wide workflow-notes-field"><span id="workflow-notes-title">Descrição / relato do atendimento</span><small id="workflow-notes-help">Escreva o objetivo do atendimento ou o que foi realizado na data escolhida.</small><textarea id="workflow-notes" aria-describedby="workflow-notes-help" class="form-control" rows="4" maxlength="4000" placeholder="Descreva aqui o atendimento... (opcional)"></textarea></label>
    </fieldset><p id="workflow-error" role="status" aria-live="polite"></p><div class="workflow-editor-footer"><button id="workflow-cancel" type="button" class="btn btn-outline-secondary">Cancelar</button><button id="workflow-save" type="submit" class="btn btn-primary">Salvar</button></div></form>`;
  document.body.append(dialog);
  const form = $('workflow-form');
  function caseOptions(select, selected, includeAll = true) {
    const collator = new Intl.Collator('pt-BR', { numeric: true });
    const records = [...getCases()].sort((a,b)=>collator.compare(String(a.data.numeroProntuario),String(b.data.numeroProntuario)));
    select.replaceChildren(new Option(includeAll ? 'Todos os prontuários' : 'Selecione um prontuário', ''), ...records.map(({ key, data })=>new Option(`${data.numeroProntuario}${data.nomeCriad ? ' — '+data.nomeCriad : ''}`,key)));
    select.value = records.some(c=>c.key===selected) ? selected : '';
  }
  function filters(kind) {
    return { caseKey: $(`${kind}-case`).value, numero: $(`${kind}-numero`).value.trim(), responsavel: $(`${kind}-owner`).value,
      situacao: $(`${kind}-status`).value, periodo: $(`${kind}-period`).value, de: $(`${kind}-from`).value, ate: $(`${kind}-until`).value };
  }
  function renderKind(kind) {
    const isAgenda = kind === 'agenda', statuses = isAgenda ? APPOINTMENT_STATUS : TASK_STATUS;
    const selection = $(`${kind}-case`).value;
    caseOptions($(`${kind}-case`), selection);
    const f = filters(kind), today = todayISO();
    const { items, invalid } = collectActivities(getCases(), kind);
    const backwards = f.de && f.ate && f.de > f.ate;
    const filtered = backwards ? [] : filterActivities(items, kind, f, today);
    const summary = isAgenda ? [
      ['Na seleção',filtered.length],['Agendados',filtered.filter(i=>i.activity.situacao==='agendado').length],['Realizados',filtered.filter(i=>i.activity.situacao==='realizado').length]
    ] : [['Em aberto',filtered.filter(i=>['aberta','em_andamento'].includes(i.activity.situacao)).length],['Atrasadas',filtered.filter(i=>isLate(kind,i.activity,today)).length],['Concluídas',filtered.filter(i=>i.activity.situacao==='concluida').length]];
    $(`${kind}-summary`).replaceChildren(...summary.map(([label,count])=>{ const card=document.createElement('article'); card.append(textNode('span',label),textNode('strong',count)); return card; }));
    $(`${kind}-notice`).textContent = backwards ? 'A data inicial precisa ser anterior ou igual à final.' : invalid ? `${invalid} registro(s) incompatível(is) foram preservados, mas não podem ser exibidos como itens estruturados.` : '';
    const pages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE)); states[kind].page=Math.min(states[kind].page,pages);
    const body=$(`${kind}-rows`); body.replaceChildren();
    for (const item of filtered.slice((states[kind].page-1)*PAGE_SIZE,states[kind].page*PAGE_SIZE)) {
      const data=item.activity, row=document.createElement('tr');
      const caseCell=document.createElement('td'), link=textNode('button',item.caseData.numeroProntuario,'workflow-case-link'); link.type='button';
      link.addEventListener('click',()=>openCase(item.caseKey)); caseCell.append(link);
      if(item.caseData.nomeCriad) caseCell.append(textNode('small',item.caseData.nomeCriad));
      const main=textNode('td',isAgenda ? `${displayDate(data.data)}${data.hora ? ' às '+data.hora : ''}` : data.descricao);
      if (!isAgenda && data.prioridade==='alta') main.append(textNode('small','Prioridade alta','workflow-warning'));
      const deadline=textNode('td',isAgenda ? data.tipo : displayDate(data.prazo));
      if(isLate(kind,data,today)) (isAgenda?main:deadline).append(textNode('small',isAgenda?'Data passada: conferir':'Prazo vencido','workflow-warning'));
      const state=textNode('td',statuses[data.situacao]);
      if(data.dataConclusao) state.append(textNode('small',`${isAgenda?'Realizado':'Concluída'} em ${displayDate(data.dataConclusao)}`));
      const actions=document.createElement('td'), edit=textNode('button','Editar / registrar resultado','btn btn-sm btn-outline-primary'); edit.type='button'; edit.disabled=!writeEnabled;
      edit.addEventListener('click',()=>openEditor(kind,item)); actions.append(edit);
      const notes=document.createElement('details'); notes.append(textNode('summary','Observações'),textNode('p',data.observacao||'Sem observações.')); actions.append(notes);
      row.append(caseCell,main,textNode('td',data.responsavel),deadline,state,actions); body.append(row);
    }
    $(`${kind}-empty`).hidden=filtered.length>0;
    $(`${kind}-empty`).textContent = items.length ? 'Nenhum item corresponde aos filtros.' : isAgenda ? 'Nenhum atendimento estruturado registrado. Adicione um atendimento ou consulte o histórico anterior do prontuário.' : 'Nenhuma pendência estruturada registrada. Adicione uma pendência ou consulte as anotações anteriores do prontuário.';
    const pagination=$(`${kind}-pagination`); pagination.replaceChildren();
    if(pages>1) {
      const prev=textNode('button','Anterior','btn btn-outline-secondary btn-sm'), next=textNode('button','Próxima','btn btn-outline-secondary btn-sm'); prev.type=next.type='button';
      prev.disabled=states[kind].page===1; next.disabled=states[kind].page===pages;
      prev.addEventListener('click',()=>{states[kind].page--;renderKind(kind);}); next.addEventListener('click',()=>{states[kind].page++;renderKind(kind);});
      pagination.append(prev,textNode('span',`Página ${states[kind].page} de ${pages}`),next);
    }
    $(`${kind}-new`).disabled=!writeEnabled || !getCases().length;
    $(`${kind}-access`).textContent = writeEnabled ? 'Registros vinculados ao prontuário. A referência de hoje segue o horário da Bahia.' : 'Consulta disponível. Para registrar ou editar, sua conta precisa de permissão de escrita.';
    const legacy=$(`${kind}-legacy`); legacy.replaceChildren();
    const record=getCases().find(c=>c.key===f.caseKey);
    if(record) {
      const fields=isAgenda ? [['Datas e relatos anteriores',record.data.datasTexto],['Técnicos informados anteriormente',record.data.tecnicosReferencia]] : [['Outras pendências anteriores',record.data.outrasPendencias],['Retorno solicitado (registro anterior)',record.data.retornoSolicitado],['Informações anteriores sobre retorno',record.data.infoRetorno]];
      for(const [label,value] of fields) if(value) { legacy.append(textNode('strong',label),textNode('p',value,'workflow-preserved')); }
      if(!legacy.childNodes.length) legacy.append(textNode('p','Sem anotações anteriores neste prontuário.'));
      const add=textNode('button',isAgenda?'Registrar atendimento deste prontuário':'Registrar pendência deste prontuário','btn btn-outline-primary'); add.type='button';add.disabled=!writeEnabled;
      add.addEventListener('click',()=>openEditor(kind,null,record.key));legacy.append(add);
    }
  }
  function updateCompletion() {
    if(!draft) return;
    const done=$('workflow-status').value===(draft.kind==='agenda'?'realizado':'concluida');
    $('workflow-completed-label').hidden=!done; $('workflow-completed').required=done;
    $('workflow-completed-title').textContent=draft.kind==='agenda'?'Data real de realização':'Data real de conclusão';
  }
  $('workflow-status').addEventListener('change',updateCompletion);
  function values() {
    return draft.kind==='agenda' ? { data:$('workflow-date').value,hora:$('workflow-time').value,responsavel:$('workflow-owner').value,tipo:$('workflow-type').value,situacao:$('workflow-status').value,dataConclusao:$('workflow-completed').value,observacao:$('workflow-notes').value }
      : { descricao:$('workflow-description').value,prazo:$('workflow-date').value,responsavel:$('workflow-owner').value,tipo:$('workflow-type').value,situacao:$('workflow-status').value,prioridade:$('workflow-priority').value,dataConclusao:$('workflow-completed').value,observacao:$('workflow-notes').value };
  }
  function snapshot() { return JSON.stringify({caseKey:$('workflow-case').value,values:values()}); }
  function closeEditor(force=false) {
    if(busy && !force) return;
    if(!force && draft && snapshot()!==draft.initial && !window.confirm('Descartar as alterações que ainda não foram salvas?')) return;
    dialog.close(); form.reset(); draft=null; $('workflow-error').textContent='';
  }
  $('workflow-cancel').addEventListener('click',()=>closeEditor());
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  function openEditor(kind,item=null,caseKey='') {
    if(!writeEnabled || !getUser()) { notify('Sua conta precisa de permissão de escrita.','warning');return; }
    if(!getCases().length) { notify('Cadastre um prontuário antes de registrar este item.','warning');return; }
    generation++; form.reset(); $('workflow-editor-fields').disabled=false; $('workflow-case').disabled=false;
    const isAgenda=kind==='agenda', data=item?.activity||{};
    draft={kind,item,uid:getUser().uid,field:item?.field||PREFIX[kind]+crypto.randomUUID()};
    $('workflow-title').textContent=(item?'Editar ':'Adicionar ')+(isAgenda?'atendimento':'pendência');
    $('workflow-editor-hint').textContent=isAgenda ? '1. Escolha o prontuário e o técnico. 2. Informe a data e a situação. 3. Escreva o relato abaixo e salve. Para um atendimento já realizado, selecione “Realizado” e informe também a data real.' : 'Escolha o prontuário, descreva o que precisa ser resolvido e informe o responsável. O prazo é opcional.';
    $('workflow-notes-title').textContent=isAgenda?'Descrição / relato do atendimento':'Observações da pendência';
    $('workflow-notes-help').textContent=isAgenda?'Escreva o objetivo do atendimento ou o que foi realizado na data escolhida.':'Acrescente informações que ajudem a resolver esta pendência.';
    $('workflow-notes').placeholder=isAgenda?'Descreva aqui o atendimento... (opcional)':'Acrescente informações sobre a pendência... (opcional)';
    caseOptions($('workflow-case'),item?.caseKey||caseKey||$(`${kind}-case`).value,false); $('workflow-case').disabled=Boolean(item);
    $('workflow-owner').value=data.responsavel||''; $('workflow-description').value=data.descricao||'';
    $('workflow-date-title').textContent=isAgenda?'Data prevista do atendimento':'Prazo (opcional)';
    $('workflow-date').value=(isAgenda?data.data:data.prazo)||''; $('workflow-date').required=isAgenda;
    $('workflow-time').value=data.hora||''; $('workflow-notes').value=data.observacao||'';
    $('workflow-completed').value=data.dataConclusao||''; $('workflow-priority').value=data.prioridade||'normal';
    $('workflow-description-label').hidden=isAgenda; $('workflow-description').required=!isAgenda;
    $('workflow-time-label').hidden=!isAgenda; $('workflow-priority-label').hidden=isAgenda;
    const types=isAgenda?APPOINTMENT_TYPES:TASK_TYPES, statuses=isAgenda?APPOINTMENT_STATUS:TASK_STATUS;
    $('workflow-type').replaceChildren(...types.map(label=>new Option(label,label))); $('workflow-type').value=data.tipo||types[0];
    $('workflow-status').replaceChildren(...Object.entries(statuses).map(([value,label])=>new Option(label,value))); $('workflow-status').value=data.situacao||(isAgenda?'agendado':'aberta');
    $('workflow-error').textContent=''; updateCompletion(); draft.initial=snapshot(); dialog.showModal();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(busy||!draft||!getUser()||getUser().uid!==draft.uid) return;
    if(!form.reportValidity()) return;
    const token=generation, current=draft, caseKey=$('workflow-case').value;
    let slowSave = null;
    if(!getCases().some(c=>c.key===caseKey)) { $('workflow-error').textContent='Selecione um prontuário existente.';return; }
    try {
      const value=buildActivity(current.kind,values(),current.item?.activity,current.uid);
      busy=true; $('workflow-editor-fields').disabled=true; $('workflow-save').disabled=true; $('workflow-cancel').disabled=true;
      $('workflow-error').textContent='Salvando. Aguarde a confirmação do servidor.';
      slowSave = window.setTimeout(() => { if(token===generation && busy && getUser()?.uid===current.uid) $('workflow-error').textContent='O servidor ainda não confirmou. Confira a conexão e mantenha esta página aberta para acompanhar o resultado.'; }, 8000);
      const allowed = await canWrite(current.uid);
      if(token!==generation||getUser()?.uid!==current.uid) return;
      if(!allowed) { writeEnabled=false; render(); throw new Error('Sua conta não tem permissão de escrita.'); }
      const committed=await saveActivity({caseKey,field:current.field,value,expected:current.item?.original??null,uid:current.uid});
      if(token!==generation||getUser()?.uid!==current.uid) return;
      if(!committed) throw new Error('Este item mudou desde que foi aberto. Feche e reabra para conferir a versão atual antes de salvar.');
      busy=false; closeEditor(true); notify('Registro salvo.','success'); render();
    } catch(error) {
      if(token===generation&&getUser()?.uid===current.uid) $('workflow-error').textContent=error.code ? 'Não foi possível salvar. Confira a conexão, a autorização e os dados do prontuário.' : error.message;
    } finally {
      window.clearTimeout(slowSave);
      if(token===generation) { busy=false; $('workflow-editor-fields').disabled=false; $('workflow-case').disabled=Boolean(draft?.item); $('workflow-save').disabled=!writeEnabled; $('workflow-cancel').disabled=false; }
    }
  });
  function render() { for(const kind of ['agenda','tarefas']) renderKind(kind); }
  function reset() {
    generation++;busy=false;writeEnabled=false;closeEditor(true);form.reset();$('workflow-case').replaceChildren();
    for(const kind of ['agenda','tarefas']) {
      states[kind].page=1;
      for(const suffix of ['case','numero','owner','status','period','from','until']) $(`${kind}-${suffix}`).value='';
    }
    $('workflow-editor-fields').disabled=false;$('workflow-save').disabled=false;$('workflow-cancel').disabled=false;render();
  }
  return { render, reset, setCanWrite(value) {writeEnabled=Boolean(value);render();},
    openScope(kind,caseKey) { if(navigate(kind==='agenda'?'agenda':'tasks')===false) return; $(`${kind}-case`).value=caseKey;states[kind].page=1;renderKind(kind); },
    openCreate(kind,caseKey) { if(navigate(kind==='agenda'?'agenda':'tasks')===false) return; $(`${kind}-case`).value=caseKey;states[kind].page=1;renderKind(kind);openEditor(kind,null,caseKey); } };
}
