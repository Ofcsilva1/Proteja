import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identityFields,validateInput,auditFor,casesWithActivities} from '../spark-policy.js';
test('canonical identity retains numeric spelling and rejects unsupported new identifiers',()=>{
  assert.deepEqual(identityFields('0001'),{identidade:'1',prefixoNumerico:'000'});
  assert.deepEqual(identityFields('ab-01'),{identidade:'AB-01',prefixoNumerico:''});
  for(const id of ['1/2','a.b','１','   '])assert.throws(()=>identityFields(id));
});
test('input calendar rejects rollover and the client cannot prepare privileged fields',()=>{
  const data={numeroProntuario:'1',dataEntrada:'2024-02-29'};assert.doesNotThrow(()=>validateInput(data));
  for(const date of ['2026-99-99','2026-02-29','1900-02-29'])assert.throws(()=>validateInput({...data,dataEntrada:date}));
  for(const key of ['auditoria','criadoPor','origemCadastro','dadosPlanilha'])assert.throws(()=>validateInput({...data,[key]:'forged'}));
});
test('legacy audit preparation never certifies its creation and structured activities merge for display',()=>{
  const audit=auditFor(null,'uid',123,true);assert.equal(audit.criacaoVerificada,false);assert.equal(audit.criadoPor,'desconhecido');
  const event={schema:1,kind:'tarefas',auditoria:auditFor(null,'uid',123)};
  const rows=casesWithActivities([{key:'k',rawData:{},data:{agenda_legada:'raw'}}],{k:{pendencia_x:event}});
  assert.equal(JSON.parse(rows[0].data.pendencia_x).revisao,1);assert.equal(rows[0].data.agenda_legada,'raw');
});
