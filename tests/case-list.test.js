import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactProntuario, matchesGeneralSearch, sortCases, availableYears, matchesEntryPeriod } from '../case-list.js';
const row = (number, date = '2026-01-01') => ({ key: String(number), data: { numeroProntuario: String(number), dataEntrada: date } });
const numbers = cases => cases.map(c => c.data.numeroProntuario);
test('exact numeric search equates leading zeros without matching substrings', () => {
  const data = ['1', '5', '15', '101', '212', '218', '219', '217', '2201'];
  assert.deepEqual(data.filter(n => exactProntuario(n, '01')), ['1']);
  assert.deepEqual(data.filter(n => exactProntuario(n, '05')), ['5']);
  assert.deepEqual(data.filter(n => exactProntuario(n, '1')), ['1']);
  assert.equal(exactProntuario('000', '0'), true);
  assert.equal(exactProntuario('123456789012345678901', '0123456789012345678901'), true);
});
test('alphanumeric identifiers remain exact and numbers in general search are exact too', () => {
  assert.equal(exactProntuario(' A-01 ', 'a-01'), true);
  assert.equal(exactProntuario('A-01', 'A-1'), false);
  assert.equal(matchesGeneralSearch({numeroProntuario:'101',nomeCriad:'Pessoa 1'}, '01'), false);
  assert.equal(matchesGeneralSearch({numeroProntuario:'1'}, '01'), true);
  assert.equal(matchesGeneralSearch({nomeCriad:'Pessoa fictícia'}, 'fictícia'), true);
  assert.equal(matchesGeneralSearch({tecnicosReferencia:'Equipe fictícia'}, 'equipe'), true);
});
test('sorts identifiers naturally rather than alphabetically and leaves source intact', () => {
  const input = [row(10), row(2), row(1), row(101)];
  assert.deepEqual(numbers(sortCases(input, 'numero_crescente')), ['1', '2', '10', '101']);
  assert.deepEqual(numbers(sortCases(input, 'numero_decrescente')), ['101', '10', '2', '1']);
  assert.deepEqual(numbers(input), ['10', '2', '1', '101']);
});
test('sorts oldest/newest entry and keeps missing or invalid dates last', () => {
  const input = [row(5,''),row(3,'2026-03-01'),row(1,'2024-01-01'),row(2,'2025-01-01'),row(6,'2026-02-30')];
  assert.deepEqual(numbers(sortCases(input,'antigos')), ['1','2','3','5','6']);
  assert.deepEqual(numbers(sortCases(input,'recentes')), ['3','2','1','5','6']);
  assert.deepEqual(numbers(sortCases(input,'unknown')), numbers(sortCases(input,'recentes')));
});
test('uses natural number order to resolve ties in entry dates', () => {
  assert.deepEqual(numbers(sortCases([row(10),row(2),row(1)])), ['1','2','10']);
});
test('year options use all valid entry dates, deduplicated and newest first', () => {
  assert.deepEqual(availableYears([row(1,'2024-01-01'),row(2,'2026-01-01'),row(3,'2025-01-01'),row(4,'2024-02-01'),row(5,''),row(6,'2027-02-30')]),['2026','2025','2024']);
  assert.deepEqual(availableYears([]),[]);
});
test('month and year combine independently without timezone conversion', () => {
  const data={dataEntrada:'2025-01-01'};
  assert.equal(matchesEntryPeriod(data,'1','2025'),true);
  assert.equal(matchesEntryPeriod(data,'1','2024'),false);
  assert.equal(matchesEntryPeriod(data,'2','2025'),false);
  assert.equal(matchesEntryPeriod(data,'','2025'),true);
  assert.equal(matchesEntryPeriod(data,'1',''),true);
});
test('records without a valid date remain available only without a period filter', () => {
  for (const dataEntrada of ['',undefined,'2026-02-30']) {
    assert.equal(matchesEntryPeriod({dataEntrada}),true);
    assert.equal(matchesEntryPeriod({dataEntrada},'','2026'),false);
    assert.equal(matchesEntryPeriod({dataEntrada},'1',''),false);
  }
});
