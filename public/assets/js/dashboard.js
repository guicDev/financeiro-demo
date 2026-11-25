(function () {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  let projectionRequestToken = 0;
  let selectedProjectionMonth = null;

  function valueToMoney(value) {
    if (typeof value === "string" && value.includes(",")) {
      return money.format(Number(value.replace(/\./g, "").replace(",", ".")) || 0);
    }
    const number = Number(value || 0);
    return money.format(Number.isInteger(number) ? number / 100 : number);
  }

  function metric(label, value) {
    return `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`;
  }

  function renderStatusList(container, status) {
    const entries = Object.entries(status || {});
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state">Ainda não há dados de status para mostrar.</div>';
      return;
    }
    container.innerHTML = entries.map(([key, value]) => `
      <div class="list-item">
        <span>${App.formatStatus(key)}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }

  function monthLabel(month) {
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
      .format(new Date(`${month}-01T12:00:00`));
  }

  function statusLabel(parcela) {
    if (parcela.status === "paga") return "Paga";
    if (Number(parcela.previsao_importada) === 1) return "Previsão";
    return App.formatStatus(parcela.status);
  }

  function renderMonthlyProjection(container, data) {
    const resumo = data.resumo || {};
    const horizonte = Array.isArray(data.horizonte) ? data.horizonte : [];
    const parcelas = Array.isArray(data.parcelas) ? data.parcelas : [];
    const previousScrollLeft = container.querySelector(".month-selector")?.scrollLeft || 0;
    const maiorTotal = Math.max(1, ...horizonte.map((item) => Number(item.total_previsto_centavos || 0)));
    container.innerHTML = `
      <div class="monthly-projection" aria-label="Previsão mensal de gastos">
        <div class="month-selector" role="tablist" aria-label="Selecionar mês da fatura">
          ${horizonte.map((item) => `
            <button class="month-selector-button ${item.mes === data.mes ? "active" : ""}" data-projection-month="${item.mes}" type="button" role="tab" aria-selected="${item.mes === data.mes}">
              <span>${monthLabel(item.mes)}</span>
              <strong>${valueToMoney(item.total_previsto_centavos)}</strong>
            </button>
          `).join("")}
        </div>
        <div class="projection-header">
          <div>
            <span class="eyebrow">Fatura selecionada</span>
            <h3>${monthLabel(data.mes)}</h3>
          </div>
          <span class="projection-count">${resumo.quantidade_parcelas || 0} parcelas</span>
        </div>
        <div class="projection-summary">
          ${metric("Previsto no mês", valueToMoney(resumo.total_previsto_centavos))}
          ${metric("Já pago", valueToMoney(resumo.total_pago_centavos))}
          ${metric("Saldo em aberto", valueToMoney(resumo.saldo_aberto_centavos))}
        </div>
        <div class="projection-bars" aria-label="Gastos previstos nos próximos meses">
          ${horizonte.map((item) => {
            const height = Math.max(8, Math.round((Number(item.total_previsto_centavos || 0) / maiorTotal) * 100));
            return `<button class="projection-bar ${item.mes === data.mes ? "active" : ""}" data-projection-month="${item.mes}" type="button" title="${monthLabel(item.mes)}: ${valueToMoney(item.total_previsto_centavos)}">
              <i style="height: ${height}%"></i><span>${monthLabel(item.mes).slice(0, 3)}</span>
            </button>`;
          }).join("")}
        </div>
        <div class="projection-list">
          ${parcelas.length ? parcelas.map((parcela) => `
            <article class="projection-item">
              <div><strong>${App.escape(parcela.fornecedor || "Fornecedor não informado")}</strong><span>${App.escape(parcela.empresa_nome || "Empresa não identificada")} · ${App.formatDate(parcela.data_vencimento)} · ${App.escape(parcela.categoria || parcela.centro_custo || "Sem categoria")}</span></div>
              <div><strong>${valueToMoney(parcela.valor_centavos)}</strong><span class="status-pill ${App.statusClass(parcela.status)}">${statusLabel(parcela)}</span></div>
            </article>
          `).join("") : '<div class="empty-state">Nenhum gasto previsto para este mês.</div>'}
        </div>
      </div>
    `;
    container.dataset.rendered = "1";
    selectedProjectionMonth = data.mes;
    const monthSelector = container.querySelector(".month-selector");
    if (monthSelector) monthSelector.scrollLeft = previousScrollLeft;
    container.querySelectorAll("[data-projection-month]").forEach((button) => {
      button.addEventListener("click", () => loadMonthlyProjection(container, button.dataset.projectionMonth));
    });
  }

  async function loadMonthlyProjection(container, month) {
    const requestedMonth = String(month || "");
    if (!requestedMonth) return;
    selectedProjectionMonth = requestedMonth;
    const requestToken = ++projectionRequestToken;
    try {
      const projection = await Api.get("/api/dashboard/projecao-mensal", { mes: requestedMonth });
      if (requestToken !== projectionRequestToken) return;
      renderMonthlyProjection(container, projection);
    } catch (error) {
      if (requestToken !== projectionRequestToken) return;
      App.alert(error.message || "Não foi possível carregar a previsão mensal.", "error");
    }
  }

  function renderDueList(container, items) {
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Sem vencimentos próximos. Quando houver algo para acompanhar, aparece aqui.</div>';
      container.dataset.rendered = "1";
      return;
    }

    container.innerHTML = items.slice(0, 8).map((item) => `
      <article class="list-item">
        <div>
          <strong>${App.escape(item.fornecedor || item.nota_fornecedor || "Fornecedor não informado")}</strong>
          <div class="meta">${App.escape(item.empresa_nome || "Empresa não identificada")} - Nota ${App.escape(item.numero_nota || item.nota_numero || "-")} - venc. ${App.formatDate(item.data_vencimento)}</div>
        </div>
        <div>
          <strong>${valueToMoney(item.valor_centavos || item.valor || item.valor_parcela)}</strong>
          <span class="status-pill ${App.statusClass(item.status)}">${App.formatStatus(item.status)}</span>
        </div>
      </article>
    `).join("");
    container.dataset.rendered = "1";
  }

  async function loadDashboard({ silent = false } = {}) {
    const metrics = document.getElementById("dashboardMetrics");
    const dueList = document.getElementById("dashboardDueList");
    const statusList = document.getElementById("dashboardStatusList");
    const currentMonth = selectedProjectionMonth
      || statusList.querySelector("[data-projection-month].active")?.dataset.projectionMonth
      || undefined;
    const requestToken = ++projectionRequestToken;
    if (!silent && !metrics.dataset.rendered) metrics.innerHTML = metric("Carregando painel", "...");
    if (!silent && !dueList.dataset.rendered) dueList.innerHTML = '<div class="empty-state">Buscando vencimentos...</div>';
    if (!silent && !statusList.dataset.rendered) statusList.innerHTML = '<div class="empty-state">Buscando previsao mensal...</div>';

    try {
      const [data, projection] = await Promise.all([
        Api.get("/api/dashboard"),
        Api.get("/api/dashboard/projecao-mensal", currentMonth ? { mes: currentMonth } : undefined)
      ]);
      const resumo = data.resumo || data.totais || data;
      const vencimentos = Api.pickArray(data.vencimentos || data.proximos || data.pagar_hoje || data.parcelas, ["items", "parcelas", "data"]);
      metrics.innerHTML = [
        metric("Pagar hoje", valueToMoney(resumo.total_pagar_hoje_centavos ?? 0)),
        metric("Pagar na semana", valueToMoney(resumo.total_pagar_semana_centavos ?? 0)),
        metric("Pagar no mes", valueToMoney(resumo.valor_pagar_mes_centavos ?? 0)),
        metric("Valor em aberto", valueToMoney(resumo.valor_aberto_centavos ?? resumo.valor_aberto ?? 0))
      ].join("");
      metrics.dataset.rendered = "1";
      renderDueList(dueList, vencimentos);
      if (requestToken === projectionRequestToken) renderMonthlyProjection(statusList, projection);
    } catch (error) {
      if (silent) return;
      App.alert(error.message || "Não foi possível carregar o dashboard.", "error");
      metrics.innerHTML = metric("Painel indisponivel", "Tente novamente");
      dueList.innerHTML = '<div class="empty-state">Não conseguimos carregar o dashboard agora. Atualize a página em alguns instantes.</div>';
      statusList.innerHTML = "";
    }
  }

  window.Dashboard = { loadDashboard, valueToMoney };
})();
