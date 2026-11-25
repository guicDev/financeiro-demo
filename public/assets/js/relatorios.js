(function () {
  function buildReportUrl(button) {
    const params = new URLSearchParams();
    const empresaId = Empresas.selectedId();
    if (empresaId) params.set("empresa_id", empresaId);
    [
      ["relFormaPagamento", "forma_pagamento"],
      ["relStatus", "status"],
      ["relCentroCusto", "centro_custo"]
    ].forEach(([id, key]) => {
      const value = document.getElementById(id)?.value;
      if (value) params.set(key, value);
    });
    const fields = (button.dataset.fields || "").split(",").filter(Boolean);
    fields.forEach((field) => {
      const [id, key] = field.split(":");
      const node = document.getElementById(id);
      const value = node?.multiple
        ? Array.from(node.selectedOptions).map((option) => option.value).filter(Boolean).join(",")
        : node?.value;
      if (value) params.set(key, value);
    });
    if (button.dataset.report === "/api/relatorios/cartao-credito.xlsx") {
      const todos = document.getElementById("relTodosCartoes");
      const cartoes = document.getElementById("relCartoes")?.value;
      if (todos && !todos.checked && !cartoes) {
        App.alert("Marque pelo menos um cartão ou selecione Todos os cartões.", "warning");
        return null;
      }
    }
    const query = params.toString();
    return `${button.dataset.report}${query ? `?${query}` : ""}`;
  }

  function syncCartoesSelecionados() {
    const todos = document.getElementById("relTodosCartoes");
    const field = document.getElementById("relCartoes");
    const list = document.getElementById("relCartoesLista");
    if (!todos || !field || !list) return;
    const individuais = Array.from(list.querySelectorAll("input[data-rel-cartao]"));
    individuais.forEach((input) => { input.disabled = todos.checked; });
    list.classList.toggle("is-disabled", todos.checked);
    field.value = todos.checked
      ? ""
      : individuais.filter((input) => input.checked).map((input) => input.value).join(",");
  }

  async function loadCartoes() {
    const field = document.getElementById("relCartoes");
    const list = document.getElementById("relCartoesLista");
    const todos = document.getElementById("relTodosCartoes");
    if (!field || !list || !todos) return;
    try {
      const payload = await Api.get("/api/relatorios/cartoes");
      const selected = new Set(String(field.value || "").split(",").filter(Boolean));
      const cartoes = Api.pickArray(payload, ["cartoes", "items", "data"]);
      list.innerHTML = cartoes.length
        ? cartoes.map((item) => `<label class="card-check-option"><input data-rel-cartao type="checkbox" value="${App.escapeAttr(item.cartao_final)}"${selected.has(item.cartao_final) ? " checked" : ""}>${App.escape(Cartoes.label(item.cartao_final))}</label>`).join("")
        : '<p class="card-check-empty">Nenhum cartão de crédito cadastrado para esta empresa.</p>';
      syncCartoesSelecionados();
    } catch (error) {
      App.alert(error.message || "Não foi possível carregar os cartões.", "error");
    }
  }

  function bindRelatorios() {
    document.querySelectorAll("[data-report]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const url = buildReportUrl(button);
          if (url) window.DemoNotes.download(url);
        } catch (error) {
          App.alert(error.message, "warning");
        }
      });
    });
    const todos = document.getElementById("relTodosCartoes");
    const list = document.getElementById("relCartoesLista");
    todos?.addEventListener("change", syncCartoesSelecionados);
    list?.addEventListener("change", syncCartoesSelecionados);
    loadCartoes();
  }

  window.Relatorios = { bindRelatorios, loadCartoes, syncCartoesSelecionados };
})();
