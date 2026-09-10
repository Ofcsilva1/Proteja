import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js";
import { getDatabase, ref, push, set, onValue, update } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

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
getAnalytics(app);
const database = getDatabase(app);
const auth = getAuth(app);

document.addEventListener("DOMContentLoaded", function() {
  const authWrapper = document.getElementById("auth-wrapper");
  const appWrapper = document.getElementById("app-wrapper");
  const loginSection = document.getElementById("login-section");
  const registerSection = document.getElementById("register-section");
  
  const navList = document.getElementById("nav-list");
  const navNew = document.getElementById("nav-new");
  const listSection = document.getElementById("list-section");
  const formSection = document.getElementById("form-section");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");
  const btnCancelarForm = document.getElementById("btnCancelarForm");

  const caseForm = document.getElementById("case-form");
  const btnSalvarCaso = document.getElementById("btnSalvarCaso");
  const caseTableBody = document.querySelector("#case-table tbody");
  
  let editingRow = null;
  let editingKey = null;

  const exportMapping = {
    numeroProntuario: "Nº Prontuário", dataEntrada: "Data Entrada",
    docOrigem: "Doc. Origem", origemCaso: "Origem", cor: "Cor",
    situacaoAtual: "Situação", nomeCriad: "Nome CRIAD",
    responsavelNome: "Responsável", responsavelCpf: "CPF",
    comunicacaoViolencia: "Com. Violência", encaminhamentosSolicitados: "Encaminhamento",
    datasTexto: "Atendimentos", tecnicosReferencia: "Técnicos"
  };

  // Gerenciamento de Sessão Automático do Firebase
  onAuthStateChanged(auth, (user) => {
    if (user) {
      authWrapper.style.display = "none";
      appWrapper.style.display = "flex";
    } else {
      authWrapper.style.display = "flex";
      appWrapper.style.display = "none";
      loginSection.style.display = "block";
      registerSection.style.display = "none";
    }
  });

  function showNotification(message, type) {
    const container = document.getElementById("notification-container");
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} shadow-sm animate__animated animate__fadeInDown`;
    alert.innerText = message;
    container.appendChild(alert);
    setTimeout(() => {
      alert.classList.replace('animate__fadeInDown', 'animate__fadeOutUp');
      setTimeout(() => alert.remove(), 500);
    }, 3000);
  }

  function toggleView(view) {
    navList.classList.remove('active');
    navNew.classList.remove('active');
    
    if(view === 'list') {
      formSection.style.display = "none";
      listSection.style.display = "block";
      navList.classList.add('active');
      pageTitle.innerText = "Controle Geral de Casos";
      pageSubtitle.innerText = "Gerenciamento e monitoramento de prontuários.";
    } else {
      listSection.style.display = "none";
      formSection.style.display = "block";
      navNew.classList.add('active');
      pageTitle.innerText = editingKey ? "Editar Caso" : "Registrar Novo Caso";
      pageSubtitle.innerText = "Preencha as informações abaixo para cadastrar um novo caso no sistema.";
    }
  }

  navList.addEventListener("click", (e) => { e.preventDefault(); toggleView('list'); });
  navNew.addEventListener("click", (e) => { 
    e.preventDefault(); 
    caseForm.reset();
    editingKey = null;
    editingRow = null;
    toggleView('form'); 
  });
  btnCancelarForm.addEventListener("click", () => toggleView('list'));

  document.getElementById("link-register").addEventListener("click", e => {
    e.preventDefault(); loginSection.style.display = "none"; registerSection.style.display = "block";
  });
  
  document.getElementById("link-login").addEventListener("click", e => {
    e.preventDefault(); registerSection.style.display = "none"; loginSection.style.display = "block";
  });

  document.getElementById("show-password").addEventListener("change", function() {
    document.getElementById("password").type = this.checked ? "text" : "password";
  });

  document.getElementById("login-form").addEventListener("submit", e => {
    e.preventDefault();
    const email = document.getElementById("username").value.trim();
    const pass = document.getElementById("password").value;
    signInWithEmailAndPassword(auth, email, pass).then(() => {
      showNotification("Login bem-sucedido!", "success");
    }).catch(() => showNotification("Falha no login. Verifique as credenciais.", "danger"));
  });

  document.getElementById("btnLogout").addEventListener("click", () => {
    signOut(auth).then(() => {
      showNotification("Você saiu do sistema.", "info");
    });
  });

  btnSalvarCaso.addEventListener("click", () => {
    if(!document.getElementById("numero-prontuario").value) {
      showNotification("O Número do Prontuário é obrigatório.", "warning");
      return;
    }

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

    if (editingKey) {
      update(ref(database, "casos/" + editingKey), fullData).then(() => {
        showNotification("Registro atualizado com sucesso!", "success");
        toggleView('list');
      });
    } else {
      push(ref(database, "casos"), fullData).then(() => {
        showNotification("Novo caso registrado!", "success");
        toggleView('list');
      });
    }
  });

  onValue(ref(database, "casos"), (snapshot) => {
    caseTableBody.innerHTML = "";
    snapshot.forEach(child => {
      const data = child.val();
      const tr = document.createElement("tr");
      tr.setAttribute("data-full", JSON.stringify(data));
      tr.setAttribute("data-key", child.key);
      
      let badgeColor = data.situacaoAtual === 'ativo' ? 'bg-success' : 'bg-secondary';
      
      tr.innerHTML = `
        <td><strong>${data.numeroProntuario || "-"}</strong></td>
        <td>${data.dataEntrada || "-"}</td>
        <td><span class="badge ${badgeColor}">${data.situacaoAtual || "-"}</span></td>
        <td>${data.nomeCriad || "-"}</td>
        <td>${data.responsavelNome || "-"}</td>
        <td>${data.datasTexto || "-"}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary btnDetalhes" title="Ver Detalhes"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-outline-warning btnEditar" title="Editar Caso"><i class="bi bi-pencil"></i></button>
        </td>
      `;
      caseTableBody.appendChild(tr);
    });
  });

  caseTableBody.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const row = btn.closest("tr");
    const data = JSON.parse(row.getAttribute("data-full"));

    if (btn.classList.contains("btnEditar")) {
      editingKey = row.getAttribute("data-key");
      editingRow = row;
      Object.keys(data).forEach(key => {
        const input = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
        if(input) input.value = data[key];
      });
      toggleView('form');
    }
    
    if (btn.classList.contains("btnDetalhes")) {
      const nextRow = row.nextElementSibling;
      if (nextRow && nextRow.classList.contains("details-row")) {
        nextRow.remove();
      } else {
        const detailHtml = `
          <tr class="details-row"><td colspan="7">
            <table class="details-table w-100">
              <tr>
                <td><strong>Doc. Origem:</strong> ${data.docOrigem || "-"}</td>
                <td><strong>Comunicação Violência:</strong> ${data.comunicacaoViolencia || "-"}</td>
              </tr>
              <tr>
                <td><strong>Detalhe Origem:</strong> ${data.detalheOrigem || "-"}</td>
                <td><strong>Encaminhamento:</strong> ${data.encaminhamentosSolicitados || "-"}</td>
              </tr>
              <tr>
                <td><strong>Técnicos:</strong> ${data.tecnicosReferencia || "-"}</td>
                <td><strong>Pendências:</strong> ${data.outrasPendencias || "-"}</td>
              </tr>
            </table>
          </td></tr>
        `;
        row.insertAdjacentHTML("afterend", detailHtml);
      }
    }
  });

  function applyFilters() {
    const valPront = document.getElementById("filtroProntuario").value.toLowerCase();
    const valCriad = document.getElementById("filtroCriad").value.toLowerCase();
    
    document.querySelectorAll("#case-table tbody tr:not(.details-row)").forEach(row => {
      const txtPront = row.cells[0].innerText.toLowerCase();
      const txtCriad = row.cells[3].innerText.toLowerCase();
      
      const match = txtPront.includes(valPront) && txtCriad.includes(valCriad);
      row.style.display = match ? "" : "none";
      if(row.nextElementSibling && row.nextElementSibling.classList.contains('details-row')){
          row.nextElementSibling.style.display = match ? "" : "none";
      }
    });
  }
  document.getElementById("filtroProntuario").addEventListener("keyup", applyFilters);
  document.getElementById("filtroCriad").addEventListener("keyup", applyFilters);

  function getVisibleData() {
    const rows = Array.from(caseTableBody.querySelectorAll("tr:not(.details-row)")).filter(r => r.style.display !== "none");
    return rows.map(r => JSON.parse(r.getAttribute("data-full")));
  }

  document.getElementById("btnExportCSV").addEventListener("click", () => {
    const data = getVisibleData();
    let csv = Object.values(exportMapping).join(";") + "\n";
    data.forEach(d => {
      csv += Object.keys(exportMapping).map(k => `"${(d[k]||"").toString().replace(/"/g,'""')}"`).join(";") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "proteja_casos.csv"; link.click();
  });

  document.getElementById("btnExportXLS").addEventListener("click", () => {
    const data = getVisibleData();
    let html = `<table border="1"><thead><tr>${Object.values(exportMapping).map(h=>`<th style="background:#0d6efd;color:#fff;">${h}</th>`).join("")}</tr></thead><tbody>`;
    data.forEach(d => {
      html += `<tr>${Object.keys(exportMapping).map(k=>`<td>${d[k]||""}</td>`).join("")}</tr>`;
    });
    html += `</tbody></table>`;
    const blob = new Blob([`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><meta charset="UTF-8"/><body>${html}</body></html>`], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "proteja_casos.xls"; link.click();
  });
  
  document.getElementById("btnExportPDF").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "pt", "a4");
    doc.text("Relatório de Casos - PROTEJA", 40, 40);
    const data = getVisibleData().map(d => Object.keys(exportMapping).map(k => d[k]||""));
    doc.autoTable({ head: [Object.values(exportMapping)], body: data, startY: 50, styles: { fontSize: 7 }});
    doc.save("proteja_casos.pdf");
  });
});
