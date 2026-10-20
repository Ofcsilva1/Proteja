import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareLegacy} from '../scripts/prepare-legacy.mjs';
test('offline preparation preserves synthetic records and does not certify duplicates',()=>{
  const source={casos:{a:{numeroProntuario:'0001',nomeCriad:'PESSOA FICTICIA'}}};
  const result=prepareLegacy(source);assert.equal(result.patch['identidades/1'],'a');
  assert.deepEqual(result.patch['legadoProtegido/a'],source.casos.a);assert.equal(result.reviewRequired,true);
  assert.equal(result.patch['securityPolicy/identityRegistryReady'],true);
  assert.throws(()=>prepareLegacy({casos:{a:{numeroProntuario:'001'},b:{numeroProntuario:'1'}}}));
  const bad=prepareLegacy({casos:{a:{numeroProntuario:'a/b'}}});assert.equal(bad.patch['securityPolicy/identityRegistryReady'],false);
});
test('offline preparation does not replace an existing protected archive or inconsistent index',()=>{
  const old={numeroProntuario:'1',nomeCriad:'ORIGINAL FICTICIO'};
  const result=prepareLegacy({casos:{a:{...old,nomeCriad:'NOVO FICTICIO'}},legadoProtegido:{a:old},identidades:{1:'a'}});
  assert.equal(Object.hasOwn(result.patch,'legadoProtegido/a'),false);
  assert.equal(Object.hasOwn(result.patch,'identidades/1'),false);
  assert.throws(()=>prepareLegacy({casos:{a:old},identidades:{1:'b'}}));
});
