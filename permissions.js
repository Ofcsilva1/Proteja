export const ROLE = Object.freeze({
  ADMIN: 'administrador',
  COORDINATOR: 'coordenador',
  TECHNICIAN: 'tecnico',
  VIEWER: 'consulta'
});

const KNOWN_ROLES = new Set(Object.values(ROLE));
const CASE_WRITERS = new Set([ROLE.ADMIN, ROLE.COORDINATOR, ROLE.TECHNICIAN]);

export function permissionsForAccess(access) {
  const active = access?.active === true;
  const role = typeof access?.role === 'string' && KNOWN_ROLES.has(access.role) ? access.role : null;
  const allowed = active && role !== null;
  return Object.freeze({
    active,
    role,
    canReadCases: allowed,
    canWriteCases: allowed && CASE_WRITERS.has(role),
    canImport: allowed && role === ROLE.ADMIN
  });
}
