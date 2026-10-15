import { normalize } from './import-core.js?v=20261015.3';

export const VIOLENCE_TYPES = [
  ['sexual', 'Violência Sexual'], ['fisica', 'Violência Física'], ['psicologica', 'Violência Psicológica'],
  ['maus_tratos', 'Maus Tratos'], ['bullying', 'Bullying e Cyberbullying'], ['negligencia', 'Negligência'],
  ['autoprovocada', 'Autoprovocada'], ['trabalho_infantil', 'Trabalho Infantil'],
  ['racismo', 'Racismo/Injúria Racial'], ['institucional', 'Institucional'],
  ['testemunha', 'Testemunha de violência'], ['nao_identificada', 'Não Identificada']
];
export const SEXUAL_TYPES = [
  ['abuso', 'Violência Sexual (Abuso)'], ['importunacao', 'Violência Sexual (Importunação)'],
  ['exploracao', 'Violência Sexual (Exploração)']
];
export const splitViolence = value => String(value ?? '').split(/[;\n]+/).map(v => v.trim()).filter(Boolean);
const typeMap = new Map(VIOLENCE_TYPES.map(([key, label]) => [normalize(label), key]));
const sexualMap = new Map(SEXUAL_TYPES.map(([key, label]) => [normalize(label), key]));
typeMap.set('bullying no ambiente escolar', 'bullying');
typeMap.set('testemunha de violecncia', 'testemunha');
const noValue = value => ['', 'nao', 'nao informado', 'nao se aplica'].includes(normalize(value));

export function resolveViolenceData(data) {
  let original = {};
  try { original = JSON.parse(data.dadosPlanilha || '{}') || {}; } catch { /* Legacy snapshots may be absent. */ }
  const field = (key, label) => {
    if (Object.hasOwn(data, key)) return String(data[key] ?? '');
    const header = Object.keys(original).find(h => normalize(h) === normalize(label));
    return String(original[header] ?? '');
  };
  return { ...data, tipoViolencia: field('tipoViolencia', 'Tipo de violência'),
    violenciaSexual: field('violenciaSexual', 'Sexual'), outrasViolencias: field('outrasViolencias', 'Outros') };
}
export function violenceTags(record) {
  const data = resolveViolenceData(record);
  const types = new Map(), subtypes = new Map();
  for (const key of ['tipoViolencia', 'violenciaSexual', 'outrasViolencias']) {
    for (const label of splitViolence(data[key])) {
      if (noValue(label)) continue;
      const normalized = normalize(label), sexual = sexualMap.get(normalized);
      if (sexual || key === 'violenciaSexual') {
        types.set('sexual', 'Violência Sexual');
        if (normalized !== 'violencia sexual') subtypes.set(sexual || `outro:${normalized}`, sexual ? SEXUAL_TYPES.find(([id]) => id === sexual)[1] : label);
      } else {
        const type = typeMap.get(normalized);
        types.set(type || `outro:${normalized}`, type ? VIOLENCE_TYPES.find(([id]) => id === type)[1] : label);
      }
    }
  }
  return { types, subtypes };
}
export function matchesViolence(data, type = '', subtype = '') {
  if (!type && !subtype) return true;
  const tags = violenceTags(data);
  return (!type || (type === 'sem_informacao' ? !tags.types.size : tags.types.has(type))) && (!subtype || tags.subtypes.has(subtype));
}
export function violenceOptions(cases) {
  const types = new Map(VIOLENCE_TYPES), subtypes = new Map(SEXUAL_TYPES);
  for (const { data } of cases) {
    const tags = violenceTags(data);
    for (const [key, label] of tags.types) types.set(key, label);
    for (const [key, label] of tags.subtypes) subtypes.set(key, label);
  }
  return { types: [...types], subtypes: [...subtypes] };
}
