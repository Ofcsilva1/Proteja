// Pure save decisions. Transactions and authentication live in script.js.
export function caseIdentity(value) {
  const id = String(value ?? '').normalize('NFKC').trim().toUpperCase();
  return /^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, '') : id;
}

export function hasDuplicate(records, number, exceptKey = null) {
  const id = caseIdentity(number);
  return Boolean(id) && records.some(record => record.key !== exceptKey && caseIdentity(record.data.numeroProntuario) === id);
}

export async function caseKey(number, subtle = globalThis.crypto?.subtle) {
  const id = caseIdentity(number);
  if (!id) throw new Error('Informe o número do prontuário.');
  if (!subtle) throw new Error('Este navegador não oferece criptografia segura para salvar.');
  const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(id));
  return 'case_' + [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function caseReplacement(current, expected, patch, fields) {
  if (!current || !expected) return undefined;
  // Compare the raw saved values, never values converted for display. Agenda,
  // imported snapshots and unrelated fields are preserved from the transaction.
  if (fields.some(field => (current[field] ?? '') !== (expected[field] ?? ''))) return undefined;
  if (patch.numeroProntuario !== current.numeroProntuario) return undefined;
  return { ...current, ...patch };
}
