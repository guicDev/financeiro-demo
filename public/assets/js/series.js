(function () {
  let current = null;
  let generation = 0;

  function canRemove(empresaId) {
    return ["admin", "financeiro"].includes(window.AppState?.user?.tipo)
      && Empresas.isActive(empresaId);
  }

  function selectionSummary(notas, ids, whole) {
    const selected = new Set(ids.map(Number));
    const removed = notas.filter((nota) => selected.has(Number(nota.id)));
    const remaining = notas.filter((nota) => !selected.has(Number(nota.id)));
    let error = "";
    if (!removed.length) error = "Selecione as notas que deseja remover.";
    else if (removed.some((nota) => nota.paga)) error = "Notas com pagamento registrado não podem ser removidas.";
    else if (whole && remaining.length) error = "A exclusão inteira precisa incluir todas as notas da série.";
    else if (!whole && !remaining.some((nota) => nota.status !== "cancelada")) error = "Mantenha pelo menos uma nota ativa ou escolha excluir a série inteira.";
    const sum = (rows) => rows.reduce((total, nota) => total + Number(nota.valor_total_centavos || 0), 0);
    return { removed, remaining, removedTotal: sum(removed), remainingTotal: sum(remaining), error };
  }

  function dialog() {
    let element = document.getElementById("serieRemovalDialog");
    if (element) return element;
    element = document.createElement("dialog");
    element.id = "serieRemovalDialog";
    element.className = "serie-removal-dialog";
    element.setAttribute("aria-labelledby", "serieRemovalTitle");
    document.body.appendChild(element);
    element.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    return element;
  }

  function close() {
    if (current?.busy) return;
    const element = dialog();
    const trigger = current?.trigger;
    generation += 1;
    current = null;
    element.close();
    trigger?.focus();
  }

  function selectedIds() {
    return Array.from(dialog().querySelectorAll("[data-serie-select]:checked"), (input) => Number(input.dataset.serieSelect));
  }

  function summaryText(summary) {
    return `Remover: ${summary.removed.length} nota(s), ${Dashboard.valueToMoney(summary.removedTotal)}. Manter: ${summary.remaining.length} nota(s), ${Dashboard.valueToMoney(summary.remainingTotal)}.`;
  }

  function updateSummary() {
    if (!current?.payload) return;
    const summary = selectionSummary(current.payload.notas, selectedIds(), current.whole);
    document.getElementById("serieRemovalSummary").textContent = summaryText(summary);
    document.getElementById("serieRemovalMessage").textContent = summary.error;
    document.getElementById("serieRemovalReview").disabled = Boolean(summary.error) || current.busy || current.stale;
    document.getElementById("serieRemovalConfirmation").hidden = true;
    current.confirmedKey = null;
  }

  function render() {
    const state = current;
    const element = dialog();
    element.innerHTML = `
      <h2 id="serieRemovalTitle">${state.whole ? "Excluir série inteira" : "Corrigir quantidade da série"}</h2>
      <p>${state.whole ? "Todas as notas abaixo serão removidas." : "Marque as notas que deseja remover. As demais serão mantidas."} O histórico será preservado.</p>
      <p class="meta">Empresa: ${App.escape(Empresas.getName(state.empresaId))}. Notas com pagamento registrado ficam protegidas.</p>
      <div class="serie-removal-rows">${state.payload.notas.map((nota) => `
        <label class="serie-removal-row">
          <input type="checkbox" data-serie-select="${Number(nota.id)}" ${state.whole ? "checked" : ""} ${nota.paga || state.whole ? "disabled" : ""}>
          <span><strong>Nota ${App.escape(nota.numero_nota || "-")} · ${App.escape(nota.fornecedor || "-")}</strong>
          <span class="meta">Emissão: ${App.formatDate(nota.data_emissao)} · Vencimento: ${App.formatDate(nota.data_vencimento)}</span>
          <span>${Dashboard.valueToMoney(nota.valor_total_centavos)} · ${App.escape(App.formatStatus(nota.status))}${nota.paga ? " · Pagamento registrado — protegida" : ""}</span></span>
        </label>`).join("")}</div>
      <p id="serieRemovalSummary" aria-live="polite"></p>
      <p id="serieRemovalMessage" role="alert"></p>
      <div id="serieRemovalConfirmation" class="danger-confirm" hidden>
        <strong>Confirma a remoção das notas selecionadas?</strong>
        <p id="serieRemovalConfirmationText"></p>
        <button id="serieRemovalConfirm" class="danger-button" type="button">Confirmar remoção</button>
      </div>
      <div class="form-actions">
        <button id="serieRemovalClose" class="secondary-button" type="button">Voltar sem remover</button>
        <button id="serieRemovalReload" class="secondary-button" type="button" hidden>Recarregar prévia</button>
        <button id="serieRemovalReview" class="danger-button" type="button">Revisar remoção</button>
      </div>`;
    element.querySelectorAll("[data-serie-select]").forEach((input) => input.addEventListener("change", updateSummary));
    document.getElementById("serieRemovalClose").addEventListener("click", close);
    document.getElementById("serieRemovalReload").addEventListener("click", () => loadPreview(state));
    document.getElementById("serieRemovalReview").addEventListener("click", () => {
      if (state.busy || state.stale) return;
      const summary = selectionSummary(state.payload.notas, selectedIds(), state.whole);
      if (summary.error) return;
      state.confirmedKey = JSON.stringify(selectedIds());
      document.getElementById("serieRemovalConfirmationText").textContent = summaryText(summary);
      document.getElementById("serieRemovalConfirmation").hidden = false;
      document.getElementById("serieRemovalConfirm").focus();
    });
    document.getElementById("serieRemovalConfirm").addEventListener("click", submit);
    updateSummary();
  }

  async function loadPreview(state) {
    if (state.busy) return;
    state.payload = null;
    state.stale = true;
    const token = ++generation;
    const element = dialog();
    element.innerHTML = '<h2 id="serieRemovalTitle">Carregando série...</h2><p role="status">Buscando notas e pagamentos.</p><button id="serieRemovalClose" class="secondary-button" type="button">Voltar</button>';
    document.getElementById("serieRemovalClose").addEventListener("click", close);
    try {
      const payload = await Api.get(`/api/notas/recorrencias/${state.serieId}/remocao`, undefined, { headers: { "X-Empresa-Id": state.empresaId } });
      if (current !== state || token !== generation) return;
      state.payload = payload;
      state.stale = false;
      render();
    } catch (error) {
      if (current !== state || token !== generation) return;
      element.querySelector("[role='status']").textContent = error.message || "Não foi possível carregar a série. Feche e tente novamente.";
    }
  }

  async function submit() {
    const state = current;
    if (!state || state.busy || state.stale || !state.payload) return;
    const ids = selectedIds();
    if (state.confirmedKey !== JSON.stringify(ids)) return;
    const summary = selectionSummary(state.payload.notas, ids, state.whole);
    if (summary.error) return;
    state.busy = true;
    dialog().querySelectorAll("button, input").forEach((item) => { item.disabled = true; });
    let result;
    try {
      result = await Api.postJson(`/api/notas/recorrencias/${state.serieId}/remover`, {
        nota_ids: ids, snapshot: state.payload.snapshot, excluir_serie: state.whole
      }, { headers: { "X-Empresa-Id": state.empresaId } });
    } catch (error) {
      state.busy = false;
      state.stale = true;
      state.confirmedKey = null;
      document.getElementById("serieRemovalConfirmation").hidden = true;
      document.getElementById("serieRemovalMessage").textContent = `${error.message || "Não foi possível concluir."} Recarregue a prévia e confira as notas antes de confirmar novamente.`;
      document.getElementById("serieRemovalClose").disabled = false;
      const reload = document.getElementById("serieRemovalReload");
      reload.hidden = false;
      reload.disabled = false;
      reload.focus();
      return;
    }
    state.busy = false;
    close();
    App.alert(`${result.removidas} nota(s) removida(s). ${result.restantes} mantida(s).`, "success");
    try {
      await state.onSuccess(result);
      await Notas.loadNotas();
    } catch (error) {
      App.showView("notas");
      App.alert("Remoção concluída. Recarregue a página para consultar os dados atualizados.", "warning");
    }
  }

  async function open({ serieId, empresaId, whole = false, onSuccess = async () => {} }) {
    if (current?.busy) return;
    if (!canRemove(empresaId)) {
      App.alert("Seu perfil ou a empresa não permite remover notas da série.", "warning");
      return;
    }
    current = { serieId: Number(serieId), empresaId: String(empresaId), whole, onSuccess, busy: false, trigger: document.activeElement };
    const element = dialog();
    if (!element.open) element.showModal();
    await loadPreview(current);
  }

  window.Series = { open, canRemove, selectionSummary };
})();
