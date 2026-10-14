// Pure conversion: no network, storage, HTML or spreadsheet evaluation.
export const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
export const identity = value => String(value ?? '').normalize('NFKC').trim().toUpperCase();
export function readableSnapshot(value) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(row => Object.entries(row).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`).join('\n')).join('\n\n');
  } catch { return String(value); }
}
export const STATUS = {
  ativo: 'Ativo', suspenso: 'Suspenso', encerrado_com_protecao: 'Encerrado com proteção',
  encerrado_sem_protecao: 'Encerrado sem proteção', nao_competencia: 'Não é competência'
};
export function statusValue(value) {
  const n = normalize(value);
  if (!n) return '';
  if (Object.hasOwn(STATUS, n)) return n;
  if (n === 'ativo' || n === 'suspenso') return n;
  if (n.startsWith('encerrado com protecao')) return 'encerrado_com_protecao';
  if (n.startsWith('encerrado sem protecao')) return 'encerrado_sem_protecao';
  if (n.startsWith('nao e competencia')) return 'nao_competencia';
  return null;
}
export function dateValue(value) {
  const text = String(value ?? '').trim();
  let parts = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!parts) {
    const br = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (br) parts = [br[0], br[3], br[2].padStart(2, '0'), br[1].padStart(2, '0')];
  }
  if (!parts) return '';
  const iso = `${parts[1]}-${parts[2]}-${parts[3]}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}
const FIELD_HEADERS = {
  docOrigem: ['Documento de origem (se houver)'], origemCaso: ['Origem do caso recebido no PROTEJA'],
  cor: ['COR'], detalheOrigem: ['Detalhamento da origem que encaminhou a demanda'],
  detalheSituacao: ['Detalhamento da situação'], nomeCriad: ['Nome da CRIAD'],
  comunicacaoViolencia: ['Comunicação da Violência pelo PROTEJA'],
  oficioViolencia: ['Data e nº do ofício de comunicação da violência'],
  encaminhamentosSolicitados: ['Encaminhamentos solicitados pelo PROTEJA (referência/ contrarreferência)'],
  detalheEncaminhamento: ['Detalhamento encaminhamento solicitado pelo PROTEJA'],
  retornoSolicitado: ['Houve retorno do encaminhamento solicitado pelo PROTEJA?'],
  infoRetorno: ['Informações sobre o retorno solicitado'], estudoCaso: ['Estudo de Caso (EC) elaborado?'],
  piaElaborado: ['Plano Indivividual de Atendimento elaborado?', 'Plano Individual de Atendimento elaborado?'],
  outrasPendencias: ['Outras pendências'], datasTexto: ['Datas de atendimentos realizados (agrupar por mês)'],
  tecnicosReferencia: ['Técnicos de referência']
};
const pick = (row, ...names) => {
  for (const name of names) {
    const key = Object.keys(row).find(key => normalize(key) === normalize(name));
    if (key !== undefined) return String(row[key] ?? '').trim();
  }
  return '';
};
export function validateRecord(data, sourceErrors = []) {
  const errors = [...sourceErrors];
  if (!data.numeroProntuario?.trim()) errors.push('Informe o número do prontuário.');
  if ((data.numeroProntuario || '').length > 100) errors.push('Prontuário excede 100 caracteres.');
  if (!dateValue(data.dataEntrada)) errors.push('Corrija a data de entrada (dia, mês e ano).');
  if (data.situacaoAtual && !Object.hasOwn(STATUS, data.situacaoAtual)) errors.push('Selecione uma situação válida.');
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || value.length > 20000) errors.push(`Campo ${key} excede o limite ou tem tipo inválido. Nenhum conteúdo foi cortado.`);
  }
  return errors;
}
export function prepareImport(book) {
  const primary = book.sheets.find(sheet => normalize(sheet.name) === 'casos');
  if (!primary || !primary.headers.some(h => normalize(h) === 'prontuario') || !primary.headers.some(h => normalize(h) === 'entrada no proteja')) {
    throw new Error('Selecione a planilha otimizada, com a aba Casos e as colunas Prontuário e Entrada no PROTEJA. A planilha antiga precisa ser otimizada primeiro.');
  }
  const history = book.sheets.find(s => normalize(s.name) === 'historico');
  const withoutNumber = book.sheets.find(s => normalize(s.name) === 'sem prontuario');
  const histories = new Map();
  for (const row of history?.rows || []) {
    const id = identity(pick(row.values, 'Prontuário'));
    if (!histories.has(id)) histories.set(id, []);
    histories.get(id).push(row);
  }
  const matched = new Set();
  const rows = [...primary.rows.map(row => ({ ...row, sheet: primary.name })), ...(withoutNumber?.rows || []).map(row => ({ ...row, sheet: withoutNumber.name }))];
  const plans = rows.map(row => {
    const values = row.values;
    const data = { numeroProntuario: pick(values, 'Prontuário'), dataEntrada: dateValue(pick(values, 'Entrada no PROTEJA')) };
    for (const [key, headers] of Object.entries(FIELD_HEADERS)) {
      const value = pick(values, ...headers);
      if (value) data[key] = value;
    }
    const status = statusValue(pick(values, 'Status no Proteja'));
    if (status !== '') data.situacaoAtual = status ?? '__revisar__';
    for (const key of ['retornoSolicitado', 'estudoCaso', 'piaElaborado']) {
      if (['sim', 'nao'].includes(normalize(data[key]))) data[key] = normalize(data[key]);
    }
    const color = normalize(data.cor).replace(/\(a\)/g, '');
    if (['pardo', 'branco', 'preto', 'indigena', 'amarelo'].includes(color)) data.cor = color;
    if (['nao informado', 'nao declarado'].includes(color)) data.cor = 'nao_informado';
    const responsible = pick(values, 'Nome e CPF do(a) Responsável');
    const cpf = responsible.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g) || [];
    // Split only an unambiguous single CPF; always retain the original column.
    if (responsible) data.responsavelNome = cpf.length === 1 ? responsible.replace(cpf[0], '').replace(/^[\s,;\-/]+|[\s,;\-/]+$/g, '') : responsible;
    if (cpf.length === 1) data.responsavelCpf = cpf[0];
    const id = identity(data.numeroProntuario);
    const linked = id ? histories.get(id) || [] : [];
    if (linked.length) {
      matched.add(id);
      data.historicoPlanilha = JSON.stringify(linked.map(h => ({ linha: h.row, ...h.values })));
      data.datasTexto = [data.datasTexto, ...linked.map(h => [pick(h.values, 'Mês informado'), pick(h.values, 'Relato / datas informadas')].filter(Boolean).join(': '))].filter(Boolean).join('\n\n');
    }
    data.dadosPlanilha = JSON.stringify(values);
    data.origemImportacao = `${row.sheet}, linha ${row.row}`;
    const sourceErrors = [...(row.errors || []), ...linked.flatMap(h => h.errors || [])];
    return { sheet: row.sheet, row: row.row, data, sourceErrors, errors: validateRecord(data, sourceErrors) };
  });
  const unmatchedHistory = [...histories].filter(([id]) => !matched.has(id)).flatMap(([, rows]) => rows.map(h => ({ sheet: history.name, row: h.row, message: 'Histórico sem prontuário correspondente na aba Casos. Não importado.' })));
  return { plans, unmatchedHistory };
}
export function classifyPlans(plans, existing = []) {
  const known = new Set(existing.map(row => identity(row?.numeroProntuario)).filter(Boolean));
  const counts = new Map();
  for (const plan of plans) {
    const id = identity(plan.data.numeroProntuario);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return plans.map(plan => {
    const id = identity(plan.data.numeroProntuario);
    const errors = validateRecord(plan.data, plan.sourceErrors);
    if (id && counts.get(id) > 1) errors.push('Prontuário repetido na planilha. Corrija antes de importar.');
    return { ...plan, errors, state: known.has(id) ? 'existing' : errors.length ? 'invalid' : 'ready' };
  });
}
