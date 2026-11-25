(function () {
  const titles = {
    dashboard: ["Visao geral", "Dashboard"],
    notas: ["Consulta", "Notas cadastradas"],
    cadastro: ["Lançamento", "Cadastrar nota"],
    detalhes: ["Consulta", "Detalhes da nota"],
    "pagar-hoje": ["Rotina financeira", "Pagar hoje"],
    conciliacao: ["Rotina financeira", "Conciliação OFX"],
    recebiveis: ["Rotina financeira", "Contas a receber"],
    "custos-fixos": ["Planejamento", "Custos fixos mensais"],
    relatorios: ["Exportação", "Relatórios"],
    historico: ["Auditoria", "Histórico de ações"],
    empresas: ["Administração", "Empresas"],
    categorias: ["Administração", "Categorias"]
  };
  const LIVE_REFRESH_INTERVAL = 10000;
  let liveRefreshInProgress = false;
  const conciliacaoTabs = ['ofx', 'fiscal', 'nfce'];
  let activeConciliacaoTab = conciliacaoTabs.includes(window.sessionStorage.getItem('financeiro-demonstracao:aba')) ?
    window.sessionStorage.getItem('financeiro-demonstracao:aba') : 'ofx';

  function captureListPosition(container, preferredId, focus = false) {
    const rows = [...container.querySelectorAll('article[data-row-id]')];
    const anchor = rows.find((row) => row.dataset.rowId === String(preferredId)) ||
      rows.find((row) => row.getBoundingClientRect().bottom > 0) || rows[0];
    const index = Math.max(0, rows.indexOf(anchor));
    const top = anchor?.getBoundingClientRect().top;
    if (rows.length) container.style.minHeight = `${container.offsetHeight}px`;
    return () => {
      const next = [...container.querySelectorAll('article[data-row-id]')];
      const target = next.find((row) => row.dataset.rowId === String(preferredId)) || next[Math.min(index, next.length - 1)];
      if (target && top !== undefined) window.scrollBy(0, target.getBoundingClientRect().top - top);
      if (focus) (target?.querySelector('button:not(:disabled), select:not(:disabled), a') || target)?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => { container.style.minHeight = ''; });
    };
  }

  function showConciliacaoTab(tab, focus = false) {
    activeConciliacaoTab = conciliacaoTabs.includes(tab) ? tab : 'ofx';
    window.sessionStorage.setItem('financeiro-demonstracao:aba', activeConciliacaoTab);
    for (const name of conciliacaoTabs) {
      const button = document.getElementById(`${name}Tab`);
      button.setAttribute('aria-selected', String(name === activeConciliacaoTab));
      button.tabIndex = name === activeConciliacaoTab ? 0 : -1;
      document.getElementById(`${name}Pane`).hidden = name !== activeConciliacaoTab;
    }
    if (focus) document.getElementById(`${activeConciliacaoTab}Tab`).focus();
    if (activeConciliacaoTab === 'fiscal') window.Fiscal?.load({ reuse: true });
    else if (activeConciliacaoTab === 'nfce') window.NfceAm?.load({ reuse: true });
    else Conciliacao.load({ reuse: true });
  }

  function escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const localMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (localMatch) {
      const [, year, month, day, hour, minute, second = "00"] = localMatch;
      return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return formatDate(value);
    return date.toLocaleString("pt-BR");
  }

  function formatStatus(status) {
    const text = String(status || "sem_status").replaceAll("_", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function statusClass(status) {
    return String(status || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  function parseMoney(value) {
    const normalized = String(value || "0").replace(/\./g, "").replace(",", ".");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function moneyInput(value) {
    return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function alert(message, type) {
    const area = document.getElementById("alertArea");
    if (!area) return;
    const node = document.createElement("div");
    node.className = `alert ${type || ""}`.trim();
    node.textContent = message;
    area.appendChild(node);
    window.setTimeout(() => node.remove(), 6500);
  }

  function setTitle(view) {
    const [eyebrow, title] = titles[view] || titles.dashboard;
    document.getElementById("sectionEyebrow").textContent = eyebrow;
    document.getElementById("pageTitle").textContent = title;
  }

  function showView(view) {
    if (view === "categorias" && window.AppState?.userRole !== "admin") {
      alert("Apenas administradores podem gerenciar categorias.", "error");
      return;
    }
    if (view === "empresas" && !Empresas.isAdmin()) {
      alert("Apenas administradores podem gerenciar empresas.", "error");
      return;
    }
    if (view === "custos-fixos" && !CustosFixos.canAccess()) {
      alert("Apenas administradores e financeiro podem consultar custos fixos.", "error");
      return;
    }
    document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
    document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
    document.getElementById(view === "conciliacao" ? "conciliacaoView" : `${view.replace("-", "")}View`)?.classList.add("active-view");
    if (view === "pagar-hoje") document.getElementById("pagarHojeView").classList.add("active-view");
    window.App.currentView = view;
    setTitle(view);
    Empresas.updateContextUi(view);

    if (view === "dashboard") Dashboard.loadDashboard();
    if (view === "notas") Notas.loadNotas();
    if (view === "cadastro") Notas.newNota();
    if (view === "pagar-hoje") PagarHoje.load();
    if (view === "conciliacao") showConciliacaoTab(activeConciliacaoTab);
    if (view === "recebiveis") Recebiveis.load();
    if (view === "custos-fixos") {
      CustosFixos.load();
      if (!document.getElementById("custoFixoFormPanel").hidden) Categorias.load(document.getElementById("custoFixoForm"));
    }
    if (view === "relatorios") Relatorios.loadCartoes();
    if (view === "historico") Historico.load();
    if (view === "categorias") Categorias.loadAdmin();
  }

  function bindNavigation() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-view-link], .nav-link");
      if (!link) return;
      const view = link.dataset.viewLink || link.dataset.view;
      if (view) showView(view);
    });
  }

  async function refreshCurrentFinancialView() {
    if (document.hidden || liveRefreshInProgress) return;
    const view = window.App.currentView;
    if (["cadastro", "relatorios", "empresas", "categorias"].includes(view)) return;
    if (view === "pagar-hoje" && document.querySelector(".payment-form")) return;
    liveRefreshInProgress = true;
    try {
      if (view === "dashboard") await Dashboard.loadDashboard({ silent: true });
      if (view === "notas") await Notas.loadNotas({ silent: true });
      if (view === "pagar-hoje") await PagarHoje.load({ silent: true });
      if (view === "custos-fixos") await CustosFixos.load({ silent: true });
      if (view === "historico") await Historico.load({ silent: true });
      if (view === "detalhes") await Detalhes.refreshDetalhes();
    } catch {
      // A próxima atualização tentará novamente; a tela atual preserva o último dado válido.
    } finally {
      liveRefreshInProgress = false;
    }
  }

  function startLiveRefresh() {
    window.setInterval(refreshCurrentFinancialView, LIVE_REFRESH_INTERVAL);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshCurrentFinancialView();
    });
  }

  function renderPagarHoje(items) {
    const container = document.getElementById("pagarHojeList");
    const totalNode = document.getElementById("pagarHojeTotal");
    if (totalNode) totalNode.textContent = Dashboard.valueToMoney(items.reduce((total, item) => total + Number(item.valor_centavos || 0), 0));
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Tudo certo por aqui. Não há parcelas pendentes para hoje.</div>';
      container.dataset.rendered = "1";
      return;
    }
    container.innerHTML = items.map((item) => `
      <article class="list-item">
        <div>
          <strong>${escape(item.fornecedor || item.nota_fornecedor || "Fornecedor não informado")}</strong>
          <div class="meta">${escape(item.empresa_nome || "Empresa não identificada")} - Nota ${escape(item.numero_nota || item.nota_numero || "-")} - parcela ${escape(item.numero_parcela || "-")}</div>
          <div class="meta">Venc. ${formatDate(item.data_vencimento)} - ${formatStatus(item.forma_pagamento || "-")}</div>
        </div>
        <div class="item-actions">
          <strong class="money-value">${Dashboard.valueToMoney(item.valor_centavos || item.valor)}</strong>
          <span class="status-pill ${statusClass(item.status)}">${formatStatus(item.status)}</span>
          <button class="secondary-button compact-button" data-pagar-hoje-detail-id="${item.nota_id}" data-pagar-hoje-company-id="${item.empresa_id}" type="button">Detalhes</button>
          ${Number(item.empresa_ativa ?? 1) === 1 ? `<button class="primary-button compact-button" data-pay-id="${item.id}" data-pay-company-id="${item.empresa_id}" type="button">Pagar</button>` : '<span class="meta">Empresa inativa: somente consulta</span>'}
        </div>
      </article>
    `).join("");
    container.dataset.rendered = "1";
  }

  async function loadPagarHoje({ silent = false } = {}) {
    const container = document.getElementById("pagarHojeList");
    const totalNode = document.getElementById("pagarHojeTotal");
    if (Empresas.hasSelection() && !Empresas.hasActiveSelection()) {
      container.innerHTML = '<div class="empty-state">Empresa inativa: pagamentos estão bloqueados. Use notas e relatórios para consulta histórica.</div>';
      if (totalNode) totalNode.textContent = Dashboard.valueToMoney(0);
      return;
    }
    if (!silent && !container.dataset.rendered) container.innerHTML = '<div class="empty-state">Buscando parcelas de hoje...</div>';
    try {
      const params = new URLSearchParams();
      const forma = document.getElementById("pagarHojeForma")?.value;
      if (forma) params.set("forma_pagamento", forma);
      const payload = await Api.get(`/api/pagar-hoje${params.toString() ? `?${params}` : ""}`);
      const items = Api.pickArray(payload, ["parcelas", "items", "data"]);
      if (totalNode && payload.total_centavos !== undefined) totalNode.textContent = Dashboard.valueToMoney(payload.total_centavos);
      renderPagarHoje(items);
    } catch (error) {
      if (silent) return;
      alert(error.message || "Não foi possível carregar a rotina de hoje.", "error");
      container.innerHTML = '<div class="empty-state">Não conseguimos carregar a rotina agora. Tente atualizar novamente.</div>';
    }
  }

  async function init() {
    const user = await Auth.requireAuth();
    if (!user) return;
    window.AppState = window.AppState || {};
    window.AppState.userRole = user.tipo;
    const label = [user.nome || user.login || "Usuário", user.tipo].filter(Boolean).join(" - ");
    document.getElementById("userBadge").textContent = label;
    document.getElementById("logoutButton").addEventListener("click", Auth.logout);
    document.getElementById("atualizarPagarHoje").addEventListener("click", loadPagarHoje);
    document.getElementById("pagarHojeForma")?.addEventListener("change", loadPagarHoje);
    try {
      await Empresas.init(user);
    } catch (error) {
      alert(error.message || "Não foi possível carregar as empresas.", "error");
    }
    bindNavigation();
    document.querySelectorAll('[data-conciliacao-tab]').forEach((button) => {
      button.addEventListener('click', () => showConciliacaoTab(button.dataset.conciliacaoTab));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = conciliacaoTabs.indexOf(activeConciliacaoTab);
        const next = event.key === 'Home' ? conciliacaoTabs[0] : event.key === 'End' ? conciliacaoTabs.at(-1) :
          conciliacaoTabs[(index + (event.key === 'ArrowRight' ? 1 : conciliacaoTabs.length - 1)) % conciliacaoTabs.length];
        showConciliacaoTab(next, true);
      });
    });
    startLiveRefresh();
    Notas.bindNotas();
    Detalhes.bindDetalhes();
    Relatorios.bindRelatorios();
    CustosFixos.init(user);
    Categorias.initAdmin(user).catch((error) => alert(error.message, "error"));
    Historico.init(user);
    Conciliacao.init(user);
    Recebiveis.init(user);
    window.Fiscal?.init(user);
    window.NfceAm?.init(user);
    Notas.updatePaymentFields();
    Notas.gerarParcelas();
    showView("dashboard");
  }

  function handleEmpresaChange() {
    const view = window.App.currentView;
    if (view === "detalhes") {
      showView("notas");
      return;
    }
    if (view !== "empresas") showView(view);
    else Empresas.updateContextUi(view);
  }

  window.App = {
    currentView: "dashboard",
    escape,
    escapeAttr: escape,
    formatDate,
    formatDateTime,
    formatStatus,
    statusClass,
    parseMoney,
    moneyInput,
    alert,
    captureListPosition,
    showView,
    showConciliacaoTab,
    handleEmpresaChange,
    refreshCurrentFinancialView
  };
  window.PagarHoje = { load: loadPagarHoje };

  document.addEventListener("DOMContentLoaded", init);
})();
