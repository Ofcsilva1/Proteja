// This small bootstrap runs even if the remote Firebase modules fail to load.
(() => {
  const status = document.getElementById("auth-status");
  const reload = document.getElementById("btnReloadAuth");
  reload.addEventListener("click", () => window.location.reload());
  document.getElementById("login-form").addEventListener("submit", event => {
    if (document.documentElement.dataset.authReady !== "true") event.preventDefault();
  });
  window.setTimeout(() => {
    if (document.documentElement.dataset.authReady === "true") return;
    status.textContent = "A conexão está demorando. Confira a internet e aguarde ou recarregue.";
    reload.hidden = false;
  }, 8000);
})();
window.addEventListener("error", event => {
  if (event.target?.id !== "app-script") return;
  const status = document.getElementById("auth-status");
  const reload = document.getElementById("btnReloadAuth");
  if (status) status.textContent = "Não foi possível carregar o acesso. Confira a conexão e recarregue.";
  if (reload) reload.hidden = false;
}, true);

