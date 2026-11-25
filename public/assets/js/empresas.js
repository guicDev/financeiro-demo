(function () {
  let storageKey = "financeiro-demonstracao:empresa";
  const financialViews = new Set(["dashboard", "notas", "detalhes", "pagar-hoje", "relatorios", "conciliacao", "recebiveis"]);
  let empresas = [];
  let admin = false;
  let bound = false;

  function selectedId() {
    return String((window.AppState && window.AppState.empresaId) || "");
  }

  function selectedEmpresa() {
    const id = Number(selectedId());
    return empresas.find((empresa) => empresa.id === id) || null;
  }

  function hasSelection() {
    return Boolean(selectedEmpresa());
  }

  function hasActiveSelection() {
    return Number(selectedEmpresa()?.ativo) === 1;
  }

  function isActive(id) {
    return Number(empresas.find((empresa) => Number(empresa.id) === Number(id))?.ativo) === 1;
  }

  function getName(id) {
    return empresas.find((empresa) => empresa.id === Number(id))?.nome || "Empresa não identificada";
  }

  function formatCnpj(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  function renderOptions() {
    const globalSelect = document.getElementById("empresaGlobal");
    const notaSelect = document.getElementById("notaEmpresa");
    const active = empresas.filter((empresa) => Number(empresa.ativo) === 1);
    const globalOptions = empresas.map((empresa) => (
      `<option value="${empresa.id}">${App.escape(empresa.nome)}${Number(empresa.ativo) === 1 ? "" : " (Somente consulta)"}</option>`
    )).join("");
    const activeOptions = active.map((empresa) => (
      `<option value="${empresa.id}">${App.escape(empresa.nome)}</option>`
    )).join("");
    const globalEmptyLabel = empresas.length ? "Todas as empresas" : "Nenhuma empresa cadastrada";
    const activeEmptyLabel = active.length ? "Selecione uma empresa" : "Nenhuma empresa ativa";

    globalSelect.innerHTML = `<option value="">${globalEmptyLabel}</option>${globalOptions}`;
    globalSelect.value = selectedId();

    const notaValue = notaSelect.value;
    notaSelect.innerHTML = `<option value="">${activeEmptyLabel}</option>${activeOptions}`;
    notaSelect.value = notaSelect.disabled ? notaValue : (notaValue || selectedId());
    if (!active.some((empresa) => String(empresa.id) === String(notaSelect.value))) notaSelect.value = "";
  }

  function renderList() {
    const container = document.getElementById("empresasList");
    if (!admin) {
      container.innerHTML = "";
      return;
    }
    if (!empresas.length) {
      container.innerHTML = '<div class="empty-state">Nenhuma empresa cadastrada.</div>';
      return;
    }
    container.innerHTML = empresas.map((empresa) => `
      <article class="list-item company-item">
        <div>
          <strong>${App.escape(empresa.nome)}</strong>
          <div class="meta">CNPJ ${App.escape(formatCnpj(empresa.cnpj))}</div>
        </div>
        <div class="item-actions">
          <span class="status-pill ${empresa.ativo ? "paga" : "cancelada"}">${empresa.ativo ? "Ativa" : "Inativa"}</span>
          <button class="secondary-button compact-button" data-company-toggle="${empresa.id}" type="button">
            ${empresa.ativo ? "Inativar" : "Ativar"}
          </button>
        </div>
      </article>
    `).join("");
  }

  function updateContextUi(view) {
    const notice = document.getElementById("empresaContextNotice");
    const action = document.getElementById("empresaContextAction");
    const needsContext = financialViews.has(view || window.App?.currentView);
    notice.hidden = true;
    if (needsContext && hasSelection() && !hasActiveSelection()) {
      notice.hidden = false;
      notice.querySelector("strong").textContent = "Empresa inativa: somente consulta.";
      notice.querySelector("span").textContent = "Notas, dashboard e relatórios históricos estão disponíveis; alterações e pagamentos ficam bloqueados.";
    } else if (needsContext && !hasSelection()) {
      notice.querySelector("strong").textContent = "Consultando todas as empresas.";
      notice.querySelector("span").textContent = "A visualizacao consolidada inclui Pessoa Fisica. Para cadastrar, editar ou confirmar um pagamento, selecione uma empresa ativa.";
    }
    action.hidden = !admin;
    document.querySelectorAll("[data-report]").forEach((button) => {
      button.disabled = false;
    });
  }

  function setSelected(id, notify) {
    const normalized = String(id || "");
    const valid = empresas.some((empresa) => String(empresa.id) === normalized);
    window.AppState = window.AppState || {};
    window.AppState.empresaId = valid ? normalized : "";
    if (valid) window.localStorage.setItem(storageKey, normalized);
    else window.localStorage.removeItem(storageKey);
    document.getElementById("empresaGlobal").value = valid ? normalized : "";
    syncNotaEmpresa();
    updateContextUi();
    if (notify && window.App) window.App.handleEmpresaChange();
  }

  function syncNotaEmpresa() {
    const field = document.getElementById("notaEmpresa");
    if (!field || field.disabled) return;
    field.value = hasActiveSelection() ? selectedId() : "";
  }

  async function load() {
    const payload = await Api.get("/api/empresas");
    empresas = Api.pickArray(payload, ["empresas", "items", "data"]);
    const current = selectedId();
    const validCurrent = empresas.some((empresa) => String(empresa.id) === current);
    window.AppState = window.AppState || {};
    window.AppState.empresaId = validCurrent ? current : "";
    if (!validCurrent) window.localStorage.removeItem(storageKey);
    renderOptions();
    renderList();
    updateContextUi();
    return empresas;
  }

  async function submitEmpresa(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const result = await Api.postJson("/api/empresas", data);
      form.reset();
      await load();
      App.alert("Empresa cadastrada com sucesso.", "success");
    } catch (error) {
      App.alert(error.message || "Não foi possível cadastrar a empresa.", "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function toggleEmpresa(id) {
    const empresa = empresas.find((item) => item.id === Number(id));
    if (!empresa) return;
    if (empresa.ativo && !window.confirm(`Inativar ${empresa.nome}?`)) return;
    const wasSelected = String(empresa.id) === selectedId();
    await Api.putJson(`/api/empresas/${empresa.id}`, {
      nome: empresa.nome,
      cnpj: empresa.cnpj,
      ativo: empresa.ativo ? 0 : 1
    });
    await load();
    if (wasSelected && empresa.ativo) App.handleEmpresaChange();
    App.alert(`Empresa ${empresa.ativo ? "inativada" : "ativada"}.`, "success");
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.getElementById("empresaGlobal").addEventListener("change", (event) => {
      setSelected(event.target.value, true);
    });
    document.getElementById("empresaForm").addEventListener("submit", submitEmpresa);
    document.getElementById("atualizarEmpresas").addEventListener("click", async () => {
      try { await load(); } catch (error) { App.alert(error.message, "error"); }
    });
    document.getElementById("empresasList").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-company-toggle]");
      if (!button) return;
      button.disabled = true;
      try {
        await toggleEmpresa(button.dataset.companyToggle);
      } catch (error) {
        App.alert(error.message || "Não foi possível atualizar a empresa.", "error");
        button.disabled = false;
      }
    });
    document.querySelector("#empresaForm [name='cnpj']").addEventListener("input", (event) => {
      event.target.value = formatCnpj(event.target.value);
    });
  }

  async function init(user) {
    admin = user && user.tipo === "admin";
    storageKey = `financeiro-demonstracao:empresa_${user?.id || user?.login || "usuario"}`;
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem("financeiro-demonstracao:empresa");
    window.AppState = window.AppState || {};
    window.AppState.empresaId = "";
    document.getElementById("empresasNav").hidden = !admin;
    document.getElementById("empresaContextAction").hidden = !admin;
    bind();
    await load();
  }

  window.Empresas = {
    init,
    load,
    hasSelection,
    hasActiveSelection,
    isActive,
    selectedId,
    selectedEmpresa,
    getName,
    isAdmin: () => admin,
    setSelected,
    syncNotaEmpresa,
    updateContextUi
  };
})();
