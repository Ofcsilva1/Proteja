import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareImport, classifyPlans, dateValue, statusValue, identity, readableSnapshot } from '../import-core.js';

// Synthetic data only. Never copy operational spreadsheets into the repository.
const values = (overrides = {}) => ({ 'Prontuário': '000123', 'Entrada no PROTEJA': '15/02/2026', 'Status no Proteja': 'Ativo', 'Nome da CRIAD': 'Pessoa fictícia', ...overrides });
const row = (v, line = 6) => ({ row: line, values: v, errors: [] });
const book = (rows, history = [], missing = []) => ({ sheets: [
  { name: 'Casos', headers: ['Prontuário', 'Entrada no PROTEJA'], rows },
  { name: 'Histórico', rows: history }, { name: 'Sem prontuário', rows: missing }
] });
test('validates calendar dates without guessing or rolling invalid days forward', () => {
  assert.equal(dateValue('29/02/2024'), '2024-02-29');
  assert.equal(dateValue('29/02/2026'), ''); assert.equal(dateValue('31/04/2026'), '');
  assert.equal(dateValue('01/02/26'), ''); assert.equal(dateValue('2026-02-15'), '2026-02-15');
});
test('normalizes the five supported status categories and rejects unknown values', () => {
  assert.equal(statusValue('Encerrado com proteção efetivada'), 'encerrado_com_protecao');
  assert.equal(statusValue('Encerrado sem proteção efetivada'), 'encerrado_sem_protecao');
  assert.equal(statusValue('Não é competência do PROTEJA (encaminhado a outro órgão da rede)'), 'nao_competencia');
  assert.equal(statusValue('Suspenso'), 'suspenso'); assert.equal(statusValue(''), '');
  assert.equal(statusValue('Outro valor'), null);
});
test('preserves all original columns, CPF leading zeros and unmatched vocabulary', () => {
  const original = values({ 'Nome e CPF do(a) Responsável': 'Pessoa fictícia / 001.234.567-89', 'Sexo': 'Valor original', 'Origem do caso recebido no PROTEJA': 'Origem legada' });
  const { plans } = prepareImport(book([row(original)]));
  assert.equal(plans[0].data.numeroProntuario, '000123');
  assert.equal(plans[0].data.responsavelCpf, '001.234.567-89');
  assert.equal(plans[0].data.responsavelNome, 'Pessoa fictícia');
  assert.equal(plans[0].data.origemCaso, 'Origem legada');
  assert.deepEqual(JSON.parse(plans[0].data.dadosPlanilha), original);
  assert.equal(classifyPlans(plans)[0].state, 'ready');
});
test('does not invent dates, identifiers or statuses for incomplete records', () => {
  const { plans } = prepareImport(book([row(values({ 'Entrada no PROTEJA': '', 'Status no Proteja': '' }))], [], [row(values({ 'Prontuário': '' }))]));
  const result = classifyPlans(plans); assert.ok(result.every(p => p.state === 'invalid'));
  assert.equal(result[0].data.situacaoAtual, undefined); assert.equal(result[1].data.numeroProntuario, '');
});
test('links every history row by identifier and reports orphan histories', () => {
  const history = [row({ 'Prontuário': '000123', 'Mês informado': 'Fevereiro', 'Relato / datas informadas': 'Relato fictício', 'Técnicos informados': 'Equipe fictícia' }), row({ 'Prontuário': '000123', 'Relato / datas informadas': 'Segundo relato fictício' }, 7), row({ 'Prontuário': 'ORFAO', 'Relato / datas informadas': 'Não vinculado' }, 8)];
  const result = prepareImport(book([row(values())], history));
  assert.equal(JSON.parse(result.plans[0].data.historicoPlanilha).length, 2);
  assert.match(result.plans[0].data.datasTexto, /Segundo relato/);
  assert.equal(result.unmatchedHistory.length, 1); assert.equal(result.unmatchedHistory[0].row, 8);
});
test('blocks every repeated identifier in the file and skips existing records', () => {
  const { plans } = prepareImport(book([row(values()), row(values(), 7), row(values({ 'Prontuário': 'OTHER' }), 8)]));
  assert.deepEqual(classifyPlans(plans, [{ numeroProntuario: ' other ' }]).map(p => p.state), ['invalid', 'invalid', 'existing']);
  assert.notEqual(identity('001'), identity('1'));
  assert.equal(classifyPlans(prepareImport(book([row(values())])).plans, [null, 'metadata', {}])[0].state, 'ready');
});
test('can correct missing prerequisites in the preview without changing source evidence', () => {
  const { plans } = prepareImport(book([row(values({ 'Entrada no PROTEJA': 'Data desconhecida' }))]));
  plans[0].data.dataEntrada = '2026-02-15';
  assert.equal(classifyPlans(plans)[0].state, 'ready');
  assert.equal(JSON.parse(plans[0].data.dadosPlanilha)['Entrada no PROTEJA'], 'Data desconhecida');
});
test('never truncates oversized content or ignores spreadsheet formula errors', () => {
  const { plans } = prepareImport(book([row(values({ 'Outras pendências': 'x'.repeat(20001) })), { ...row(values({ 'Prontuário': 'SECOND' }), 7), errors: ['Erro na fórmula'] }]));
  assert.ok(classifyPlans(plans).every(p => p.state === 'invalid'));
  assert.equal(plans[0].data.outrasPendencias.length, 20001);
});
test('prepares 500 cases and formats original information for exports', () => {
  const input = Array.from({ length: 500 }, (_, i) => row(values({ 'Prontuário': String(i).padStart(6, '0') }), i + 6));
  const { plans } = prepareImport(book(input)); assert.equal(classifyPlans(plans).filter(p => p.state === 'ready').length, 500);
  assert.match(readableSnapshot(plans[0].data.dadosPlanilha), /Prontuário: 000000/);
});
test('rejects the original workbook instead of importing duplicated original tabs', () => {
  assert.throws(() => prepareImport({ sheets: [{ name: 'Controle Geral', rows: [] }] }), /planilha otimizada/);
});
