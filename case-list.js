import { dateValue } from './import-core.js';

const text = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
export function availableYears(cases) {
  return [...new Set(cases.map(({ data }) => dateValue(data.dataEntrada).slice(0, 4)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
}
export function matchesEntryPeriod(data, month = '', year = '') {
  if (!month && !year) return true;
  const date = dateValue(data.dataEntrada);
  return Boolean(date) && (!month || Number(date.slice(5, 7)) === Number(month)) && (!year || date.slice(0, 4) === String(year));
}
// Search equivalence only: never rewrite stored identifiers or import keys.
const searchNumber = value => {
  const normalized = text(value);
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, '') : normalized;
};
export const exactProntuario = (value, query) => searchNumber(value) === searchNumber(query);
export function matchesGeneralSearch(data, query) {
  const normalized = text(query);
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return exactProntuario(data.numeroProntuario, normalized);
  return [data.numeroProntuario, data.nomeCriad, data.responsavelNome, data.tecnicosReferencia, data.datasTexto]
    .some(value => text(value).includes(normalized));
}
const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const byNumber = (a, b) => natural.compare(String(a.data.numeroProntuario ?? ''), String(b.data.numeroProntuario ?? ''))
  || text(a.data.numeroProntuario).localeCompare(text(b.data.numeroProntuario), 'pt-BR')
  || String(a.key).localeCompare(String(b.key));
export function sortCases(cases, order = 'recentes') {
  return [...cases].sort((a, b) => {
    if (order === 'numero_crescente') return byNumber(a, b);
    if (order === 'numero_decrescente') return byNumber(b, a);
    const left = dateValue(a.data.dataEntrada), right = dateValue(b.data.dataEntrada);
    // Missing/invalid dates stay last in either direction.
    if (!left && right) return 1;
    if (left && !right) return -1;
    const direction = order === 'antigos' ? 1 : -1;
    return direction * left.localeCompare(right) || byNumber(a, b);
  });
}
