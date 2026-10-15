const { createHash, randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");

initializeApp({ databaseURL: "https://proteja-5d929-default-rtdb.firebaseio.com" });
const database = getDatabase();

const ALLOWED_FIELDS = new Set([
  "numeroProntuario", "dataEntrada", "dataUltimaAlimentacao", "idade", "conselhoTutelar", "sexo",
  "identidadeGenero", "escolaridade", "docOrigem", "origemCaso", "cor", "detalheOrigem",
  "situacaoAtual", "detalheSituacao", "nomeCriad", "responsavelNome", "responsavelCpf",
  "comunicacaoViolencia", "oficioViolencia", "encaminhamentosSolicitados",
  "detalheEncaminhamento", "dataOficioEnc", "retornoSolicitado", "infoRetorno",
  "estudoCaso", "piaElaborado", "outrasPendencias", "datasTexto", "tecnicosReferencia",
  "tipoViolencia", "violenciaSexual", "outrasViolencias", "dadosPlanilha", "historicoPlanilha"
]);
const CONSULTATION_FIELDS = [
  "idade", "dataUltimaAlimentacao", "dataEntrada", "conselhoTutelar", "sexo",
  "identidadeGenero", "cor", "escolaridade", "origemCaso"
];
const ALLOWED_STATUSES = new Set([
  "ativo", "suspenso", "encerrado_com_protecao", "encerrado_sem_protecao", "nao_competencia"
]);
const VIOLENCE_LABELS = [
  ["sexual", "Violência Sexual"], ["fisica", "Violência Física"], ["psicologica", "Violência Psicológica"],
  ["maus_tratos", "Maus Tratos"], ["bullying", "Bullying e Cyberbullying"], ["negligencia", "Negligência"],
  ["autoprovocada", "Autoprovocada"], ["trabalho_infantil", "Trabalho Infantil"],
  ["racismo", "Racismo/Injúria Racial"], ["institucional", "Institucional"],
  ["testemunha", "Testemunha de violência"], ["nao_identificada", "Não Identificada"]
];

async function getActiveAccess(uid) {
  const snapshot = await database.ref(`access/${uid}`).get();
  const access = snapshot.val();
  if (access?.active !== true || !["administrador", "coordenador", "tecnico", "consulta"].includes(access?.role)) {
    throw new HttpsError("permission-denied", "Sua conta não tem um cargo ativo no Proteja.");
  }
  return access;
}

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

function consultationRecord(data, code) {
  const result = { codigoConsulta: code };
  for (const key of CONSULTATION_FIELDS) {
    if (typeof data?.[key] === "string") result[key] = data[key].slice(0, 2000);
  }
  return result;
}

function normalized(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function violenceCategories(data) {
  const source = [data?.tipoViolencia, data?.violenciaSexual, data?.outrasViolencias].filter(Boolean).join(";");
  const normalizedText = normalized(source);
  const found = new Set();
  for (const [key, label] of VIOLENCE_LABELS) {
    const needle = normalized(label);
    const keyText = key.replaceAll("_", " ");
    if (normalizedText.includes(needle) || normalizedText.includes(keyText) ||
      (key === "sexual" && /\b(abuso|importunacao|exploracao)\b/.test(normalizedText))) found.add(key);
  }
  if (normalizedText.includes("violencia fisica e psicologica")) { found.add("fisica"); found.add("psicologica"); }
  if (normalizedText.includes("bullying no ambiente escolar")) found.add("bullying");
  return found;
}

function consultationIndicators(snapshot) {
  const counts = { total: 0, ativo: 0, encerrado: 0, suspenso: 0, naoCompetencia: 0, porViolencia: {} };
  const violenceCounts = Object.fromEntries(VIOLENCE_LABELS.map(([key]) => [key, 0]));
  snapshot.forEach(child => {
    const data = child.val();
    if (!data || !data.numeroProntuario) return;
    counts.total++;
    if (data.situacaoAtual === "ativo") counts.ativo++;
    if (["encerrado_com_protecao", "encerrado_sem_protecao"].includes(data.situacaoAtual)) counts.encerrado++;
    if (data.situacaoAtual === "suspenso") counts.suspenso++;
    if (data.situacaoAtual === "nao_competencia") counts.naoCompetencia++;
    for (const type of violenceCategories(data)) violenceCounts[type]++;
  });
  counts.porViolencia = Object.fromEntries(VIOLENCE_LABELS.map(([key, label]) => [label, violenceCounts[key]]));
  return counts;
}

exports.importarCaso = onCall({ region: "us-central1", maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre no sistema para importar.");
  const access = await getActiveAccess(request.auth.uid);
  if (access.role !== "administrador") {
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

exports.obterIndicadoresConsulta = onCall({ region: "us-central1", maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre no sistema para consultar os indicadores.");
  await getActiveAccess(request.auth.uid);
  const snapshot = await database.ref("casos").get();
  return consultationIndicators(snapshot);
});

exports.prepararConsulta = onCall({ region: "us-central1", maxInstances: 1 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre no sistema para preparar a consulta.");
  const access = await getActiveAccess(request.auth.uid);
  if (access.role !== "administrador") {
    throw new HttpsError("permission-denied", "Somente o administrador pode preparar a visão de consulta.");
  }
  const snapshot = await database.ref("casos").get();
  const indexSnapshot = await database.ref("consultaIndex").get();
  const jobs = [];
  snapshot.forEach(child => {
    const data = child.val();
    if (!data || !data.numeroProntuario) return;
    const viewId = indexSnapshot.child(child.key).val() || randomUUID();
    jobs.push({ caseKey: child.key, viewId, record: consultationRecord(data, `C-${viewId.slice(0, 8).toUpperCase()}`) });
  });
  for (let start = 0; start < jobs.length; start += 25) {
    const updates = {};
    for (const job of jobs.slice(start, start + 25)) {
      updates[`consultaIndex/${job.caseKey}`] = job.viewId;
      updates[`consultaCasos/${job.viewId}`] = job.record;
    }
    await database.ref().update(updates);
  }
  return { prepared: jobs.length };
});

exports.atualizarVisaoConsulta = onValueWritten({
  ref: "/casos/{caseId}",
  instance: "proteja-5d929-default-rtdb",
  region: "us-central1",
  maxInstances: 5
}, async event => {
  const caseKey = event.params.caseId;
  const indexRef = database.ref(`consultaIndex/${caseKey}`);
  const after = event.data.after;
  if (!after.exists()) {
    const previousId = (await indexRef.get()).val();
    const updates = { [`consultaIndex/${caseKey}`]: null };
    if (previousId) updates[`consultaCasos/${previousId}`] = null;
    await database.ref().update(updates);
    return;
  }

  const indexResult = await indexRef.transaction(current => current || randomUUID(), undefined, false);
  const viewId = indexResult.snapshot.val();
  const next = consultationRecord(after.val(), `C-${viewId.slice(0, 8).toUpperCase()}`);
  const previousId = (await indexRef.get()).val();
  if (previousId && previousId !== viewId) await database.ref(`consultaCasos/${previousId}`).remove();
  await database.ref(`consultaCasos/${viewId}`).set(next);
});

