import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { setupExports } from "./exports.js";
import { setupImport, appendImportedDetails } from "./import-ui.js";
import { identity, readableSnapshot } from "./import-core.js";
import { getDatabase, ref, push, onValue, update, get, runTransaction } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";
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

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const authWrapper = $("auth-wrapper");
  const appWrapper = $("app-wrapper");
  const loginButton = $("btnLogin");
  const authStatus = $("auth-status");
  let authReady = false;
  let signingIn = false;
  const caseForm = $("case-form");
  const caseTableBody = document.querySelector("#case-table tbody");
  const statusLabels = {
    ativo: "Ativo", suspenso: "Suspenso", encerrado_com_protecao: "Encerrado com proteção",
    encerrado_sem_protecao: "Encerrado sem proteção", nao_competencia: "Não é competência"
  };
  let cases = [];
  let page = 1;
  let editingKey = null;
  let unsubscribeCases = null;

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

  function toggleView(view) {
    const isList = view === "list";
    $("nav-list").classList.toggle("active", isList);
    $("nav-new").classList.toggle("active", !isList);
    $("list-section").hidden = !isList;
    $("form-section").hidden = isList;
    $("page-title").textContent = isList ? "Controle geral de casos" : (editingKey ? "Editar caso" : "Registrar novo caso");
    $("page-subtitle").textContent = isList
      ? "Acompanhe prontuários, situações e próximos atendimentos."
      : "Registre as informações do caso nas etapas abaixo.";
    if (!isList) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNewCase() {
    editingKey = null;
    caseForm.reset();
    $("form-tabs").querySelector('[data-bs-target="#tab1"]')?.click();
    toggleView("form");
    $("numero-prontuario").focus();
  }

  $("nav-list").addEventListener("click", (event) => { event.preventDefault(); toggleView("list"); });
  $("nav-new").addEventListener("click", (event) => { event.preventDefault(); startNewCase(); });
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
    datasTexto: "datas-atendimento", tecnicosReferencia: "tecnicos-referencia"
  };

  caseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth.currentUser) { notify("Entre novamente para salvar um caso.", "warning"); return; }
    if (!caseForm.reportValidity()) return;
    const button = $("btnSalvarCaso");
    const fullData = Object.fromEntries(Object.entries(fieldMap).map(([key, id]) => [key, $(id).value.trim()]));
    fullData.atualizadoEm = new Date().toISOString();
    if (!fullData.situacaoAtual) delete fullData.situacaoAtual;
    setBusy(button, true);
    try {
      if (editingKey) await update(ref(database, `casos/${editingKey}`), fullData);
      else {
        fullData.criadoEm = new Date().toISOString();
        await push(ref(database, "casos"), fullData);
      }
      notify(editingKey ? "Registro atualizado." : "Novo caso registrado.", "success");
      toggleView("list");
    } catch (error) { notify(firebaseMessage(error), "danger"); }
    finally { setBusy(button, false); }
  });
  $("btnSalvarCaso").type = "submit";

  function filteredCases() {
    const query = $("filtroBusca").value.trim().toLocaleLowerCase("pt-BR");
    const numero = $("filtroProntuario").value.trim().toLocaleLowerCase("pt-BR");
    const criad = $("filtroCriad").value.trim().toLocaleLowerCase("pt-BR");
    const mes = $("filtroMes").value;
    const status = $("filtroSituacao").value;
    return cases.filter(({ data }) => {
      const searchable = [data.numeroProntuario, data.nomeCriad, data.responsavelNome, data.tecnicosReferencia, data.datasTexto]
        .join(" ").toLocaleLowerCase("pt-BR");
      const entryMonth = data.dataEntrada ? new Date(`${data.dataEntrada}T12:00:00`).getMonth() + 1 : "";
      return (!query || searchable.includes(query)) &&
        (!numero || String(data.numeroProntuario || "").toLocaleLowerCase("pt-BR").includes(numero)) &&
        (!criad || String(data.nomeCriad || "").toLocaleLowerCase("pt-BR").includes(criad)) &&
        (!mes || String(entryMonth) === mes) && (!status || data.situacaoAtual === status);
    }).sort((a, b) => String(b.data.dataEntrada || "").localeCompare(String(a.data.dataEntrada || "")));
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
    cases.forEach(({ data }) => { if (Object.hasOwn(counts, data.situacaoAtual)) counts[data.situacaoAtual]++; });
    $("summary-total").textContent = cases.length;
    $("summary-active").textContent = counts.ativo;
    $("summary-closed").textContent = counts.encerrado_com_protecao + counts.encerrado_sem_protecao;
    $("summary-suspended").textContent = counts.suspenso;
    $("summary-outside").textContent = counts.nao_competencia;
    caseTableBody.replaceChildren();
    filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach(({ key, data }) => {
      const row = document.createElement("tr"); row.dataset.key = key;
      row.append(makeCell(data.numeroProntuario, "case-number"));
      row.append(makeCell(data.dataEntrada ? new Date(`${data.dataEntrada}T12:00:00`).toLocaleDateString("pt-BR") : "—"));
      const statusCell = document.createElement("td"); const badge = document.createElement("span");
      badge.className = `status-badge status-${data.situacaoAtual || "unknown"}`;
      badge.textContent = statusLabels[data.situacaoAtual] || data.situacaoAtual || "Sem situação";
      statusCell.append(badge); row.append(statusCell);
      row.append(makeCell(data.nomeCriad), makeCell(data.responsavelNome), makeCell(data.datasTexto));
      const actions = document.createElement("td"); actions.className = "text-end text-nowrap";
      const details = document.createElement("button"); details.type = "button"; details.className = "btn btn-sm btn-outline-secondary btnDetalhes"; details.title = "Ver detalhes"; details.setAttribute("aria-label", "Ver detalhes do caso"); details.innerHTML = '<i class="bi bi-eye"></i>';
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn-sm btn-outline-primary btnEditar ms-1"; edit.title = "Editar caso"; edit.setAttribute("aria-label", "Editar caso"); edit.innerHTML = '<i class="bi bi-pencil"></i>';
      actions.append(details, edit); row.append(actions); caseTableBody.append(row);
      row.addEventListener("click", (event) => {
        const button = event.target.closest("button"); if (!button) return;
        if (button.classList.contains("btnDetalhes")) {
          const next = row.nextElementSibling;
          if (next?.classList.contains("details-row")) next.remove(); else renderDetails(row, data);
        } else if (button.classList.contains("btnEditar")) {
          editingKey = key;
          Object.entries(fieldMap).forEach(([field, id]) => {
            const input = $(id);
            input.querySelectorAll?.('[data-import-option]').forEach(option => option.remove());
            const value = data[field] || "";
            if (input.tagName === "SELECT" && !Array.from(input.options).some(option => option.value === value)) {
              const option = new Option(value || "Não informado", value); option.dataset.importOption = "true"; input.add(option);
            }
            input.value = value;
          });
          $("form-tabs").querySelector('[data-bs-target="#tab1"]')?.click(); toggleView("form");
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
  }

  ["filtroBusca", "filtroProntuario", "filtroCriad", "filtroMes", "filtroSituacao"].forEach((id) => {
    $(id).addEventListener("input", () => { page = 1; render(); });
  });

  setupExports({ getData: () => filteredCases().map(({ data }) => ({ ...data,
    dadosPlanilha: readableSnapshot(data.dadosPlanilha), historicoPlanilha: readableSnapshot(data.historicoPlanilha)
  })), notify });
  const importer = setupImport({
    getUser: () => auth.currentUser,
    getPermission: async uid => {
      if (auth.currentUser?.uid !== uid) return false;
      const access = (await get(ref(database, `access/${uid}`))).val();
      return auth.currentUser?.uid === uid && access?.active === true && access?.canWrite === true;
    },
    getExisting: async () => {
      const snapshot = await get(ref(database, "casos"));
      const records = []; snapshot.forEach(child => records.push(child.val())); return records;
    },
    createCase: async (data, uid) => {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity(data.numeroProntuario)));
      const key = 'import_' + Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
      if (auth.currentUser?.uid !== uid) throw new Error("Sessão encerrada");
      const timestamp = new Date().toISOString();
      const record = { ...data, criadoEm: timestamp, atualizadoEm: timestamp };
      const result = await runTransaction(ref(database, `casos/${key}`), current => current === null ? record : undefined, { applyLocally: false });
      return result.committed;
    }
  });

  function handleAuthState(user) {
    if (unsubscribeCases) { unsubscribeCases(); unsubscribeCases = null; }
    authWrapper.hidden = Boolean(user); appWrapper.hidden = !user;
    if (!user) {
      importer.reset();
      cases = [];
      editingKey = null;
      page = 1;
      caseForm.reset();
      $("password").value = "";
      $("password").type = "password";
      $("show-password").checked = false;
      ["filtroBusca", "filtroProntuario", "filtroCriad", "filtroMes", "filtroSituacao"].forEach(id => { $(id).value = ""; });
      $("export-columns-dialog").close();
      caseTableBody.replaceChildren();
      ["summary-total", "summary-active", "summary-closed", "summary-suspended", "summary-outside"].forEach(id => { $(id).textContent = "0"; });
      toggleView("list");
      return;
    }
    authStatus.textContent = "";
    unsubscribeCases = onValue(ref(database, "casos"), (snapshot) => {
      if (auth.currentUser?.uid !== user.uid) return;
      cases = [];
      snapshot.forEach((child) => {
        const data = child.val();
        if (data && data.numeroProntuario) cases.push({ key: child.key, data });
      });
      render();
    }, (error) => notify(firebaseMessage(error), "danger"));
  }

  async function initializeSession() {
    try {
      // Clear any legacy persisted session before exposing a restored user.
      await setPersistence(auth, inMemoryPersistence);
      await signOut(auth);
      onAuthStateChanged(auth, handleAuthState, () => {
        authStatus.textContent = "Não foi possível verificar sua sessão. Recarregue a página.";
      });
      authReady = true;
      document.documentElement.dataset.authReady = "true";
      loginButton.disabled = false;
      loginButton.textContent = "Acessar sistema";
      authStatus.textContent = "";
    } catch {
      authStatus.textContent = "Não foi possível preparar o acesso. Confira a conexão e recarregue a página.";
      $("btnReloadAuth").hidden = false;
    }
  }
  initializeSession();
});

