const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

// Runtime configuration selects the project, including the demo project in tests.
initializeApp(process.env.FIREBASE_DATABASE_EMULATOR_HOST ? {
  projectId: process.env.GCLOUD_PROJECT,
  databaseURL: `https://${process.env.GCLOUD_PROJECT}-default-rtdb.firebaseio.com`
} : undefined);
const database = getDatabase();
const { createService, PolicyError } = require('./service.cjs');
const service = createService(database);
const callable = handler => onCall({ region: 'us-central1', maxInstances: 5 }, async request => {
  try { return await handler(request); }
  catch (error) {
    if (error instanceof PolicyError) throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível concluir a operação.');
  }
});
exports.salvarCaso = callable(service.saveCase);
exports.salvarAtividade = callable(service.saveActivity);
exports.consultarResumo = callable(service.sharedSummary);

// Retain the endpoint so old clients get an explicit migration error. The
// current application writes through salvarCaso with a server-controlled origin.
// Do not reintroduce a second writer without one atomic identity contract.
exports.importarCaso = onCall({ region: "us-central1", maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre no sistema para importar.");
  const accessSnapshot = await database.ref(`access/${request.auth.uid}`).get();
  const access = accessSnapshot.val();
  if (access?.active !== true || access?.role !== "administrador") {
    throw new HttpsError("permission-denied", "Somente uma conta administradora ativa pode importar.");
  }
  // Never inspect, log or persist the payload through this retired route.
  throw new HttpsError(
    "failed-precondition",
    "Importação legada desativada. Use a importação de planilhas no aplicativo atualizado."
  );
});
