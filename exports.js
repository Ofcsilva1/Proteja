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
  { key: "atualizadoEm", label: "Atualizado em", group: "Histórico" },
  { key: "dadosPlanilha", label: "Colunas originais da planilha", group: "Importação" },
  { key: "historicoPlanilha", label: "Histórico da planilha", group: "Importação" },
  { key: "origemImportacao", label: "Origem da importação", group: "Importação" }
];

// Preserve the existing 13-column export unless the user changes the selection.
export const DEFAULT_EXPORT_KEYS = EXPORT_COLUMNS.slice(0, 13).map(column => column.key);

// Width bounds are PDF-only, in points. Dates, IDs and short answers need less
// space than names or narratives; CSV/XLS keep the original labels and values.
const PDF_WIDTHS = {
  numeroProntuario: [42, 62], dataEntrada: [46, 48], docOrigem: [50, 85],
  origemCaso: [55, 90], cor: [28, 44], situacaoAtual: [45, 76],
  nomeCriad: [60, 100], responsavelNome: [60, 100], responsavelCpf: [60, 66],
  comunicacaoViolencia: [50, 80], encaminhamentosSolicitados: [55, 88],
  datasTexto: [52, 88], tecnicosReferencia: [52, 94],
  retornoSolicitado: [32, 40], estudoCaso: [32, 40], piaElaborado: [32, 40],
  oficioViolencia: [50, 85], dataOficioEnc: [55, 88],
  criadoEm: [52, 80], atualizadoEm: [52, 80]
};

export function pdfColumnStyles(doc, columns, data) {
  const available = doc.internal.pageSize.getWidth() - 49;
  const widths = columns.map(column => {
    const [minimum, max] = PDF_WIDTHS[column.key] || [64, 130];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    const titleWidth = Math.max(...column.label.split(/\s+/).map(word => doc.getTextWidth(word))) + 6;
    const min = Math.max(minimum, Math.min(titleWidth, max));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    let width = min;
    for (const record of data) {
      // Stop measuring once this column has reached its useful maximum.
      if (width >= max) break;
      const lines = String(record[column.key] ?? "").slice(0, 250).split(/\r?\n/);
      width = Math.min(max, Math.max(width, ...lines.map(line => doc.getTextWidth(line) + 6)));
    }
    return { key: column.key, min, width };
  });
  const minimum = widths.reduce((sum, column) => sum + column.min, 0);
  const preferred = widths.reduce((sum, column) => sum + column.width, 0);
  // Fit the selected columns when possible, reducing only spare width above
  // the readable minimum. Wider selections still use horizontal page breaks.
  const ratio = preferred > available && minimum <= available
    ? (available - minimum) / (preferred - minimum)
    : 1;
  return Object.fromEntries(widths.map(column => [
    column.key, { cellWidth: column.min + (column.width - column.min) * ratio }
  ]));
}

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
      const columnStyles = pdfColumnStyles(doc, columns, data);
      doc.autoTable({
        columns: columns.map(column => ({ header: column.label, dataKey: column.key })),
        body,
        startY: 64,
        margin: { top: 64, right: 24, bottom: 32, left: 24 },
        tableWidth: "wrap",
        theme: "grid",
        tableLineWidth: 0.3,
        tableLineColor: [171, 182, 200],
        columnStyles,
        styles: { fontSize: 7.4, cellPadding: 3, overflow: "linebreak", valign: "top", lineWidth: 0.25, lineColor: [171, 182, 200] },
        alternateRowStyles: { fillColor: [246, 248, 252] },
        headStyles: { fontSize: 6.6, cellPadding: { top: 4, right: 3, bottom: 4, left: 3 }, fillColor: [70, 88, 217], lineColor: [118, 130, 224] },
        // AutoTable 3.x otherwise applies columnStyles only to body cells.
        didParseCell: ({ cell, column }) => { cell.styles.cellWidth = columnStyles[column.dataKey].cellWidth; },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: selectedKeys.has("numeroProntuario") ? "numeroProntuario" : undefined,
        didDrawPage: () => {
          doc.setFontSize(13);
          doc.text("Relatório de casos - PROTEJA", 24, 30);
          doc.setFontSize(9);
          doc.text(data.length + " casos | " + columns.length + " colunas", 24, 46);
          doc.setFontSize(7);
          doc.text("Página " + doc.internal.getCurrentPageInfo().pageNumber, doc.internal.pageSize.getWidth() - 24, doc.internal.pageSize.getHeight() - 14, { align: "right" });
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

