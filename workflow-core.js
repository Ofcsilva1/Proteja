import { dateValue } from './import-core.js';
import { exactProntuario } from './case-list.js';

export const APPOINTMENT_STATUS = { agendado: 'Agendado', realizado: 'Realizado', nao_compareceu: 'Não compareceu', cancelado: 'Cancelado' };
export const TASK_STATUS = { aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
export const APPOINTMENT_TYPES = ['Atenção inicial', 'Atendimento psicossocial', 'Orientação jurídico-social', 'Retorno', 'Outro'];
export const TASK_TYPES = ['Documento', 'Retorno de encaminhamento', 'Contato com responsável', 'Outra'];
export const PREFIX = { agenda: 'agenda_', tarefas: 'pendencia_' };
export const strictDate = value => typeof value === 'string' && dateValue(value) === value && /^\d{4}-\d{2}-\d{2}$/.test(value);
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function validateActivity(kind, data) {
  const errors = [];
  if (!Object.hasOwn(PREFIX, kind)) return ['Tipo de registro inválido.'];
  const required = (key, label, max) => {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > max) errors.push(`${label}: preencha até ${max} caracteres.`);
  };
  required('responsavel', 'Responsável', 120);
  if (typeof data.observacao !== 'string' || data.observacao.length > 4000) errors.push('Observação: use até 4.000 caracteres.');
  const statuses = kind === 'agenda' ? APPOINTMENT_STATUS : TASK_STATUS;
  if (!Object.hasOwn(statuses, data.situacao)) errors.push('Selecione uma situação válida.');
  const types = kind === 'agenda' ? APPOINTMENT_TYPES : TASK_TYPES;
  if (!types.includes(data.tipo)) errors.push('Selecione um tipo válido.');
  if (kind === 'agenda') {
    if (!strictDate(data.data)) errors.push('Escolha uma data válida para o atendimento.');
    if (typeof data.hora !== 'string' || (data.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.hora))) errors.push('Informe um horário válido.');
  } else {
    required('descricao', 'Pendência', 240);
    if (typeof data.prazo !== 'string' || (data.prazo && !strictDate(data.prazo))) errors.push('Escolha um prazo válido ou deixe sem prazo.');
    if (!['normal', 'alta'].includes(data.prioridade)) errors.push('Selecione uma prioridade válida.');
  }
  const done = data.situacao === (kind === 'agenda' ? 'realizado' : 'concluida');
  if (typeof data.dataConclusao !== 'string' || (done && !strictDate(data.dataConclusao)) || (data.dataConclusao && !strictDate(data.dataConclusao))) errors.push('Informe a data real de realização/conclusão.');
  return errors;
}
export function parseActivity(kind, value) {
  try {
    if (typeof value !== 'string' || value.length > 20000) return null;
    const data = JSON.parse(value);
    if (!data || data.schema !== 1 || data.kind !== kind || !Number.isSafeInteger(data.revisao) || data.revisao < 1) return null;
    if (validateActivity(kind, data).length) return null;
    return data;
  } catch { return null; }
}
export function collectActivities(cases, kind) {
  const items = []; let invalid = 0;
  for (const record of cases) {
    for (const [field, value] of Object.entries(record.data)) {
      if (!field.startsWith(PREFIX[kind])) continue;
      const activity = parseActivity(kind, value);
      if (activity) items.push({ caseKey: record.key, caseData: record.data, field, activity, original: value });
      else invalid++;
    }
  }
  return { items, invalid };
}
export function isLate(kind, activity, today = todayISO()) {
  return kind === 'agenda' ? activity.situacao === 'agendado' && activity.data < today
    : ['aberta', 'em_andamento'].includes(activity.situacao) && Boolean(activity.prazo) && activity.prazo < today;
}
export function filterActivities(items, kind, filters, today = todayISO()) {
  return items.filter(item => {
    const data = item.activity, date = kind === 'agenda' ? data.data : data.prazo;
    if (filters.caseKey && filters.caseKey !== item.caseKey) return false;
    if (filters.numero && !exactProntuario(item.caseData.numeroProntuario, filters.numero)) return false;
    if (filters.responsavel && !data.responsavel.toLocaleLowerCase('pt-BR').includes(filters.responsavel.trim().toLocaleLowerCase('pt-BR'))) return false;
    if (filters.situacao && data.situacao !== filters.situacao) return false;
    if (filters.de && (!date || date < filters.de)) return false;
    if (filters.ate && (!date || date > filters.ate)) return false;
    if (filters.periodo === 'hoje' && date !== today) return false;
    if (filters.periodo === 'semana' && (!date || date < today || date > addDays(today, 6))) return false;
    if (filters.periodo === 'atrasados' && !isLate(kind, data, today)) return false;
    if (filters.periodo === 'sem_prazo' && date) return false;
    return true;
  }).sort((a, b) => {
    const ad = kind === 'agenda' ? a.activity.data : a.activity.prazo;
    const bd = kind === 'agenda' ? b.activity.data : b.activity.prazo;
    if (!ad && bd) return 1; if (ad && !bd) return -1;
    return ad.localeCompare(bd) || (a.activity.hora || '99:99').localeCompare(b.activity.hora || '99:99') || a.field.localeCompare(b.field);
  });
}
export function buildActivity(kind, values, previous, uid, now = new Date().toISOString()) {
  const clean = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  const done = clean.situacao === (kind === 'agenda' ? 'realizado' : 'concluida');
  if (!done) clean.dataConclusao = '';
  const errors = validateActivity(kind, clean);
  if (errors.length) throw new Error(errors.join(' '));
  const data = { ...previous, ...clean, schema: 1, kind, revisao: (previous?.revisao || 0) + 1,
    criadoEm: previous?.criadoEm || now, criadoPor: previous?.criadoPor || uid, atualizadoEm: now, atualizadoPor: uid };
  const value = JSON.stringify(data);
  if (value.length > 20000) throw new Error('O registro excede o limite de tamanho. Nenhum conteúdo foi cortado.');
  return value;
}
// Compare the complete prior value, not only the revision: never overwrite a stale edit.
export function replacementFor(current, expected, next) {
  return current === expected ? next : undefined;
}
export function activityText(record, kind) {
  const statuses = kind === 'agenda' ? APPOINTMENT_STATUS : TASK_STATUS;
  return collectActivities([record],kind).items.map(({activity:d}) => [
    kind === 'agenda' ? `Data prevista: ${d.data}${d.hora?' '+d.hora:''}` : `Pendência: ${d.descricao}\nPrazo: ${d.prazo||'Sem prazo'}\nPrioridade: ${d.prioridade==='alta'?'Alta':'Normal'}`,
    `Responsável: ${d.responsavel}`, `Tipo: ${d.tipo}`, `Situação: ${statuses[d.situacao]}`,
    d.dataConclusao ? `Realização/conclusão: ${d.dataConclusao}` : '', d.observacao
  ].filter(Boolean).join('\n')).join('\n\n');
}
export function attendanceSummary(record, today = todayISO()) {
  const {items,invalid}=collectActivities([record],'agenda');
  const next=filterActivities(items,'agenda',{situacao:'agendado',de:today},today)[0]?.activity;
  const parts=[];
  if(items.length)parts.push(`${items.length} registro(s) na agenda`);
  if(next)parts.push(`Próximo: ${next.data.slice(8,10)}/${next.data.slice(5,7)}/${next.data.slice(0,4)}${next.hora?' às '+next.hora:''}`);
  else if(items.some(item=>isLate('agenda',item.activity,today)))parts.push('Data passada: conferir na agenda');
  if(String(record.data.datasTexto||'').trim())parts.push('Histórico anterior disponível');
  if(invalid)parts.push('Há registros que precisam de conferência');
  return parts.join(' · ') || 'Sem atendimento registrado';
}
