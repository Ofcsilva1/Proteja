// This small bootstrap runs even if the remote Firebase modules fail to load.
(() => {
  const status = document.getElementById("auth-status");
  const reload = document.getElementById("btnReloadAuth");
  reload.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("atualizar", String(Date.now()));
    window.location.replace(url.href);
  });
  document.getElementById("login-form").addEventListener("submit", event => {
    if (document.documentElement.dataset.authReady !== "true") event.preventDefault();
  });
  window.setTimeout(() => {
    if (document.documentElement.dataset.authReady === "true" || document.documentElement.dataset.authFailed === "true") return;
    status.textContent = "O serviço de acesso está demorando para iniciar. Isso pode ocorrer mesmo com internet funcionando. Aguarde ou clique em Recarregar acesso.";
    reload.hidden = false;
  }, 8000);
})();
window.addEventListener("error", event => {
  if (event.target?.id !== "app-script") return;
  const status = document.getElementById("auth-status");
  const reload = document.getElementById("btnReloadAuth");
  document.documentElement.dataset.authFailed = "true";
  if (status) status.textContent = "Não foi possível carregar os arquivos do acesso. Clique em Recarregar acesso para buscar uma página atualizada. Se persistir, o serviço pode estar indisponível ou bloqueado nesta rede/navegador.";
  if (reload) reload.hidden = false;
}, true);

