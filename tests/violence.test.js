import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViolenceData, matchesViolence, violenceOptions, violenceTags } from '../violence.js';
import { prepareImport } from '../import-core.js';
test('reads violence from previous imports without changing the source record', () => {
  const original = { 'Tipo de violência': '', Sexual: 'Violência Sexual (Abuso)', Outros: 'Violência Física' };
  const record = { numeroProntuario: '1', dadosPlanilha: JSON.stringify(original) };
  const data = resolveViolenceData(record);
  assert.equal(data.violenciaSexual, original.Sexual); assert.equal(data.outrasViolencias, original.Outros);
  assert.equal(Object.hasOwn(record, 'violenciaSexual'), false);
  assert.equal(matchesViolence(record, 'sexual', 'abuso'), true);
  assert.equal(matchesViolence(record, 'fisica'), true);
  assert.deepEqual(JSON.parse(record.dadosPlanilha), original);
});
test('explicitly edited or cleared fields override the original spreadsheet', () => {
  const record = { dadosPlanilha: JSON.stringify({ Sexual:'Violência Sexual (Abuso)', Outros:'Violência Física' }), violenciaSexual:'', outrasViolencias:'Negligência' };
  assert.equal(matchesViolence(record, 'sexual'), false);
  assert.equal(matchesViolence(record, 'fisica'), false);
  assert.equal(matchesViolence(record, 'negligencia'), true);
});
test('multiple violences match independently without duplicating the record', () => {
  const record = { tipoViolencia:'Violência Física; Violência Psicológica; Violência Física', violenciaSexual:'Violência Sexual (Exploração); Violência Sexual (Importunação)' };
  assert.equal(matchesViolence(record,'fisica'),true); assert.equal(matchesViolence(record,'psicologica'),true);
  assert.equal(matchesViolence(record,'sexual','exploracao'),true); assert.equal(matchesViolence(record,'sexual','abuso'),false);
  assert.equal(violenceTags(record).types.size,3);
  assert.equal([record].filter(r=>matchesViolence(r,'fisica')).length,1);
});
test('handles sheet spelling variants, unknown options and malformed snapshots', () => {
  assert.equal(matchesViolence({outrasViolencias:'Violência Psicologica'},'psicologica'),true);
  assert.equal(matchesViolence({tipoViolencia:'Testemunha de violêcncia'},'testemunha'),true);
  assert.equal(matchesViolence({tipoViolencia:'Bullying no ambiente escolar'},'bullying'),true);
  const options = violenceOptions([{data:{tipoViolencia:'Categoria personalizada', violenciaSexual:'Subtipo personalizado'}}]);
  assert.ok(options.types.some(([id])=>id==='outro:categoria personalizada'));
  assert.ok(options.subtypes.some(([id])=>id==='outro:subtipo personalizado'));
  assert.equal(matchesViolence({dadosPlanilha:'not json'},'sem_informacao'),true);
  assert.equal(matchesViolence({dadosPlanilha:'null'},'sem_informacao'),true);
  assert.equal(matchesViolence({outrasViolencias:'Não Identificada'},'nao_identificada'),true);
  assert.equal(matchesViolence({outrasViolencias:'Não Identificada'},'sem_informacao'),false);
});
test('does not infer violence from narratives, names or communication fields', () => {
  assert.equal(matchesViolence({detalheOrigem:'Relato com a palavra física',comunicacaoViolencia:'Comunicação ao CT'},'fisica'),false);
  assert.equal(matchesViolence({violenciaSexual:'Não informado'},'sexual'),false);
});
test('new imports map all three violence columns while preserving original values', () => {
  const values = {'Prontuário':'0001','Entrada no PROTEJA':'2026-01-01','Tipo de violência':'Violência Sexual',Sexual:'Violência Sexual (Abuso)',Outros:'Violência Física'};
  const {plans} = prepareImport({sheets:[{name:'Casos',headers:['Prontuário','Entrada no PROTEJA'],rows:[{row:6,values}]}]});
  assert.equal(plans[0].data.tipoViolencia,values['Tipo de violência']);
  assert.equal(plans[0].data.violenciaSexual,values.Sexual); assert.equal(plans[0].data.outrasViolencias,values.Outros);
  assert.deepEqual(JSON.parse(plans[0].data.dadosPlanilha),values);
});
