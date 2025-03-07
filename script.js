/****************************************************
 * script.js
 * 
 * Deve ser importado como MÓDULO:
 * <script type="module" src="script.js"></script>
 ****************************************************/
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js";
import {
  getDatabase, ref, push, set, onValue, update
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

// ==================
//  CONFIG FIREBASE
// ==================
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

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
getAnalytics(app);
const database = getDatabase(app);

// ==================
//  LÓGICA PRINCIPAL
// ==================
document.addEventListener("DOMContentLoaded", function() {
  /*******************
   * CREDENCIAIS FIXAS
   *******************/
  const VALID_USERNAME = "Proteja";
  const VALID_PASSWORD = "Proteja";

  /*******************
   * SELETORES DOM
   *******************/
  const loginSection = document.getElementById("login-section");
  const loginForm = document.getElementById("login-form");
  const appSection = document.getElementById("app-section");

  const btnNovoCaso = document.getElementById("btnNovoCaso");
  const btnCasosSalvos = document.getElementById("btnCasosSalvos");

  const formSection = document.getElementById("form-section");
  const listSection = document.getElementById("list-section");

  const caseForm = document.getElementById("case-form");
  const btnSalvarCaso = document.getElementById("btnSalvarCaso");
  const caseTableBody = document.getElementById("case-table").querySelector("tbody");

  const filtroProntuario = document.getElementById("filtroProntuario");
  const filtroCriad = document.getElementById("filtroCriad");
  const filtroMes = document.getElementById("filtroMes");

  const btnExportCSV = document.getElementById("btnExportCSV");
  const btnExportXLS = document.getElementById("btnExportXLS");
  const btnExportPDF = document.getElementById("btnExportPDF");

  const paginationEl = document.getElementById("pagination");
  const rowsPerPage = 10;
  let currentPage = 1;

  let editingRow = null;
  let editingKey = null; // chave do registro no DB, se for edição

  // ===================
  //  FUNÇÕES AUXILIARES
  // ===================
  function showNotification(message, type) {
    const container = document.getElementById("notification-container");
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = "alert";
    alertDiv.innerText = message;
    container.appendChild(alertDiv);
    setTimeout(() => {
      alertDiv.classList.remove("show");
      setTimeout(() => {
        if (container.contains(alertDiv)) container.removeChild(alertDiv);
      }, 500);
    }, 3000);
  }

  function extrairNomeMes(dataStr) {
    const token = dataStr.split(" ")[0];
    const partes = token.split("/");
    if (partes.length !== 3) return null;
    const mes = parseInt(partes[1], 10);
    const nomesMes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                      "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    if (mes < 1 || mes > 12) return null;
    return nomesMes[mes - 1];
  }

  // Debounce
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // ===================
  //  LOGIN (FAKE)
  // ===================
  loginForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      loginSection.style.display = "none";
      appSection.style.display = "block";
      appSection.classList.add("animate__fadeIn");
      showNotification("Login feito com Sucesso", "success");
    } else {
      alert("Credenciais inválidas! Tente novamente.");
    }
    loginForm.reset();
  });

  // Mostrar/ocultar senha
  const showPasswordCheckbox = document.getElementById("show-password");
  showPasswordCheckbox.addEventListener("change", function() {
    const passwordInput = document.getElementById("password");
    passwordInput.type = this.checked ? "text" : "password";
  });

  // ===================
  //  NAVEGAÇÃO (ABAS)
  // ===================
  btnNovoCaso.addEventListener("click", () => {
    formSection.style.display = "block";
    listSection.style.display = "none";
    formSection.classList.add("animate__fadeIn");
  });
  btnCasosSalvos.addEventListener("click", () => {
    formSection.style.display = "none";
    listSection.style.display = "block";
    listSection.classList.add("animate__fadeIn");
  });

  // ===================
  //  PAGINAÇÃO
  // ===================
  function getVisibleRows() {
    const allRows = caseTableBody.querySelectorAll("tr");
    return Array.from(allRows).filter(r => r.style.display !== "none");
  }
  function showPage(page) {
    currentPage = page;
    const visibleRows = getVisibleRows();
    visibleRows.forEach((row, index) => {
      row.style.display = (index >= (page - 1) * rowsPerPage && index < page * rowsPerPage) ? "" : "none";
    });
    updatePagination(visibleRows.length);
  }
  function updatePagination(totalRows) {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    let paginationHTML = '<ul class="pagination justify-content-center">';
    paginationHTML += `<li class="page-item ${currentPage === 1 ? "disabled" : ""}">
                         <a class="page-link" href="#" data-page="${currentPage - 1}">Anterior</a>
                       </li>`;
    for (let i = 1; i <= totalPages; i++) {
      paginationHTML += `<li class="page-item ${i === currentPage ? "active" : ""}">
                           <a class="page-link" href="#" data-page="${i}">${i}</a>
                         </li>`;
    }
    paginationHTML += `<li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
                         <a class="page-link" href="#" data-page="${currentPage + 1}">Próximo</a>
                       </li>`;
    paginationHTML += "</ul>";
    paginationEl.innerHTML = paginationHTML;
    const links = paginationEl.querySelectorAll("a.page-link");
    links.forEach(link => {
      link.addEventListener("click", function(e) {
        e.preventDefault();
        const page = Number(this.getAttribute("data-page"));
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
          showPage(page);
        }
      });
    });
  }

  // ===================
  //  FILTRAGEM
  // ===================
  const debouncedFilter = debounce(() => {
    const valProntuario = filtroProntuario.value.toLowerCase().trim();
    const valCriad = filtroCriad.value.toLowerCase().trim();
    const valMes = filtroMes.value;
    const rows = caseTableBody.querySelectorAll("tr");
    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (!cells.length) return;
      const txtProntuario = cells[0].innerText.toLowerCase();
      const txtCriad = cells[3].innerText.toLowerCase(); // 3 -> Nome da CRIAD (4ª coluna)

      let matchProntuario = !valProntuario || txtProntuario.includes(valProntuario);
      let matchCriad = !valCriad || txtCriad.includes(valCriad);

      // Pega os dados do row
      let fullData;
      try {
        fullData = JSON.parse(row.getAttribute("data-full"));
      } catch(e) {
        fullData = {};
      }

      let matchMes = true;
      let displayDates = fullData.datasTexto; // Padrão

      if (valMes && fullData.mapaDatas) {
        if (fullData.mapaDatas[valMes] && fullData.mapaDatas[valMes].length > 0) {
          matchMes = true;
          displayDates = fullData.mapaDatas[valMes].join(", ");
        } else {
          matchMes = false;
        }
      }

      if (!matchProntuario || !matchCriad || !matchMes) {
        row.style.display = "none";
      } else {
        row.style.display = "";
        // Atualiza a célula de datas (6ª coluna)
        cells[5].innerText = displayDates;
      }
    });
    showPage(1);
  }, 300);

  filtroProntuario.addEventListener("keyup", debouncedFilter);
  filtroCriad.addEventListener("keyup", debouncedFilter);
  filtroMes.addEventListener("change", debouncedFilter);

  // ===================
  //  SALVAR/ATUALIZAR CASO
  // ===================
  btnSalvarCaso.addEventListener("click", function() {
    const fullData = {
      numeroProntuario: document.getElementById("numero-prontuario").value,
      dataEntrada: document.getElementById("data-entrada").value,
      docOrigem: document.getElementById("documento-origem").value,
      origemCaso: document.getElementById("origem-caso").value,
      cor: document.getElementById("cor").value,
      detalheOrigem: document.getElementById("detalhe-origem").value,
      situacaoAtual: document.getElementById("situacao-atual").value,
      detalheSituacao: document.getElementById("detalhe-situacao").value,
      nomeCriad: document.getElementById("nome-criad").value,
      responsavelNome: document.getElementById("responsavel-nome").value,
      responsavelCpf: document.getElementById("responsavel-cpf").value,
      comunicacaoViolencia: document.getElementById("comunicacao-violencia").value,
      oficioViolencia: document.getElementById("oficio-violencia").value,
      encaminhamentosSolicitados: document.getElementById("encaminhamentos-solicitados").value,
      detalheEncaminhamento: document.getElementById("detalhe-encaminhamento").value,
      dataOficioEnc: document.getElementById("data-oficio-enc").value,
      retornoSolicitado: document.getElementById("retorno-solicitado").value,
      infoRetorno: document.getElementById("info-retorno").value,
      estudoCaso: document.getElementById("estudo-caso").value,
      piaElaborado: document.getElementById("pia-elaborado").value,
      outrasPendencias: document.getElementById("outras-pendencias").value,
      datasTexto: document.getElementById("datas-atendimento").value,
      tecnicosReferencia: document.getElementById("tecnicos-referencia").value
    };

    // Mapeia datas para filtragem por mês
    let mapaDatas = {};
    const arrDatas = fullData.datasTexto.split(",");
    arrDatas.forEach(d => {
      const dataLimpa = d.trim();
      if (!dataLimpa) return;
      const token = dataLimpa.split(" ")[0];
      const mes = extrairNomeMes(token);
      if (!mes) return;
      if (!mapaDatas[mes]) mapaDatas[mes] = [];
      mapaDatas[mes].push(dataLimpa);
    });
    fullData.mapaDatas = mapaDatas;

    // Salvar no Firebase Realtime Database
    const casosRef = ref(database, "casos");

    if (editingRow && editingKey) {
      // Atualizar
      update(ref(database, "casos/" + editingKey), fullData)
        .then(() => {
          showNotification("Alteração com Sucesso (DB)", "success");
        })
        .catch(err => {
          console.error(err);
          showNotification("Erro ao atualizar no DB", "danger");
        });
      editingRow = null;
      editingKey = null;
    } else {
      // Criar novo
      const newCaseRef = push(casosRef);
      set(newCaseRef, fullData)
        .then(() => {
          showNotification("Prontuário Salvo (DB)", "success");
        })
        .catch(err => {
          console.error(err);
          showNotification("Erro ao salvar no DB", "danger");
        });
    }

    // Também atualiza/cria a linha localmente (como no código original),
    // mas agora com 6 <td> antes das ações
    const summaryHTML = `
      <td>${fullData.numeroProntuario}</td>
      <td>${fullData.dataEntrada}</td>
      <td>${fullData.situacaoAtual}</td>
      <td>${fullData.nomeCriad}</td>
      <td>${fullData.responsavelNome}</td>
      <td>${fullData.datasTexto}</td>
      <td>
        <button class="btnDetalhes btn btn-sm btn-info">Detalhes</button>
        <button class="btnEditar btn btn-sm btn-warning">Editar</button>
      </td>
    `;
    let newRow;
    if (editingRow) {
      newRow = editingRow;
      newRow.innerHTML = summaryHTML;
      showNotification("Alteração com Sucesso", "success");
      editingRow = null;
    } else {
      newRow = document.createElement("tr");
      newRow.innerHTML = summaryHTML;
      caseTableBody.appendChild(newRow);
      showNotification("Prontuário Salvo", "success");
    }
    newRow.setAttribute("data-full", JSON.stringify(fullData));
    caseForm.reset();
  });

  // ===================
  //  DETALHES E EDIÇÃO
  // ===================
  caseTableBody.addEventListener("click", function(e) {
    const row = e.target.closest("tr");
    if (!row) return;

    if (e.target.classList.contains("btnDetalhes")) {
      // Mostrar/ocultar linha de detalhes
      if (row.nextElementSibling && row.nextElementSibling.classList.contains("details-row")) {
        row.parentNode.removeChild(row.nextElementSibling);
      } else {
        const fullData = JSON.parse(row.getAttribute("data-full"));
        let detailsHTML = `<table class="details-table table table-bordered">
          <tr><td><strong>Nº Prontuário</strong></td><td>${fullData.numeroProntuario}</td></tr>
          <tr><td><strong>Data Entrada</strong></td><td>${fullData.dataEntrada}</td></tr>
          <tr><td><strong>Doc Origem</strong></td><td>${fullData.docOrigem}</td></tr>
          <tr><td><strong>Origem Caso</strong></td><td>${fullData.origemCaso}</td></tr>
          <tr><td><strong>Cor</strong></td><td>${fullData.cor}</td></tr>
          <tr><td><strong>Det. Origem</strong></td><td>${fullData.detalheOrigem}</td></tr>
          <tr><td><strong>Situação Atual</strong></td><td>${fullData.situacaoAtual}</td></tr>
          <tr><td><strong>Det. Situação</strong></td><td>${fullData.detalheSituacao}</td></tr>
          <tr><td><strong>Nome CRIAD</strong></td><td>${fullData.nomeCriad}</td></tr>
          <tr><td><strong>Responsável</strong></td><td>${fullData.responsavelNome}</td></tr>
          <tr><td><strong>CPF</strong></td><td>${fullData.responsavelCpf}</td></tr>
          <tr><td><strong>Com. Violência?</strong></td><td>${fullData.comunicacaoViolencia}</td></tr>
          <tr><td><strong>Ofício Violência</strong></td><td>${fullData.oficioViolencia}</td></tr>
          <tr><td><strong>Enc. Solicitado</strong></td><td>${fullData.encaminhamentosSolicitados}</td></tr>
          <tr><td><strong>Det. Enc.</strong></td><td>${fullData.detalheEncaminhamento}</td></tr>
          <tr><td><strong>Data/Ofício Enc.</strong></td><td>${fullData.dataOficioEnc}</td></tr>
          <tr><td><strong>Retorno Solicitado?</strong></td><td>${fullData.retornoSolicitado}</td></tr>
          <tr><td><strong>Info Retorno</strong></td><td>${fullData.infoRetorno}</td></tr>
          <tr><td><strong>EC Elaborado?</strong></td><td>${fullData.estudoCaso}</td></tr>
          <tr><td><strong>PIA Elaborado?</strong></td><td>${fullData.piaElaborado}</td></tr>
          <tr><td><strong>Outras pendências</strong></td><td>${fullData.outrasPendencias}</td></tr>
          <tr><td><strong>Datas de atendimentos</strong></td><td>${fullData.datasTexto}</td></tr>
          <tr><td><strong>Técnicos de referência</strong></td><td>${fullData.tecnicosReferencia}</td></tr>
        </table>`;

        const detailsRow = document.createElement("tr");
        detailsRow.classList.add("details-row", "animate__animated", "animate__fadeIn");
        const detailsCell = document.createElement("td");
        detailsCell.colSpan = row.children.length; // 7 colunas
        detailsCell.innerHTML = detailsHTML;
        detailsRow.appendChild(detailsCell);
        row.parentNode.insertBefore(detailsRow, row.nextSibling);
      }
    }
    else if (e.target.classList.contains("btnEditar")) {
      // Editar
      const fullData = JSON.parse(row.getAttribute("data-full"));

      // Preenche o formulário
      document.getElementById("numero-prontuario").value = fullData.numeroProntuario || "";
      document.getElementById("data-entrada").value = fullData.dataEntrada || "";
      document.getElementById("documento-origem").value = fullData.docOrigem || "";
      document.getElementById("origem-caso").value = fullData.origemCaso || "";
      document.getElementById("cor").value = fullData.cor || "";
      document.getElementById("detalhe-origem").value = fullData.detalheOrigem || "";
      document.getElementById("situacao-atual").value = fullData.situacaoAtual || "";
      document.getElementById("detalhe-situacao").value = fullData.detalheSituacao || "";
      document.getElementById("nome-criad").value = fullData.nomeCriad || "";
      document.getElementById("responsavel-nome").value = fullData.responsavelNome || "";
      document.getElementById("responsavel-cpf").value = fullData.responsavelCpf || "";
      document.getElementById("comunicacao-violencia").value = fullData.comunicacaoViolencia || "";
      document.getElementById("oficio-violencia").value = fullData.oficioViolencia || "";
      document.getElementById("encaminhamentos-solicitados").value = fullData.encaminhamentosSolicitados || "";
      document.getElementById("detalhe-encaminhamento").value = fullData.detalheEncaminhamento || "";
      document.getElementById("data-oficio-enc").value = fullData.dataOficioEnc || "";
      document.getElementById("retorno-solicitado").value = fullData.retornoSolicitado || "";
      document.getElementById("info-retorno").value = fullData.infoRetorno || "";
      document.getElementById("estudo-caso").value = fullData.estudoCaso || "";
      document.getElementById("pia-elaborado").value = fullData.piaElaborado || "";
      document.getElementById("outras-pendencias").value = fullData.outrasPendencias || "";
      document.getElementById("datas-atendimento").value = fullData.datasTexto || "";
      document.getElementById("tecnicos-referencia").value = fullData.tecnicosReferencia || "";

      editingRow = row;
      editingKey = row.getAttribute("data-key") || null; // se tiver key, guardamos

      // Mostra a aba de formulário
      formSection.style.display = "block";
      listSection.style.display = "none";
      formSection.classList.add("animate__fadeIn");
    }
  });

  // ===================
  //  EXPORTAÇÕES
  // ===================
  // CSV
  btnExportCSV.addEventListener("click", function() {
    const mapping = {
      numeroProntuario: "Nº Prontuário",
      dataEntrada: "Data Entrada",
      situacaoAtual: "Situação Atual",
      nomeCriad: "Nome CRIAD",
      responsavelNome: "Responsável",
      datasTexto: "Data de Atendimento",
    };
    // Se quiser incluir todos, basta adicionar no mapping e no rowData

    const headers = Object.values(mapping);
    let csvContent = headers.map(h => `"${h}"`).join(";") + "\n";

    const rows = caseTableBody.querySelectorAll("tr");
    rows.forEach(row => {
      const dataAttr = row.getAttribute("data-full");
      if (!dataAttr) return;
      const fullData = JSON.parse(dataAttr);

      const rowData = [
        fullData.numeroProntuario,
        fullData.dataEntrada,
        fullData.situacaoAtual,
        fullData.nomeCriad,
        fullData.responsavelNome,
        fullData.datasTexto
      ];
      csvContent += rowData.map(val => `"${(val||"").replace(/"/g,'""')}"`).join(";") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "casos_proteja.csv";
    link.click();
  });

  // XLS
  btnExportXLS.addEventListener("click", function() {
    const mapping = {
      numeroProntuario: "Nº Prontuário",
      dataEntrada: "Data Entrada",
      situacaoAtual: "Situação Atual",
      nomeCriad: "Nome CRIAD",
      responsavelNome: "Responsável",
      datasTexto: "Data de Atendimento",
    };
    const headers = Object.values(mapping);

    let tableHTML = `<table><thead><tr>`;
    headers.forEach(h => {
      tableHTML += `<th>${h}</th>`;
    });
    tableHTML += `</tr></thead><tbody>`;

    const rows = caseTableBody.querySelectorAll("tr");
    rows.forEach(row => {
      const dataAttr = row.getAttribute("data-full");
      if (!dataAttr) return;
      const fullData = JSON.parse(dataAttr);

      const rowData = [
        fullData.numeroProntuario,
        fullData.dataEntrada,
        fullData.situacaoAtual,
        fullData.nomeCriad,
        fullData.responsavelNome,
        fullData.datasTexto
      ];
      tableHTML += "<tr>" + rowData.map(val => `<td>${val||""}</td>`).join("") + "</tr>";
    });
    tableHTML += `</tbody></table>`;

    const html = `<html><head><meta charset="UTF-8"/></head><body>${tableHTML}</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "casos_proteja.xls";
    link.click();
  });

  // PDF
  btnExportPDF.addEventListener("click", function() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "pt", "a3");
    doc.setFontSize(6);
    doc.text("Casos PROTEJA - Relatório", 40, 40);
    const pageWidth = doc.internal.pageSize.getWidth();

    const mapping = {
      numeroProntuario: "Nº Prontuário",
      dataEntrada: "Data Entrada",
      situacaoAtual: "Situação Atual",
      nomeCriad: "Nome CRIAD",
      responsavelNome: "Responsável",
      datasTexto: "Data de Atendimento"
    };
    const headers = Object.values(mapping);

    const data = [];
    const rows = caseTableBody.querySelectorAll("tr");
    rows.forEach(row => {
      const dataAttr = row.getAttribute("data-full");
      if (!dataAttr) return;
      const fullData = JSON.parse(dataAttr);
      const rowData = [
        fullData.numeroProntuario,
        fullData.dataEntrada,
        fullData.situacaoAtual,
        fullData.nomeCriad,
        fullData.responsavelNome,
        fullData.datasTexto
      ];
      data.push(rowData);
    });

    doc.autoTable({
      head: [headers],
      body: data,
      startY: 60,
      margin: { left: 10, right: 10 },
      tableWidth: pageWidth - 20,
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [76, 175, 80], halign: "center", fontSize: 6 },
      bodyStyles: { halign: "left", fontSize: 6 },
      theme: "grid",
      pageBreak: "auto"
    });
    doc.save("casos_proteja.pdf");
  });

  // ===================
  //  CARREGAR DADOS DO DB AO INICIAR
  // ===================
  onValue(ref(database, "casos"), (snapshot) => {
    // Limpa a tabela
    caseTableBody.innerHTML = "";

    snapshot.forEach(childSnapshot => {
      const childKey = childSnapshot.key;
      const fullData = childSnapshot.val();

      // Monta a linha com 6 colunas + Ações
      const newRow = document.createElement("tr");
      newRow.innerHTML = `
        <td>${fullData.numeroProntuario || ""}</td>
        <td>${fullData.dataEntrada || ""}</td>
        <td>${fullData.situacaoAtual || ""}</td>
        <td>${fullData.nomeCriad || ""}</td>
        <td>${fullData.responsavelNome || ""}</td>
        <td>${fullData.datasTexto || ""}</td>
        <td>
          <button class="btnDetalhes btn btn-sm btn-info">Detalhes</button>
          <button class="btnEditar btn btn-sm btn-warning">Editar</button>
        </td>
      `;
      newRow.setAttribute("data-full", JSON.stringify(fullData));
      newRow.setAttribute("data-key", childKey);

      caseTableBody.appendChild(newRow);
    });

    // Atualiza paginação/filtro
    showPage(1);
  });
});
