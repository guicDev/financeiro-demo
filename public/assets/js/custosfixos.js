(function () {
  let user = null;
  let empresas = [];
  let bound = false;

  function canAccess() {
    return ["admin", "financeiro"].includes(user?.tipo);
  }

  function canManage() {
    return ["admin", "financeiro"].includes(user?.tipo);
  }

  function monthToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Manaus", year: "numeric", month: "2-digit"
    }).formatToParts(new Date()).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}`;
  }

  function renderEmpresaOptions() {
    const field = document.getElementById("custoFixoEmpresa");
    const active = empresas.filter((empresa) => Number(empresa.ativo) === 1);
    field.innerHTML = `<option value="">${active.length ? "Selecione uma empresa" : "Nenhuma empresa ativa"}</option>${active
      .map((empresa) => `<option value="${empresa.id}">${App.escape(empresa.nome)}</option>`).join("")}`;
    const selected = Empresas.selectedId();
    if (active.some((empresa) => String(empresa.id) === selected)) field.value = selected;
  }

  function updateCardFinalField() {
    const form = document.getElementById("custoFixoForm");
    const isCard = form.elements.forma_pagamento.value === "cartao_credito";
    const field = document.getElementById("custoFixoCartaoFinalField");
    const input = document.getElementById("custoFixoCartaoFinal");
    field.hidden = !isCard;
    input.required = isCard;
    if (!isCard) input.value = "";
    updateCardFinalHint();
  }

  function updateCardFinalHint() {
    const input = document.getElementById("custoFixoCartaoFinal");
    const hint = document.getElementById("custoFixoCartaoFinalHint");
    const label = window.Cartoes?.label(input.value) || "";
    hint.textContent = label;
    hint.hidden = !label;
  }

  function render(items) {
    const container = document.getElementById("custosFixosList");
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Nenhum custo fixo cadastrado para este filtro.</div>';
      container.dataset.rendered = "1";
      return;
    }
    container.innerHTML = items.map((item) => {
      const active = !item.encerrado_em;
      return `
        <article class="list-item">
          <div>
            <strong>${App.escape(item.descricao)}</strong>
            <div class="meta">${App.escape(item.empresa_nome)} · ${App.escape(item.fornecedor)} · dia ${App.escape(item.dia_vencimento)}</div>
            <div class="meta">Inicio ${App.escape(item.inicio_mes)} · ${App.escape(item.competencias_ativas)} competencia(s) projetada(s)</div>
          </div>
          <div class="item-actions">
            <strong class="money-value">${Dashboard.valueToMoney(item.valor_centavos)}</strong>
            <span class="status-pill ${active ? "a_vencer" : "cancelada"}">${active ? "Ativo" : "Encerrado"}</span>
            ${active && canManage() ? `<button class="secondary-button compact-button" data-end-fixed-cost="${item.id}" data-company-id="${item.empresa_id}" type="button">Encerrar</button>` : ""}
          </div>
        </article>`;
    }).join("");
    container.dataset.rendered = "1";
  }

  async function load({ silent = false } = {}) {
    if (!canAccess()) return;
    const container = document.getElementById("custosFixosList");
    if (!silent && !container.dataset.rendered) container.innerHTML = '<div class="empty-state">Buscando custos fixos...</div>';
    try {
      const payload = await Api.get("/api/custos-fixos");
      render(Api.pickArray(payload, ["custos", "items", "data"]));
    } catch (error) {
      if (silent) return;
      App.alert(error.message || "Não foi possível carregar os custos fixos.", "error");
      container.innerHTML = '<div class="empty-state">Não foi possível carregar os custos fixos.</div>';
    }
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!Categorias.validate(form)) return;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const options = { headers: { "X-Empresa-Id": data.empresa_id } };
      const result = await Api.postJson("/api/custos-fixos", data, options);
      form.reset();
      document.getElementById("custoFixoInicio").value = monthToday();
      renderEmpresaOptions();
      Categorias.load(form);
      updateCardFinalField();
      App.alert(`${result.competencias_geradas} competencia(s) mensal(is) projetada(s).`, "success");
      await load();
    } catch (error) {
      App.alert(error.message || "Não foi possível cadastrar o custo fixo.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function endCost(button) {
    if (!window.confirm("Encerrar este custo fixo? As previsões dos meses futuros serão removidas, sem apagar pagamentos ou histórico.")) return;
    button.disabled = true;
    try {
      const options = { headers: { "X-Empresa-Id": button.dataset.companyId } };
      const result = await Api.postJson(`/api/custos-fixos/${button.dataset.endFixedCost}/encerrar`, {}, options);
      App.alert(`Custo fixo encerrado. ${result.previsoes_removidas} previsão(ões) futura(s) removida(s).`, "success");
      await load();
    } catch (error) {
      App.alert(error.message || "Não foi possível encerrar o custo fixo.", "error");
      button.disabled = false;
    }
  }

  async function init(currentUser) {
    user = currentUser;
    document.getElementById("custosFixosNav").hidden = !canAccess();
    document.getElementById("custoFixoFormPanel").hidden = !canManage();
    if (!canAccess()) return;
    empresas = Api.pickArray(await Api.get("/api/empresas"), ["empresas", "items", "data"]);
    renderEmpresaOptions();
    Categorias.bind(document.getElementById("custoFixoForm"));
    document.getElementById("custoFixoInicio").value = monthToday();
    if (bound) return;
    bound = true;
    document.getElementById("custoFixoForm").addEventListener("submit", submit);
    document.querySelector("#custoFixoForm [name='forma_pagamento']").addEventListener("change", updateCardFinalField);
    document.getElementById("custoFixoCartaoFinal").addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
      updateCardFinalHint();
    });
    updateCardFinalField();
    document.getElementById("atualizarCustosFixos").addEventListener("click", load);
    document.getElementById("custosFixosList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-end-fixed-cost]");
      if (button) endCost(button);
    });
  }

  window.CustosFixos = { init, load, canAccess };
})();
