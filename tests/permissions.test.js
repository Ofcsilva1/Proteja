import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE, permissionsForAccess } from '../permissions.js';

test('requires an active account and a recognized role', () => {
  assert.equal(permissionsForAccess({ active: true, canWrite: true }).canReadCases, false);
  assert.equal(permissionsForAccess({ active: false, role: ROLE.ADMIN }).canReadCases, false);
  assert.equal(permissionsForAccess({ active: true, role: 'unexpected' }).canReadCases, false);
});

test('administrator can read, write cases, and import', () => {
  assert.deepEqual(permissionsForAccess({ active: true, role: ROLE.ADMIN }), {
    active: true, role: ROLE.ADMIN, canAccess: true, canReadCases: true, canWriteCases: true, canImport: true
  });
});

test('coordinator and technician can write cases but cannot use import workflow', () => {
  for (const role of [ROLE.COORDINATOR, ROLE.TECHNICIAN]) {
    const permissions = permissionsForAccess({ active: true, role });
    assert.equal(permissions.canReadCases, true);
    assert.equal(permissions.canWriteCases, true);
    assert.equal(permissions.canImport, false);
  }
});

test('consultation can enter but cannot read raw cases', () => {
  assert.deepEqual(permissionsForAccess({ active: true, role: ROLE.VIEWER }), {
    active: true, role: ROLE.VIEWER, canAccess: true, canReadCases: false, canWriteCases: false, canImport: false
  });
});
