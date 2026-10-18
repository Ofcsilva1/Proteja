import { setupFormFeedback } from './form-feedback.js?v=20261015.3';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { caseKey, hasDuplicate, caseReplacement } from "./case-save.js?v=20261015.3";
import { permissionsForAccess } from "./permissions.js?v=20261015.3";
import { setupExports } from "./exports.js?v=20261015.3";
import { setupImport, appendImportedDetails } from "./import-ui.js?v=20261015.3";
import { readableSnapshot } from "./import-core.js?v=20261015.3";
import { matchesGeneralSearch, sortCases, availableYears, matchesEntryPeriod } from "./case-list.js?v=20261015.3";
import { resolveViolenceData, matchesViolence, violenceOptions } from "./violence.js?v=20261015.3";
import { setupViolenceForm } from "./violence-form.js?v=20261015.3";
import { setupWorkflows } from "./workflow-ui.js?v=20261015.3";
import { replacementFor, activityText, attendanceSummary } from "./workflow-core.js?v=20261015.3";
import { getDatabase, ref, onValue, get, runTransaction } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";
import { getAuth, setPersistence, inMemoryPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNQqq67cuuDetOJZR2EcCkH4JNXOxNW3Y",
  authDomain: "proteja-5d929.firebaseapp.com",
  databaseURL: "https://proteja-5d929-default-rtdb.firebaseio.com",
  projectId: "proteja-5d929",
  storageBucket: "proteja-5d929.appspot.com",
  messagingSenderId: "324500080799",
  appId: "1:324500080799:web:f4c52904de0cd6f7e0baaa",
  measurementId: "G-K7BJHJ8DYG"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const PAGE_SIZE = 10;
let permissions = permissionsForAccess(null);

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const authWrapper = $("auth-wrapper");
  const appWrapper = $("app-wrapper");
  const loginButton = $("btnLogin");
  const authStatus = $("auth-status");
  let authReady = false;
  let signingIn = false;
  const caseForm = $("case-form");
  const violenceForm = setupViolenceForm();
  const caseFeedback = setupFormFeedback(caseForm, control => {
    const pane = control.closest('.tab-pane');
    if (pane) {
      const tab = document.querySelector(`[data-bs-target="#${pane.id}"]`);
      if (tab) {
        window.bootstrap?.Tab.getOrCreateInstance(tab).show();
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    }
  });
  const filterIds = ["filtroBusca", "filtroMes", "filtroAno", "filtroSituacao", "filtroViolencia", "filtroViolenciaSexual"];
  const caseTableBody = document.querySelector("#case-table tbody");
  const statusLabels = {
    ativo: "Ativo", suspenso: "Suspenso", encerrado_com_protecao: "Encerrado com proteção",
    encerrado_sem_protecao: "Encerrado sem proteção", nao_competencia: "Não é competência"
  };
  let cases = [];
  let page = 1;
  let editingKey = null;
  let editingBase = null;
  let savingCase = false;
  let unsubscribeCases = null;
  let caseDraft = null;
  let authEpoch = 0;
  const caseSnapshot = () => JSON.stringify([...caseForm.querySelectorAll('input,select,textarea')].map(input => [input.id, input.value, input.checked]));
  const caseHasChanges = () => !$("form-section").hidden && Boolean(caseDraft) && caseSnapshot() !== caseDraft;
  const warnBeforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
  let unloadGuard = false;
  function refreshUnloadGuard() {
    const pending = savingCase || caseHasChanges() || workflows.hasPendingChanges();
    if (pending === unloadGuard) return;
    unloadGuard = pending;
    window[pending ? 'addEventListener' : 'removeEventListener']('beforeunload', warnBeforeUnload);
  }
  document.addEventListener('input', refreshUnloadGuard);
  document.addEventListener('change', refreshUnloadGuard);
  function canLeaveCase() {
    if (savingCase) return false;
    return $("form-section").hidden || !caseDraft || caseSnapshot() === caseDraft || window.confirm("Sair sem salvar as alterações do prontuário?");
  }

  function notify(message, type = "info") {
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} shadow-sm notification`;
    alert.setAttribute("role", "status");
    alert.textContent = message;
    $("notification-container").append(alert);
    window.setTimeout(() => alert.remove(), 4500);
  }

  function setBusy(button, busy, label = "Salvando...") {
    if (busy) {
      button.dataset.originalLabel = button.innerHTML;
      button.disabled = true;
      button.textContent = label;
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }

  function firebaseMessage(error) {
    const messages = {
      "auth/email-already-in-use": "Este e-mail já está cadastrado.",
      "auth/invalid-email": "Informe um e-mail válido.",
      "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/user-not-found": "E-mail ou senha incorretos.",
      "auth/wrong-password": "E-mail ou senha incorretos.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
      "auth/network-request-failed": "Sem conexão. Confira sua internet e tente novamente.",
      "PERMISSION_DENIED": "Seu usuário não tem permissão para acessar estes registros."
    };
    return messages[error?.code] || "Não foi possível concluir a operação. Tente novamente.";
  }

  function toggleView(view, force = false) {
    if (!force && !canLeaveCase()) return false;
    for (const [name, nav, section] of [["list","nav-list","list-section"],["form","nav-new","form-section"],["agenda","nav-agenda","agenda-section"],["tasks","nav-tasks","tasks-section"]]) {
      $(nav).classList.toggle("active", view === name); $(section).hidden = view !== name;
    }
    const titles = { list: ["Controle geral de casos","Acompanhe os prontuários e os indicadores da seleção."], form: [editingKey ? "Editar caso" : "Registrar novo caso","Registre as informações do caso nas etapas abaixo."], agenda: ["Agenda e atendimentos","Quem vamos atender? Consulte datas, técnicos e resultados."], tasks: ["Pendências e retornos","O que precisamos resolver? Acompanhe responsáveis e prazos."] };
    $("page-title").textContent = titles[view][0]; $("page-subtitle").textContent = titles[view][1];
    if (view === 'agenda' || view === 'tasks') workflows.render();
    refreshUnloadGuard();
    if (view !== "list") window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  function startNewCase() {
    if (!permissions.canWriteCases) { notify("Seu perfil permite apenas consultar os casos.", "warning"); return; }
    if (!canLeaveCase()) return;
    editingKey = null;
    editingBase = null;
    $("case-save-status").textContent = "";
    $("numero-prontuario").readOnly = false;
    $("numero-prontuario").title = "";
    caseForm.reset();
    violenceForm.fill({});
    $("btnCaseAgenda").disabled = $("btnCaseTasks").disabled = true;
    $("form-tabs").querySelector('[data-bs-target="#tab1"]')?.click();
    caseDraft = caseSnapshot(); toggleView("form", true);
    $("numero-prontuario").focus();
  }

  $("nav-list").addEventListener("click", (event) => { event.preventDefault(); toggleView("list"); });
  $("nav-new").addEventListener("click", (event) => { event.preventDefault(); startNewCase(); });
  $("nav-agenda").addEventListener("click", event => { event.preventDefault(); toggleView("agenda"); });
  $("nav-tasks").addEventListener("click", event => { event.preventDefault(); toggleView("tasks"); });
  $("btnCaseAgenda").addEventListener("click", () => { if (editingKey) workflows.openCreate("agenda", editingKey); });
  $("btnCaseTasks").addEventListener("click", () => { if (editingKey) workflows.openCreate("tarefas", editingKey); });
  $("btnEmptyNew").addEventListener("click", startNewCase);
  $("btnCancelarForm").addEventListener("click", () => toggleView("list"));
  $("show-password").addEventListener("change", (event) => { $("password").type = event.target.checked ? "text" : "password"; });

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authReady || signingIn) return;
    signingIn = true;
    const button = event.currentTarget.querySelector('[type="submit"]');
    setBusy(button, true, "Acessando...");
    authStatus.textContent = "Verificando suas credenciais...";
    const slowLogin = window.setTimeout(() => {
      authStatus.textContent = "A conexão está demorando. Aguarde a resposta do servidor.";
    }, 8000);
    try {
      await signInWithEmailAndPassword(auth, $("username").value.trim(), $("password").value);
      $("password").value = "";
      authStatus.textContent = "";
      notify("Acesso realizado com sucesso.", "success");
    } catch (error) {
      authStatus.textContent = firebaseMessage(error);
      notify(firebaseMessage(error), "danger");
    } finally {
      window.clearTimeout(slowLogin);
      signingIn = false;
      setBusy(button, false);
    }
  });


  $("btnLogout").addEventListener("click", async () => {
    if (!savingCase && !canLeaveCase()) return;
    try { await signOut(auth); notify("Você saiu do sistema."); }
    catch (error) { notify(firebaseMessage(error), "danger"); }
  });

  const fieldMap = {
    numeroProntuario: "numero-prontuario", dataEntrada: "data-entrada", docOrigem: "documento-origem",
    origemCaso: "origem-caso", cor: "cor", detalheOrigem: "detalhe-origem", situacaoAtual: "situacao-atual",
    detalheSituacao: "detalhe-situacao", nomeCriad: "nome-criad", responsavelNome: "responsavel-nome",
    responsavelCpf: "responsavel-cpf", comunicacaoViolencia: "comunicacao-violencia", oficioViolencia: "oficio-violencia",
    encaminhamentosSolicitados: "encaminhamentos-solicitados", detalheEncaminhamento: "detalhe-encaminhamento",
    dataOficioEnc: "data-oficio-enc", retornoSolicitado: "retorno-solicitado", infoRetorno: "info-retorno",
    estudoCaso: "estudo-caso", piaElaborado: "pia-elaborado", outrasPendencias: "outras-pendencias",
    datasTexto: "datas-atendimento", tecnicosReferencia: "tecnicos-referencia",
    tipoViolencia: "tipo-violencia", violenciaSexual: "violencia-sexual", outrasViolencias: "outras-violencias"
  };

  caseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (savingCase) return;
    if (!permissions.canWriteCases) { notify("Seu perfil não permite alterar casos.", "warning"); return; }
    if (!auth.currentUser) { notify("Entre novamente para salvar um caso.", "warning"); return; }
    const number = $("numero-prontuario").value.trim();
    const validation = {};
    if (!number) validation['numero-prontuario'] = 'Informe o número do prontuário.';
    else if (number.length > 100) validation['numero-prontuario'] = 'Use até 100 caracteres no prontuário.';
    if (!caseFeedback.validate(validation)) return;
    const button = $("btnSalvarCaso");
    const fullData = Object.fromEntries(Object.entries(fieldMap).map(([key, id]) => [key, $(id).value.trim()]));
    if (!fullData.situacaoAtual) delete fullData.situacaoAtual;
    const uid = auth.currentUser.uid, epoch = authEpoch, key = editingKey;
    const expected = editingBase && { ...editingBase };
    const controlStates = [...caseForm.elements].map(input => [input, input.disabled]);
    $("case-save-status").textContent = "";
    controlStates.forEach(([input]) => { input.disabled = true; });
    savingCase = true;
    refreshUnloadGuard();
    setBusy(button, true);
    try {
      if (!await userCanWrite(uid)) {
        if (auth.currentUser?.uid === uid && authEpoch === epoch) { $("case-save-status").textContent = "Seu acesso de escrita foi revogado. Suas alterações continuam no formulário."; notify($("case-save-status").textContent, "warning"); }
        return;
      }
      const records = await readSavedCases();
      if (auth.currentUser?.uid !== uid || authEpoch !== epoch) return;
      if (hasDuplicate(records, fullData.numeroProntuario, key)) {
        $("case-save-status").textContent = "Este prontuário já está cadastrado. Abra o caso existente para atualizar.";
        caseFeedback.show($("numero-prontuario"), $("case-save-status").textContent);
        notify("Este prontuário já está cadastrado. Abra o caso existente para atualizar.", "warning"); return;
      }
      const target = key || await caseKey(fullData.numeroProntuario);
      const timestamp = new Date().toISOString();
      const patch = { ...fullData, atualizadoEm: timestamp, atualizadoPor: uid };
      const result = await runTransaction(ref(database, `casos/${target}`), current => {
        if (auth.currentUser?.uid !== uid || authEpoch !== epoch || !permissions.canWriteCases) return undefined;
        return key ? caseReplacement(current, expected, patch, Object.keys(fieldMap))
          : current === null ? { ...patch, criadoEm: timestamp, criadoPor: uid, origemCadastro: 'manual' } : undefined;
      }, { applyLocally: false });
      if (auth.currentUser?.uid !== uid || authEpoch !== epoch) return;
      if (!result.committed) {
        const message = key ? "O caso foi alterado por outra pessoa. Suas alterações continuam no formulário. Confira o registro atualizado antes de tentar novamente."
          : "Este prontuário acabou de ser cadastrado por outra pessoa. Abra o caso existente.";
        $("case-save-status").textContent = message;
        if (!key) caseFeedback.show($("numero-prontuario"), message);
        notify(message, "warning"); return;
      }
      notify(key ? "Registro atualizado." : "Novo caso registrado.", "success");
      caseDraft = null; toggleView("list", true);
    } catch (error) { if (auth.currentUser?.uid === uid && authEpoch === epoch) { $("case-save-status").textContent = firebaseMessage(error); notify(firebaseMessage(error), "danger"); } }
    finally { savingCase = false; controlStates.forEach(([input, disabled]) => { input.disabled = disabled; }); setBusy(button, false);
      refreshUnloadGuard();
      const firstInvalid = caseForm.querySelector('[aria-invalid="true"]');
      if (firstInvalid && !$("form-section").hidden && auth.currentUser?.uid === uid) caseFeedback.focus(firstInvalid);
    }
  });
  $("btnSalvarCaso").type = "submit";

  function filteredCases() {
    const query = $("filtroBusca").value.trim().toLocaleLowerCase("pt-BR");
    const mes = $("filtroMes").value;
    const ano = $("filtroAno").value;
    const status = $("filtroSituacao").value;
    return sortCases(cases.filter(({ data }) => {
      return matchesGeneralSearch(data, query) &&
        matchesEntryPeriod(data, mes, ano) && (!status || data.situacaoAtual === status) &&
        matchesViolence(data, $("filtroViolencia").value, $("filtroViolenciaSexual").value);
    }), $("ordenacaoCasos").value);
  }

  function makeCell(text, className = "") {
    const td = document.createElement("td"); td.textContent = text || "—"; if (className) td.className = className; return td;
  }

  function renderDetails(row, data) {
    const detailRow = document.createElement("tr"); detailRow.className = "details-row";
    const cell = document.createElement("td"); cell.colSpan = 7;
    const grid = document.createElement("div"); grid.className = "details-grid";
    const details = [
      ["Documento de origem", data.docOrigem], ["Origem", data.origemCaso], ["Detalhamento", data.detalheOrigem],
      ["Tipo de violência", data.tipoViolencia], ["Sexual", data.violenciaSexual], ["Outros tipos de violência", data.outrasViolencias],
      ["Comunicação da violência", data.comunicacaoViolencia], ["Encaminhamento", data.encaminhamentosSolicitados],
      ["Retorno solicitado", data.retornoSolicitado], ["Técnicos", data.tecnicosReferencia], ["Atendimentos", data.datasTexto],
      ["Pendências", data.outrasPendencias]
    ];
    details.forEach(([label, value]) => {
      if (!value) return;
      const item = document.createElement("div"); const strong = document.createElement("strong");
      strong.textContent = `${label}: `; item.append(strong, document.createTextNode(value)); grid.append(item);
    });
    appendImportedDetails(grid, data);
    cell.append(grid); detailRow.append(cell); row.after(detailRow);
  }

  function render() {
    const filtered = filteredCases();
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const counts = { ativo: 0, encerrado_com_protecao: 0, encerrado_sem_protecao: 0, suspenso: 0, nao_competencia: 0 };
    filtered.forEach(({ data }) => { if (Object.hasOwn(counts, data.situacaoAtual)) counts[data.situacaoAtual]++; });
    const summaryValues = { "summary-total": filtered.length, "summary-active": counts.ativo, "summary-closed": counts.encerrado_com_protecao + counts.encerrado_sem_protecao, "summary-suspended": counts.suspenso, "summary-outside": counts.nao_competencia };
    for (const [id,value] of Object.entries(summaryValues)) {
      const node = $(id), changed = node.textContent !== String(value); node.textContent = value;
      if (changed) {
        node.getAnimations().forEach(animation=>animation.cancel());
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) node.animate([{color:'#199664',opacity:.55,transform:'translateY(3px)'},{color:'#199664',opacity:1,transform:'translateY(0)'},{color:getComputedStyle(node).color}],{duration:550,easing:'ease-out'});
      }
    }
    caseTableBody.replaceChildren();
    filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach(({ key, data }) => {
      const row = document.createElement("tr"); row.dataset.key = key;
      row.append(makeCell(data.numeroProntuario, "case-number"));
      row.append(makeCell(data.dataEntrada ? new Date(`${data.dataEntrada}T12:00:00`).toLocaleDateString("pt-BR") : "—"));
      const statusCell = document.createElement("td"); const badge = document.createElement("span");
      badge.className = `status-badge status-${data.situacaoAtual || "unknown"}`;
      badge.textContent = statusLabels[data.situacaoAtual] || data.situacaoAtual || "Sem situação";
      statusCell.append(badge); row.append(statusCell);
      const attendance = makeCell(attendanceSummary({key,data}));
      const agendaLink = document.createElement('button'); agendaLink.type='button'; agendaLink.className='btn btn-sm btn-outline-secondary mt-2'; agendaLink.textContent='Ver agenda';
      agendaLink.addEventListener('click',()=>workflows.openScope('agenda',key)); attendance.append(document.createElement('br'),agendaLink);
      row.append(makeCell(data.nomeCriad), makeCell(data.responsavelNome), attendance);
      const actions = document.createElement("td"); actions.className = "text-end text-nowrap";
      const details = document.createElement("button"); details.type = "button"; details.className = "btn btn-sm btn-outline-secondary btnDetalhes"; details.title = "Ver detalhes"; details.setAttribute("aria-label", "Ver detalhes do caso"); details.innerHTML = '<i class="bi bi-eye"></i>';
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn-sm btn-outline-primary btnEditar ms-1"; edit.title = "Editar caso"; edit.setAttribute("aria-label", "Editar caso"); edit.innerHTML = '<i class="bi bi-pencil"></i>'; edit.hidden = !permissions.canWriteCases;
      actions.append(details, edit); row.append(actions); caseTableBody.append(row);
      row.addEventListener("click", (event) => {
        const button = event.target.closest("button"); if (!button) return;
        if (button.classList.contains("btnDetalhes")) {
          const next = row.nextElementSibling;
          if (next?.classList.contains("details-row")) next.remove(); else renderDetails(row, data);
        } else if (button.classList.contains("btnEditar")) {
          editCase(key);
        }
      });
    });
    $("empty-state").hidden = filtered.length > 0;
    $("case-table").hidden = filtered.length === 0;
    $("pagination").replaceChildren();
    if (pages > 1) {
      const nav = document.createElement("div"); nav.className = "pagination-controls";
      const info = document.createElement("span"); info.textContent = `Página ${page} de ${pages}`;
      const prev = document.createElement("button"); prev.className = "btn btn-sm btn-outline-secondary"; prev.textContent = "Anterior"; prev.disabled = page === 1;
      prev.addEventListener("click", () => { page--; render(); });
      const next = document.createElement("button"); next.className = "btn btn-sm btn-outline-secondary"; next.textContent = "Próxima"; next.disabled = page === pages;
      next.addEventListener("click", () => { page++; render(); }); nav.append(prev, info, next); $("pagination").append(nav);
    }
    workflows.render();
  }

  function editCase(key) {
    if (!permissions.canWriteCases) { notify("Seu perfil não permite alterar casos.", "warning"); return; }
    if (!canLeaveCase()) return;
    const record = cases.find(item => item.key === key); if (!record) return;
    editingKey = key;
    editingBase = { ...(record.rawData || record.data) };
    $("case-save-status").textContent = "";
    caseFeedback.reset();
    $("numero-prontuario").readOnly = true;
    $("numero-prontuario").title = "O número identifica o prontuário e não é alterado nesta ficha. Para corrigir a numeração, solicite revisão administrativa.";
    Object.entries(fieldMap).forEach(([field,id]) => {
      const input = $(id), value = record.data[field] || '';
      input.querySelectorAll?.('[data-import-option]').forEach(option=>option.remove());
      if (input.tagName === 'SELECT' && !Array.from(input.options).some(option=>option.value===value)) {
        const option = new Option(value || 'Não informado',value); option.dataset.importOption='true'; input.add(option);
      }
      input.value=value;
    });
    violenceForm.fill(record.data); $("btnCaseAgenda").disabled = $("btnCaseTasks").disabled = false;
    $("form-tabs").querySelector('[data-bs-target="#tab1"]')?.click(); caseDraft=caseSnapshot(); toggleView('form',true);
  }
  async function userCanWrite(uid) {
    if (auth.currentUser?.uid !== uid) return false;
    const epoch = authEpoch;
    const access = (await get(ref(database, `access/${uid}`))).val();
    if (auth.currentUser?.uid !== uid || authEpoch !== epoch) return false;
    permissions = permissionsForAccess(access);
    return permissions.canWriteCases;
  }
  async function readSavedCases() {
    const snapshot = await get(ref(database, "casos"));
    const records = [];
    snapshot.forEach(child => { const data = child.val(); if (data?.numeroProntuario) records.push({ key: child.key, data }); });
    return records;
  }
  const workflows = setupWorkflows({getCases:()=>cases,getUser:()=>auth.currentUser,canWrite:userCanWrite,openCase:editCase,notify,navigate:toggleView,onDraftChange:refreshUnloadGuard,
    saveActivity: async ({caseKey,field,value,expected,uid}) => {
      const epoch=authEpoch;
      if (auth.currentUser?.uid !== uid) throw new Error('Entre novamente para salvar.');
      const result=await runTransaction(ref(database,`casos/${caseKey}/${field}`),current=>auth.currentUser?.uid===uid&&authEpoch===epoch?replacementFor(current,expected,value):undefined,{applyLocally:false});
      return result.committed;
    }
  });

  [...filterIds, "ordenacaoCasos"].forEach((id) => {
    $(id).addEventListener("input", () => { page = 1; render(); });
  });
  $("btnLimparFiltros").addEventListener("click", () => {
    filterIds.forEach(id => { $(id).value = ""; });
    $("ordenacaoCasos").value = "recentes";
    page = 1; render();
  });
  function syncViolenceOptions() {
    const options = violenceOptions(cases);
    for (const [id, label, choices] of [
      ["filtroViolencia", "Todos os tipos de violência", [...options.types, ['sem_informacao', 'Sem tipo informado']]],
      ["filtroViolenciaSexual", "Todos os subtipos sexuais", options.subtypes]
    ]) {
      const selected = $(id).value;
      $(id).replaceChildren(new Option(label, ""), ...choices.map(([value, label]) => new Option(label, value)));
      $(id).value = choices.some(([value]) => value === selected) ? selected : "";
      if (selected && !$(id).value) page = 1;
    }
  }

  setupExports({ getData: () => filteredCases().map(({ data }) => ({ ...data,
    agendaRegistrada: activityText({key:'',data},'agenda'), pendenciasRegistradas: activityText({key:'',data},'tarefas'),
    dadosPlanilha: readableSnapshot(data.dadosPlanilha), historicoPlanilha: readableSnapshot(data.historicoPlanilha)
  })), notify });
  const importer = setupImport({
    notify,
    getUser: () => auth.currentUser,
    getPermission: async uid => await userCanWrite(uid) && permissions.canImport,
    getExisting: async () => {
      const snapshot = await get(ref(database, "casos"));
      const records = []; snapshot.forEach(child => records.push(child.val())); return records;
    },
    createCase: async (data, uid) => {
      const epoch = authEpoch;
      if (auth.currentUser?.uid !== uid || !permissions.canImport) throw new Error("Sessão encerrada ou perfil sem permissão");
      if (hasDuplicate(await readSavedCases(), data.numeroProntuario)) return false;
      const target = await caseKey(data.numeroProntuario);
      if (auth.currentUser?.uid !== uid || authEpoch !== epoch || !permissions.canImport) throw new Error("Sessão encerrada ou perfil sem permissão");
      const timestamp = new Date().toISOString();
      const result = await runTransaction(ref(database, `casos/${target}`), current => auth.currentUser?.uid === uid && authEpoch === epoch && permissions.canImport && current === null
        ? { ...data, criadoEm: timestamp, atualizadoEm: timestamp, criadoPor: uid, atualizadoPor: uid, origemCadastro: 'planilha' }
        : undefined, { applyLocally: false });
      if (auth.currentUser?.uid !== uid) throw new Error("Sessão encerrada");
      return result.committed;
    }
  });

  async function handleAuthState(user) {
    const epoch = ++authEpoch;
    if (unsubscribeCases) { unsubscribeCases(); unsubscribeCases = null; }
    workflows.setCanWrite(false);
    authWrapper.hidden = false;
    appWrapper.hidden = true;
    if (!user) {
      permissions = permissionsForAccess(null);
      importer.reset();
      cases = [];
      caseDraft = null;
      workflows.reset();
      editingKey = null;
      editingBase = null;
      $("case-save-status").textContent = "";
      page = 1;
      caseForm.reset();
      violenceForm.fill({});
      $("password").value = "";
      $("password").type = "password";
      $("show-password").checked = false;
      filterIds.forEach(id => { $(id).value = ""; });
      $("filtroAno").replaceChildren(new Option("Todos os anos", ""));
      syncViolenceOptions();
      $("ordenacaoCasos").value = "recentes";
      $("export-columns-dialog").close();
      caseTableBody.replaceChildren();
      ["summary-total", "summary-active", "summary-closed", "summary-suspended", "summary-outside"].forEach(id => { $(id).textContent = "0"; });
      toggleView("list", true);
      return;
    }

    authStatus.textContent = "Verificando o perfil de acesso...";
    try {
      const access = (await get(ref(database, `access/${user.uid}`))).val();
      if (auth.currentUser?.uid !== user.uid || authEpoch !== epoch) return;
      permissions = permissionsForAccess(access);
      if (!permissions.canReadCases) {
        authStatus.textContent = "Esta conta ainda não tem um cargo ativo no Proteja. Solicite ao administrador a liberação do acesso.";
        await signOut(auth);
        return;
      }
      authWrapper.hidden = true;
      appWrapper.hidden = false;
      authStatus.textContent = "";
      $("nav-new").hidden = !permissions.canWriteCases;
      $("btnEmptyNew").hidden = !permissions.canWriteCases;
      $("btnImport").hidden = !permissions.canImport;
      workflows.setCanWrite(permissions.canWriteCases);
    } catch {
      if (auth.currentUser?.uid !== user.uid || authEpoch !== epoch) return;
      permissions = permissionsForAccess(null);
      authStatus.textContent = "Não foi possível verificar seu cargo. Entre novamente mais tarde ou peça ajuda ao administrador.";
      await signOut(auth);
      return;
    }

    unsubscribeCases = onValue(ref(database, "casos"), (snapshot) => {
      if (auth.currentUser?.uid !== user.uid || authEpoch !== epoch) return;
      cases = [];
      snapshot.forEach((child) => {
        const data = child.val();
        if (data && data.numeroProntuario) cases.push({ key: child.key, rawData: data, data: resolveViolenceData(data) });
      });
      const selectedYear = $("filtroAno").value;
      const years = availableYears(cases);
      $("filtroAno").replaceChildren(new Option("Todos os anos", ""), ...years.map(year => new Option(year, year)));
      $("filtroAno").value = years.includes(selectedYear) ? selectedYear : "";
      if (selectedYear && !years.includes(selectedYear)) page = 1;
      syncViolenceOptions();
      render();
    }, (error) => {
      cases = []; editingKey = null; editingBase = null; caseDraft = null; caseForm.reset(); violenceForm.fill({});
      workflows.reset(); toggleView("list", true); render(); notify(firebaseMessage(error), "danger");
    });
  }

  async function initializeSession() {
    let preparationTimeout;
    try {
      // Clear any legacy persisted session before exposing a restored user.
      await Promise.race([
        (async () => { await setPersistence(auth, inMemoryPersistence); await signOut(auth); })(),
        new Promise((_, reject) => { preparationTimeout = window.setTimeout(() => reject(new Error('preparation-timeout')), 15000); })
      ]);
      onAuthStateChanged(auth, handleAuthState, () => {
        authStatus.textContent = "Não foi possível verificar sua sessão. Recarregue a página.";
      });
      authReady = true;
      document.documentElement.dataset.authReady = "true";
      delete document.documentElement.dataset.authFailed;
      loginButton.disabled = false;
      loginButton.textContent = "Acessar sistema";
      authStatus.textContent = "";
      $("btnReloadAuth").hidden = true;
    } catch {
      document.documentElement.dataset.authFailed = "true";
      loginButton.textContent = "Acesso indisponível — recarregue";
      authStatus.textContent = "Não foi possível preparar o acesso. Clique em Recarregar acesso. Sua internet pode estar funcionando; o serviço de autenticação ou o carregamento da página pode ter falhado.";
      $("btnReloadAuth").hidden = false;
    } finally {
      window.clearTimeout(preparationTimeout);
    }
  }
  initializeSession();
});
