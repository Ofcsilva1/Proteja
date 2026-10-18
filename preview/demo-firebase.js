// Preview-only adapter. No SDK, credentials, remote requests or persistent storage.
import { buildActivity, todayISO } from '../workflow-core.js';

const today = todayISO();
const auth = { currentUser: null };
const observers = new Set();
const subscriptions = new Set();
const cases = {
  'demo-case-5': {
    numeroProntuario: '0005', dataEntrada: today, situacaoAtual: 'ativo',
    nomeCriad: 'Pessoa fictícia A', responsavelNome: 'Responsável fictício A',
    tecnicosReferencia: 'Equipe de demonstração', cor: 'nao_informado',
    detalheOrigem: 'Registro sintético para testar edição e duplicidade. Não representa uma pessoa real.',
    agenda_demo: buildActivity('agenda', { data: today, hora: '14:00', responsavel: 'Equipe fictícia', tipo: 'Atenção inicial', situacao: 'agendado', dataConclusao: '', observacao: 'Atendimento fictício para testar o fluxo.' }, null, 'demo-user'),
    pendencia_demo: buildActivity('tarefas', { descricao: 'Conferir documento fictício', prazo: today, responsavel: 'Equipe fictícia', tipo: 'Documento', situacao: 'aberta', prioridade: 'normal', dataConclusao: '', observacao: 'Pendência de demonstração.' }, null, 'demo-user')
  },
  'demo-case-6': {
    numeroProntuario: 'DEMO-006', dataEntrada: today, situacaoAtual: 'suspenso',
    nomeCriad: 'Pessoa fictícia B', responsavelNome: 'Responsável fictício B',
    detalheOrigem: 'Dados inventados para demonstração da interface.'
  }
};
const clone = value => value === undefined ? null : structuredClone(value);
function snapshot(value) {
  return { val: () => clone(value), forEach: callback => {
    for (const [key, child] of Object.entries(value || {})) {
      if (callback({ key, ...snapshot(child) }) === true) break;
    }
  } };
}
function valueAt(path) {
  if (path.startsWith('access/')) return { active: true, role: 'administrador' };
  return path.split('/').filter(Boolean).reduce((value, key) => value?.[key], { casos: cases }) ?? null;
}
function emit() { for (const { path, callback } of subscriptions) callback(snapshot(valueAt(path))); }
export const initializeApp = () => ({ preview: true });
export const getDatabase = () => ({ preview: true });
export const getAuth = () => auth;
export const inMemoryPersistence = { type: 'NONE' };
export const setPersistence = async () => {};
export const signOut = async () => { auth.currentUser = null; for (const callback of observers) callback(null); };
export const signInWithEmailAndPassword = async () => {
  auth.currentUser = { uid: 'demo-user' };
  for (const callback of observers) callback(auth.currentUser);
  return { user: auth.currentUser };
};
export function onAuthStateChanged(_auth, callback) {
  observers.add(callback); queueMicrotask(() => callback(auth.currentUser));
  return () => observers.delete(callback);
}
export const ref = (_database, path) => path;
export const get = async path => snapshot(valueAt(path));
export function onValue(path, callback) {
  const subscription = { path, callback }; subscriptions.add(subscription);
  queueMicrotask(() => callback(snapshot(valueAt(path))));
  return () => subscriptions.delete(subscription);
}
export async function runTransaction(path, update) {
  if (!auth.currentUser) throw new Error('Sessão de demonstração encerrada.');
  const [root, key, field, ...rest] = path.split('/');
  if (root !== 'casos' || !key || rest.length) throw new Error('Operação fora do ambiente de demonstração.');
  const result = update(clone(valueAt(path)));
  if (result === undefined) return { committed: false };
  if (field) {
    if (!cases[key]) throw new Error('Prontuário fictício não encontrado.');
    if (result === null) delete cases[key][field]; else cases[key][field] = clone(result);
  } else if (result === null) delete cases[key]; else cases[key] = clone(result);
  emit(); return { committed: true, snapshot: snapshot(result) };
}
