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

test('all client writes are denied, including access, cases and quota counters',()=>{
  const visit=node=>{
    for(const [key,value] of Object.entries(node)) {
      if(key==='.write')assert.equal(value,false);
      else if(value&&typeof value==='object')visit(value);
    }
  };
  visit(rules);
  assert.equal(rules['.write'],false);
  assert.equal(rules.casos['.write'],false);
});
