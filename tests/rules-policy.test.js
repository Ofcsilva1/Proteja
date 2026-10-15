import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rules=JSON.parse(fs.readFileSync(new URL('../database.rules.example.json',import.meta.url),'utf8')).rules;
// Regression checks of the policy expressions only, not a Firebase emulator.
const snapshot=value=>({val:()=>value??null,exists:()=>value!==undefined&&value!==null,isString:()=>typeof value==='string',hasChildren:keys=>keys.every(k=>value?.[k]!==undefined&&value?.[k]!==null),child:key=>snapshot(value?.[key])});
const evaluate=(expression,{role='tecnico',active=true,old=null,next={numeroProntuario:'5',dataEntrada:'2026-10-15'},key='case_test',signed=true}={})=>new Function('auth','root','data','newData','$caseId','return ('+expression+')')(
  signed?{uid:'test-user'}:null,snapshot({access:{'test-user':{role,active}}}),snapshot(old),snapshot(next),{matches:regex=>regex.test(key)});

test('example denies raw cases to consultation, inactive, unknown and anonymous profiles',()=>{
  for(const args of [{role:'consulta'},{active:false},{role:'inventado'},{signed:false}])assert.equal(evaluate(rules.casos['.read'],args),false);
  for(const role of ['administrador','coordenador','tecnico'])assert.equal(evaluate(rules.casos['.read'],{role}),true);
  assert.equal(rules.access.$uid['.write'],false);
});

test('professionals can update imported legacy cases but only admin creates imports',()=>{
  const expression=rules.casos.$caseId['.write'];
  const key='import_'+'a'.repeat(64),old={numeroProntuario:'5',dataEntrada:'2026-10-15'};
  for(const role of ['coordenador','tecnico']){
    assert.equal(evaluate(expression,{role,key,old}),true);
    assert.equal(evaluate(expression,{role,key}),false);
    assert.equal(evaluate(expression,{role,next:{...old,origemCadastro:'planilha'}}),false);
    assert.equal(evaluate(expression,{role,next:{...old,origemCadastro:'manual'}}),true);
  }
  assert.equal(evaluate(expression,{role:'administrador',key}),true);
  assert.equal(evaluate(expression,{role:'consulta',old}),false);
  assert.equal(evaluate(expression,{next:null,old}),false);
});

test('existing number and declared origin are immutable for client updates',()=>{
  const number=rules.casos.$caseId.numeroProntuario['.validate'];
  assert.equal(evaluate(number,{old:'5',next:'6'}),false);
  assert.equal(evaluate(number,{old:'5',next:'5'}),true);
  assert.equal(evaluate(number,{old:null,next:'5'}),true);
  const origin=rules.casos.$caseId.origemCadastro['.validate'];
  assert.equal(evaluate(origin,{old:'planilha',next:'manual'}),false);
  assert.equal(evaluate(origin,{old:'planilha',next:'planilha'}),true);
  assert.equal(evaluate(origin,{old:null,next:'inventado'}),false);
  const old={numeroProntuario:'5',dataEntrada:'2026-10-15',origemCadastro:'planilha'};
  assert.equal(evaluate(rules.casos.$caseId['.validate'],{old,next:{numeroProntuario:'5',dataEntrada:'2026-10-15'}}),false);
  assert.equal(evaluate(rules.casos.$caseId['.validate'],{old,next:{...old}}),true);
});
