const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp({ databaseURL: "https://proteja-5d929-default-rtdb.firebaseio.com" });
const database = getDatabase();

const ALLOWED_FIELDS = new Set([
  "numeroProntuario", "dataEntrada", "docOrigem", "origemCaso", "cor", "detalheOrigem",
  "situacaoAtual", "detalheSituacao", "nomeCriad", "responsavelNome", "responsavelCpf",
  "comunicacaoViolencia", "oficioViolencia", "encaminhamentosSolicitados",
  "detalheEncaminhamento", "dataOficioEnc", "retornoSolicitado", "infoRetorno",
  "estudoCaso", "piaElaborado", "outrasPendencias", "datasTexto", "tecnicosReferencia",
  "tipoViolencia", "violenciaSexual", "outrasViolencias", "dadosPlanilha", "historicoPlanilha"
]);
const ALLOWED_STATUSES = new Set([
  "ativo", "suspenso", "encerrado_com_protecao", "encerrado_sem_protecao", "nao_competencia"
]);

function validateImportedCase(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Registro inválido.");
  }
  const data = { ...value };
  if (Object.keys(data).some(key => !ALLOWED_FIELDS.has(key))) {
    throw new HttpsError("invalid-argument", "O registro contém campos não permitidos.");
  }
  if (typeof data.numeroProntuario !== "string" || !data.numeroProntuario.trim() || data.numeroProntuario.length > 100) {
    throw new HttpsError("invalid-argument", "O número do prontuário é inválido.");
  }
  if (typeof data.dataEntrada !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.dataEntrada)) {
    throw new HttpsError("invalid-argument", "A data de entrada é inválida.");
  }
  const date = new Date(data.dataEntrada + "T00:00:00.000Z");
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== data.dataEntrada) {
    throw new HttpsError("invalid-argument", "A data de entrada não existe no calendário.");
  }
  if (data.situacaoAtual !== undefined && !ALLOWED_STATUSES.has(data.situacaoAtual)) {
    throw new HttpsError("invalid-argument", "A situação do caso é inválida.");
  }
  for (const [key, field] of Object.entries(data)) {
    if (typeof field !== "string" || field.length > 20000) {
      throw new HttpsError("invalid-argument", `O campo ${key} tem tipo ou tamanho inválido.`);
    }
  }
  if (Buffer.byteLength(JSON.stringify(data), "utf8") > 900_000) {
    throw new HttpsError("invalid-argument", "O registro excede o tamanho permitido.");
  }
  return data;
}

exports.importarCaso = onCall({ region: "us-central1", maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre no sistema para importar.");
  const accessSnapshot = await database.ref(`access/${request.auth.uid}`).get();
  const access = accessSnapshot.val();
  if (access?.active !== true || access?.role !== "administrador") {
    throw new HttpsError("permission-denied", "Somente uma conta administradora ativa pode importar.");
  }

  const data = validateImportedCase(request.data?.data);
  const identity = data.numeroProntuario.normalize("NFKC").trim().toUpperCase();
  const digest = createHash("sha256").update(identity, "utf8").digest("hex");
  const path = `casos/import_${digest}`;
  const timestamp = new Date().toISOString();
  const record = { ...data, criadoEm: timestamp, atualizadoEm: timestamp };
  const result = await database.ref(path).transaction(current => current === null ? record : undefined, undefined, false);
  return { created: result.committed };
});
