const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateCase,dateValid,caseKey}=require('../functions/service.cjs');
const valid={numeroProntuario:'001',dataEntrada:'2026-10-20'};
test('server validates calendar dates, leap years, audit attributes and field allowlists',()=>{
  for(const value of ['2026-99-99','2026-02-29','2026-04-31','bad'])assert.equal(dateValid(value),false);
  assert.equal(dateValid('2024-02-29'),true);
  assert.deepEqual(validateCase(valid),valid);
  for(const data of [{...valid,criadoPor:'forged'},{...valid,criadoEm:'1900'},{...valid,origemCadastro:'manual'},{...valid,dadosPlanilha:'{}'},{...valid,agenda_test:'{}'},{...valid,dataOficioEnc:'2026-02-30'}])assert.throws(()=>validateCase(data),{code:'invalid-argument'});
  assert.equal(validateCase({...valid,dadosPlanilha:'{}'},true).dadosPlanilha,'{}');
});
test('server identity matches the canonical manual/import identity',()=>{
  assert.equal(caseKey('001'),caseKey(' １ '));
  assert.notEqual(caseKey('1'),caseKey('2'));
});
