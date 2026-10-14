// Independent of Firebase: the appearance toggle also works before signing in.
(() => {
  const storageKey = "proteja-theme";
  let currentTheme = "light";
  try {
    if (localStorage.getItem(storageKey) === "dark") currentTheme = "dark";
  } catch { /* Browsers may disable storage; switching still works for this page. */ }

  function applyTheme(theme) {
    currentTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.dataset.bsTheme = currentTheme;
    const isDark = currentTheme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo noturno");
      button.querySelector("[data-theme-label]").textContent = isDark ? "Modo claro" : "Modo noturno";
      button.querySelector("i").className = isDark ? "bi bi-sun" : "bi bi-moon-stars";
    });
  }

  applyTheme(currentTheme);
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(currentTheme);
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        applyTheme(currentTheme === "dark" ? "light" : "dark");
        try { localStorage.setItem(storageKey, currentTheme); } catch { /* Optional persistence. */ }
      });
    });
  });
  window.addEventListener("storage", event => {
    if (event.key === storageKey) applyTheme(event.newValue === "dark" ? "dark" : "light");
  });
})();

