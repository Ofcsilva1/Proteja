const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp({ databaseURL: "https://proteja-5d929-default-rtdb.firebaseio.com" });
const database = getDatabase();

// Retain the endpoint so old clients get an explicit migration error. The
// application imports directly using the canonical caseKey in case-save.js.
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
