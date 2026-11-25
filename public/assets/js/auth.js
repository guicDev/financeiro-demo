(function () {
  function currentUserFrom(payload) {
    return (payload && (payload.usuario || payload.user || payload.data)) || payload || null;
  }

  async function requireAuth() {
    try {
      const status = await Api.get("/api/auth/status");
      const user = currentUserFrom(status);
      if (!user || status.autenticado === false || status.authenticated === false) {
        window.location.href = "login.html";
        return null;
      }
      window.AppState = window.AppState || {};
      window.AppState.user = user;
      return user;
    } catch (error) {
      window.location.href = "login.html";
      return null;
    }
  }

  async function logout() {
    try {
      await Api.postJson("/api/auth/logout");
    } finally {
      window.location.href = "login.html";
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("loginMessage");
    const submit = form.querySelector("button[type='submit']");
    const originalText = submit.textContent;
    message.textContent = "";
    submit.disabled = true;
    submit.textContent = "Entrando...";

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await Api.postJson("/api/auth/login", data);
      window.location.href = "index.html";
    } catch (error) {
      message.textContent = error.message || "Não foi possível entrar. Confira usuário e senha.";
    } finally {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);
  });

  window.Auth = { requireAuth, logout };
})();
