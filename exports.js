// A single catalog keeps the column selection identical across all three formats.
export const EXPORT_COLUMNS = [
  { key: "numeroProntuario", label: "Nº Prontuário", group: "Identificação" },
  { key: "dataEntrada", label: "Data Entrada", group: "Identificação" },
  { key: "docOrigem", label: "Doc. Origem", group: "Identificação" },
  { key: "origemCaso", label: "Origem", group: "Identificação" },
  { key: "cor", label: "Cor", group: "Identificação" },
  { key: "situacaoAtual", label: "Situação", group: "Situação" },
  { key: "nomeCriad", label: "Nome CRIAD", group: "CRIAD e responsável" },
  { key: "responsavelNome", label: "Responsável", group: "CRIAD e responsável" },
  { key: "responsavelCpf", label: "CPF", group: "CRIAD e responsável" },
  { key: "comunicacaoViolencia", label: "Com. Violência", group: "Violência" },
  { key: "encaminhamentosSolicitados", label: "Encaminhamento", group: "Encaminhamentos" },
  { key: "datasTexto", label: "Atendimentos", group: "Atendimentos e pendências" },
  { key: "tecnicosReferencia", label: "Técnicos", group: "Atendimentos e pendências" },
  { key: "detalheOrigem", label: "Detalhamento da origem", group: "Identificação" },
  { key: "detalheSituacao", label: "Detalhamento da situação", group: "Situação" },
  { key: "oficioViolencia", label: "Ofício de comunicação", group: "Violência" },
  { key: "dataOficioEnc", label: "Ofício do encaminhamento (data e nº)", group: "Encaminhamentos" },
  { key: "detalheEncaminhamento", label: "Detalhamento do encaminhamento", group: "Encaminhamentos" },
  { key: "retornoSolicitado", label: "Retorno solicitado", group: "Retorno" },
  { key: "infoRetorno", label: "Informações sobre o retorno", group: "Retorno" },
  { key: "estudoCaso", label: "Estudo de caso elaborado", group: "Estudo e plano" },
  { key: "piaElaborado", label: "Plano individual elaborado", group: "Estudo e plano" },
  { key: "outrasPendencias", label: "Outras pendências", group: "Atendimentos e pendências" },
  { key: "criadoEm", label: "Criado em", group: "Histórico" },
  { key: "atualizadoEm", label: "Atualizado em", group: "Histórico" }
];

// Preserve the existing 13-column export unless the user changes the selection.
export const DEFAULT_EXPORT_KEYS = EXPORT_COLUMNS.slice(0, 13).map(column => column.key);

function spreadsheetValue(value) {
  const text = String(value ?? "");
  return /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function setupExports({ getData, notify }) {
  const $ = id => document.getElementById(id);
  const dialog = $("export-columns-dialog");
  const options = $("export-column-options");
  let selectedKeys = new Set(DEFAULT_EXPORT_KEYS);

  // The dialog edits a draft; closing or pressing Escape leaves the export unchanged.
  const groups = new Map();
  EXPORT_COLUMNS.forEach(column => {
    if (!groups.has(column.group)) groups.set(column.group, []);
    groups.get(column.group).push(column);
  });
  groups.forEach((columns, group) => {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = group;
    fieldset.append(legend);
    columns.forEach(column => {
      const label = document.createElement("label");
      label.className = "export-column-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "form-check-input";
      input.name = "column";
      input.value = column.key;
      const text = document.createElement("span");
      text.textContent = column.label;
      label.append(input, text);
      fieldset.append(label);
    });
    options.append(fieldset);
  });

  function draftKeys() {
    return [...options.querySelectorAll("input:checked")].map(input => input.value);
  }
  function updateDraftSummary() {
    const count = draftKeys().length;
    $("export-selection-summary").textContent = count
      ? count + " de " + EXPORT_COLUMNS.length + " colunas selecionadas"
      : "Selecione pelo menos uma coluna.";
    $("btnApplyExportColumns").disabled = count === 0;
  }
  function setDraft(keys) {
    const checked = new Set(keys);
    options.querySelectorAll("input").forEach(input => { input.checked = checked.has(input.value); });
    updateDraftSummary();
  }
  $("btnExportColumns").addEventListener("click", () => {
    setDraft(selectedKeys);
    dialog.showModal();
    options.scrollTop = 0;
  });
  ["btnCloseExportColumns", "btnCancelExportColumns"].forEach(id => {
    $(id).addEventListener("click", () => dialog.close());
  });
  options.addEventListener("change", updateDraftSummary);
  $("btnSelectAllColumns").addEventListener("click", () => setDraft(EXPORT_COLUMNS.map(column => column.key)));
  $("btnClearColumns").addEventListener("click", () => setDraft([]));
  $("btnDefaultColumns").addEventListener("click", () => setDraft(DEFAULT_EXPORT_KEYS));
  $("export-columns-form").addEventListener("submit", event => {
    event.preventDefault();
    const keys = draftKeys();
    if (!keys.length) return;
    selectedKeys = new Set(keys);
    $("export-column-count").textContent = keys.length;
    dialog.close();
  });

  function exportRows(format) {
    const columns = EXPORT_COLUMNS.filter(column => selectedKeys.has(column.key));
    const data = getData();
    if (!columns.length) { notify("Selecione pelo menos uma coluna para exportar.", "warning"); return; }
    if (!data.length) { notify("Nenhum caso encontrado para exportar. Confira os filtros.", "info"); return; }
    const rows = [columns.map(column => column.label), ...data.map(record => columns.map(column => record[column.key] ?? ""))];
    if (format === "csv") {
      const csv = rows.map(row => row.map(cell => '"' + spreadsheetValue(cell).replace(/"/g, '""') + '"').join(";")).join("\r\n");
      download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "proteja_casos.csv");
    } else if (format === "xls") {
      const table = document.createElement("table");
      rows.forEach(values => {
        const row = table.insertRow();
        values.forEach(value => { row.insertCell().textContent = spreadsheetValue(value); });
      });
      download(new Blob(['<html><meta charset="UTF-8">' + table.outerHTML + "</html>"], { type: "application/vnd.ms-excel;charset=utf-8" }), "proteja_casos.xls");
    } else {
      if (!window.jspdf?.jsPDF) { notify("A exportação PDF está indisponível no momento.", "warning"); return; }
      const doc = new window.jspdf.jsPDF("l", "pt", "a4");
      if (typeof doc.autoTable !== "function") { notify("A exportação PDF está indisponível no momento.", "warning"); return; }
      const body = data.map(record => Object.fromEntries(columns.map(column => [column.key, String(record[column.key] ?? "")])));
      doc.autoTable({
        columns: columns.map(column => ({ header: column.label, dataKey: column.key })),
        body,
        startY: 64,
        margin: { top: 64, right: 40, bottom: 40, left: 40 },
        styles: { fontSize: 8, cellWidth: 100, overflow: "linebreak" },
        headStyles: { fillColor: [70, 88, 217] },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: selectedKeys.has("numeroProntuario") ? "numeroProntuario" : undefined,
        didDrawPage: () => {
          doc.setFontSize(13);
          doc.text("Relatório de casos - PROTEJA", 40, 30);
          doc.setFontSize(9);
          doc.text(data.length + " casos | " + columns.length + " colunas", 40, 46);
        }
      });
      doc.save("proteja_casos.pdf");
    }
  }

  ["CSV", "XLS", "PDF"].forEach(format => {
    $("btnExport" + format).addEventListener("click", () => {
      try { exportRows(format.toLowerCase()); }
      catch { notify("Não foi possível exportar. Tente novamente.", "danger"); }
    });
  });
}

