import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseIdentity, caseKey, hasDuplicate, caseReplacement } from '../case-save.js';
import { classifyPlans } from '../import-core.js';

test('equivalent numbers share an atomic creation target without rewriting the saved number', async () => {
  assert.equal(caseIdentity(' ０００５ '), '5');
  assert.equal(await caseKey('0005'), await caseKey('5'));
  assert.equal(await caseKey('teste-01'), await caseKey(' TESTE-01 '));
  assert.notEqual(await caseKey('5'), await caseKey('15'));
  const saved = new Map();
  const target = await caseKey('05');
  const create = number => { if (saved.has(target)) return false; saved.set(target, {numeroProntuario:number}); return true; };
  assert.deepEqual([create('05'),create('5')], [true,false]);
  assert.equal(saved.get(target).numeroProntuario, '05');
});

test('legacy IDs and numeric leading zeros are checked before creation', () => {
  const rows = [{key:'legacy-push',data:{numeroProntuario:'0005'}}];
  assert.equal(hasDuplicate(rows,'5'),true);
  assert.equal(hasDuplicate(rows,'5','legacy-push'),false);
  assert.equal(hasDuplicate(rows,'15'),false);
});

test('import preview recognizes equivalent existing numbers and rejects equivalent duplicates', () => {
  const plan=number=>({data:{numeroProntuario:number,dataEntrada:'2026-10-15'},sourceErrors:[]});
  const existing=classifyPlans([plan('0005')],[{numeroProntuario:'5'}]);
  assert.equal(existing[0].state,'existing');
  assert.equal(existing[0].data.numeroProntuario,'0005');
  const repeated=classifyPlans([plan('05'),plan('5')]);
  assert.ok(repeated.every(p=>p.state==='invalid'));
});

test('stale case form cannot replace another technician changes or a deleted case', () => {
  const expected = {numeroProntuario:'5',nomeCriad:'Pessoa fictícia',situacaoAtual:'ativo'};
  const newer = {...expected,situacaoAtual:'suspenso'};
  const patch = {...expected,nomeCriad:'Nome corrigido fictício'};
  assert.equal(caseReplacement(newer,expected,patch,Object.keys(expected)),undefined);
  assert.equal(caseReplacement(null,expected,patch,Object.keys(expected)),undefined);
  assert.equal(caseReplacement(expected,expected,{...patch,numeroProntuario:'6'},Object.keys(expected)),undefined);
});

test('saving the case keeps new agenda entries, imported data and original creation metadata', () => {
  const expected = {numeroProntuario:'5',nomeCriad:'Pessoa fictícia',criadoEm:'2026-01-01'};
  const current = {...expected,agenda_nova:'{"situacao":"agendado"}',dadosPlanilha:'{"origem":"teste"}'};
  const result=caseReplacement(current,expected,{numeroProntuario:'5',nomeCriad:'Outro nome fictício'},['numeroProntuario','nomeCriad']);
  assert.equal(result.agenda_nova,current.agenda_nova);
  assert.equal(result.dadosPlanilha,current.dadosPlanilha);
  assert.equal(result.criadoEm,expected.criadoEm);
});

test('display fallbacks cannot hide a concurrent change in raw saved fields', () => {
  const expected={numeroProntuario:'5',dadosPlanilha:'{"Tipo de violência":"Teste"}'};
  assert.ok(caseReplacement({...expected},expected,{numeroProntuario:'5',tipoViolencia:'Teste'},['numeroProntuario','tipoViolencia']));
  assert.equal(caseReplacement({...expected,tipoViolencia:'Outro'},expected,{numeroProntuario:'5',tipoViolencia:'Teste'},['numeroProntuario','tipoViolencia']),undefined);
});
