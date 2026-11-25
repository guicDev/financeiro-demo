(function () {
  let currentNotaId = null;
  let currentNotaEmpresaId = "";

  function userRole() {
    return window.AppState?.user?.tipo || "";
  }

  function permissions(status, empresaId = currentNotaEmpresaId) {
    const role = userRole();
    const activeCompany = typeof Empresas.isActive !== "function" || Empresas.isActive(empresaId);
    const active = activeCompany && status !== "cancelada";
    return {
      canPay: active && ["admin", "financeiro"].includes(role),
      canEdit: active && ["admin", "financeiro", "compras"].includes(role),
      canAdmin: active && ["admin", "financeiro"].includes(role),
      canReverse: active && ["admin", "financeiro"].includes(role)
    };
  }

  function normalizeNota(payload) {
    if (!payload) return {};
    if (payload.nota) {
      return {
        ...payload.nota,
        parcelas: payload.parcelas || [],
        historico: payload.historico || []
      };
    }
    if (payload.data && payload.data.nota) {
      return {
        ...payload.data.nota,
        parcelas: payload.data.parcelas || [],
        historico: payload.data.historico || []
      };
    }
    return payload.data || payload;
  }

  function renderParcelas(parcelas, notaStatus, empresaId = currentNotaEmpresaId, notaVersao = 0) {
    if (!parcelas.length) return '<div class="empty-state">Nenhuma parcela cadastrada.</div>';
    const access = permissions(notaStatus, empresaId);
    return parcelas.map((parcela) => {
      const paid = parcela.status === "paga" || Boolean(parcela.data_pagamento);
      const juros = Number(parcela.juros_centavos || 0);
      const multa = Number(parcela.multa_centavos || 0);
      const devido = Number(parcela.valor_centavos ?? Number(parcela.valor || 0) * 100);
      const original = devido - juros - multa;
      return `
      <article class="list-item">
        <div>
          <strong>Parcela ${App.escape(parcela.numero_parcela || parcela.numero || "-")}</strong>
          <div class="meta">Venc. ${App.formatDate(parcela.data_vencimento)} - ${Dashboard.valueToMoney(devido)}</div>
          ${juros || multa ? `<div class="meta">Original ${Dashboard.valueToMoney(original)} + juros ${Dashboard.valueToMoney(juros)} + multa ${Dashboard.valueToMoney(multa)} = ${Dashboard.valueToMoney(devido)}</div>` : ""}
          <div class="meta">Forma ${App.formatStatus(parcela.forma_pagamento || "-")}</div>
          ${parcela.data_pagamento ? `<div class="meta">Pago em ${App.formatDate(parcela.data_pagamento)}</div>` : ""}
          ${paid && access.canPay ? '<div class="meta">Para alterar encargos, estorne o pagamento. Se houve conciliação, desfaça-a primeiro.</div>' : ""}
        </div>
        <div>
          <span class="status-pill ${App.statusClass(parcela.status)}">${App.formatStatus(parcela.status)}</span>
          ${!paid && access.canPay ? `<button class="secondary-button" data-encargos-id="${parcela.id}" data-encargos-company-id="${App.escapeAttr(empresaId)}" data-encargos-version="${Number(notaVersao)}" data-encargos-base="${original}" data-encargos-juros="${juros}" data-encargos-multa="${multa}" type="button">Juros e multa</button>` : ""}
          ${!paid && access.canPay ? `<button class="secondary-button" data-pay-id="${parcela.id}" data-pay-company-id="${empresaId}" type="button">Pagar</button>` : ""}
          ${paid && access.canReverse ? `<button class="secondary-button" data-reverse-id="${parcela.id}" data-reverse-company-id="${empresaId}" type="button">Estornar</button>` : ""}
        </div>
      </article>
    `;
    }).join("");
  }

  function renderHistorico(items) {
    if (!items.length) return '<div class="empty-state">Sem histórico registrado.</div>';
    return items.map((item) => `
      <article class="list-item">
        <div>
          <strong>${App.escape(item.titulo || item.acao || "Registro")}</strong>
          <div class="meta">Por ${App.escape(item.usuario_exibicao || item.usuario_nome || "Usuário não identificado")} em ${App.formatDateTime(item.quando_exibicao || item.criado_em)}</div>
          ${(item.detalhes && item.detalhes.length)
            ? `<ul class="history-details">${item.detalhes.map((detail) => `<li>${App.escape(detail)}</li>`).join("")}</ul>`
            : `<div class="meta">${App.escape(item.descricao || "")}</div>`}
        </div>
      </article>
    `).join("");
  }

  function renderResumoFinanceiro(nota, parcelas) {
    const resumo = nota.resumo_financeiro || {};
    const total = resumo.valor_total_a_pagar_centavos ?? parcelas.reduce((sum, parcela) => sum + Number(parcela.valor_centavos || 0), 0);
    const pago = resumo.valor_pago_centavos ?? parcelas
      .filter((parcela) => parcela.data_pagamento)
      .reduce((sum, parcela) => sum + Number(parcela.valor_centavos || 0), 0);
    const aberto = parcelas.filter((parcela) => !parcela.data_pagamento)
      .reduce((sum, parcela) => sum + Number(parcela.valor_centavos || 0), 0);
    return `
      <div class="financial-summary">
        <article><span>Total a pagar</span><strong>${Dashboard.valueToMoney(total)}</strong></article>
        <article><span>Valor pago</span><strong>${Dashboard.valueToMoney(pago)}</strong></article>
        <article><span>Valor em aberto</span><strong>${Dashboard.valueToMoney(aberto)}</strong></article>
      </div>
    `;
  }

  function renderDetalhes(nota) {
    currentNotaId = nota.id || null;
    currentNotaEmpresaId = String(nota.empresa_id || "");
    const parcelas = nota.parcelas || [];
    const historico = nota.historico || [];
    const notaNumero = nota.numero_nota || nota.numero || "-";
    const notaFornecedor = nota.fornecedor || "-";
    const notaValor = Dashboard.valueToMoney(nota.valor_total_centavos || nota.valor_total);
    const access = permissions(nota.status, currentNotaEmpresaId);
    document.getElementById("detalhesContent").innerHTML = `
      <div class="details-grid">
        <section class="panel">
          <div class="panel-header">
            <h2>Nota ${App.escape(notaNumero)}</h2>
            <span class="status-pill ${App.statusClass(nota.status)}">${App.formatStatus(nota.status)}</span>
          </div>
          <dl class="detail-list">
            <div><dt>Empresa</dt><dd>${App.escape(nota.empresa_nome || Empresas.getName(nota.empresa_id))}</dd></div>
            <div><dt>Fornecedor</dt><dd>${App.escape(nota.fornecedor || "-")}</dd></div>
            <div><dt>CNPJ/CPF</dt><dd>${App.escape(nota.cnpj_cpf || "-")}</dd></div>
            <div><dt>Emissão</dt><dd>${App.formatDate(nota.data_emissao)}</dd></div>
            <div><dt>Lançamento</dt><dd>${App.formatDate(nota.data_lancamento || nota.criado_em)}</dd></div>
            <div><dt>Valor original da nota</dt><dd>${Dashboard.valueToMoney(nota.valor_total_centavos || nota.valor_total)}</dd></div>
            <div><dt>Categoria</dt><dd>${App.escape(nota.categoria_grupo ? `${nota.categoria_grupo} / ${nota.categoria || ''}` : nota.categoria || "-")}</dd></div>
            <div><dt>Centro de custo</dt><dd>${App.escape(nota.centro_custo || "-")}</dd></div>
            <div><dt>Forma de pagamento</dt><dd>${App.escape(nota.forma_pagamento || "-")}</dd></div>
            ${nota.custo_fixo_id ? `<div><dt>Custo fixo</dt><dd>${App.escape(nota.custo_fixo_descricao || "Mensal")} — competencia ${App.escape(nota.competencia_custo_fixo || "-")}</dd></div>` : ""}
            <div><dt>Parcelas</dt><dd>${App.escape(nota.numero_parcelas || parcelas.length || "-")}</dd></div>
            <div><dt>Anexo</dt><dd>${nota.anexo_nota ? `<a href="${App.escapeAttr(nota.anexo_nota)}" target="_blank" rel="noreferrer">Abrir arquivo</a>` : "-"}</dd></div>
          </dl>
          ${renderResumoFinanceiro(nota, parcelas)}
          <p>${App.escape(nota.observacoes || "")}</p>
          <div class="form-actions">
            <button class="secondary-button" data-view-link="notas" type="button">Voltar</button>
            ${access.canEdit ? `<button class="primary-button" data-edit-id="${nota.id}" data-company-id="${currentNotaEmpresaId}" type="button">Editar</button>` : ""}
            ${nota.recorrencia_id && window.Series?.canRemove(currentNotaEmpresaId) ? `<button class="secondary-button" data-series-remove-id="${Number(nota.recorrencia_id)}" data-company-id="${currentNotaEmpresaId}" type="button">Corrigir quantidade</button><button class="ghost-button" data-series-delete-id="${Number(nota.recorrencia_id)}" data-company-id="${currentNotaEmpresaId}" type="button">Excluir série inteira</button>` : ""}
            ${access.canAdmin ? `<button class="ghost-button" data-cancel-id="${nota.id}" data-company-id="${currentNotaEmpresaId}" data-note-number="${App.escapeAttr(notaNumero)}" data-note-supplier="${App.escapeAttr(notaFornecedor)}" data-note-value="${App.escapeAttr(notaValor)}" type="button">Cancelar nota</button>` : ""}
            ${access.canAdmin ? `<button class="ghost-button" data-delete-id="${nota.id}" data-company-id="${currentNotaEmpresaId}" data-note-number="${App.escapeAttr(notaNumero)}" data-note-supplier="${App.escapeAttr(notaFornecedor)}" data-note-value="${App.escapeAttr(notaValor)}" type="button">Excluir</button>` : ""}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><h2>Parcelas</h2></div>
          <div id="detalheParcelas" class="stack-list">${renderParcelas(parcelas, nota.status, currentNotaEmpresaId, nota.versao)}</div>
        </section>
      </div>
      <section class="panel" style="margin-top:18px">
        <div class="panel-header"><h2>Histórico</h2></div>
        <div class="stack-list">${renderHistorico(historico)}</div>
      </section>
    `;
  }

  async function loadDetalhes(id, empresaId = '') {
    const requestedEmpresaId = String(empresaId || '');
    if (!requestedEmpresaId && !Empresas.hasSelection()) {
      App.alert("Selecione uma empresa para consultar a nota.", "warning");
      App.showView("notas");
      return;
    }
    App.showView("detalhes");
    document.getElementById("detalhesContent").innerHTML = '<div class="panel">Carregando detalhes...</div>';
    try {
      const options = requestedEmpresaId ? { headers: { 'X-Empresa-Id': requestedEmpresaId } } : undefined;
      const payload = await Api.get(`/api/notas/${id}`, undefined, options);
      renderDetalhes(normalizeNota(payload));
    } catch (error) {
      App.alert(error.message, "error");
      document.getElementById("detalhesContent").innerHTML = '<div class="empty-state">Não foi possível carregar a nota.</div>';
    }
  }

  async function refreshDetalhes() {
    if (!currentNotaId) return;
    const options = currentNotaEmpresaId ? { headers: { "X-Empresa-Id": currentNotaEmpresaId } } : undefined;
    const payload = await Api.get(`/api/notas/${currentNotaId}`, undefined, options);
    renderDetalhes(normalizeNota(payload));
  }

  async function openPagarHojeDetalhes(button) {
    const companyId = button.dataset.pagarHojeCompanyId;
    await loadDetalhes(button.dataset.pagarHojeDetailId, companyId);
  }

  function openPaymentForm(button) {
    const item = button.closest(".list-item");
    if (item.querySelector(".payment-form")) return;
    const template = document.getElementById("paymentTemplate").content.cloneNode(true);
    const form = template.querySelector("form");
    form.dataset.parcelaId = button.dataset.payId;
    form.dataset.originView = App.currentView;
    form.dataset.empresaId = button.dataset.payCompanyId || "";
    form.querySelector("[name='data_pagamento']").value = todayManaus();
    item.appendChild(template);
  }

  function encargosCentavos(value, atual = 0) {
    const text = String(value || "").trim();
    if (!text) return atual;
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) throw new Error("Informe juros e multa em reais, com até duas casas decimais.");
    const cents = Math.round(App.parseMoney(text) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Valor de encargo inválido.");
    return cents;
  }

  function updateEncargosPreview(form) {
    const preview = form.querySelector("[data-encargos-preview]");
    try {
      const total = Number(form.dataset.base) + encargosCentavos(form.elements.juros.value, Number(form.dataset.juros)) + encargosCentavos(form.elements.multa.value, Number(form.dataset.multa));
      if (!Number.isSafeInteger(total)) throw new Error("Valor inválido.");
      preview.textContent = `Novo total desta parcela: ${Dashboard.valueToMoney(total)}`;
    } catch {
      preview.textContent = "Confira os valores de juros e multa.";
    }
  }

  function openEncargosForm(button) {
    const item = button.closest(".list-item");
    if (item.querySelector(".encargos-form")) return;
    item.querySelector(".payment-form")?.remove();
    const form = document.createElement("form");
    form.className = "encargos-form";
    form.dataset.parcelaId = button.dataset.encargosId;
    form.dataset.empresaId = button.dataset.encargosCompanyId;
    form.dataset.versao = button.dataset.encargosVersion;
    form.dataset.base = button.dataset.encargosBase;
    form.dataset.juros = button.dataset.encargosJuros;
    form.dataset.multa = button.dataset.encargosMulta;
    form.innerHTML = `
      <label>Juros (R$)<input name="juros" inputmode="decimal" placeholder="Deixe vazio para manter" ></label>
      <label>Multa (R$)<input name="multa" inputmode="decimal" placeholder="Deixe vazio para manter" ></label>
      <div class="meta" data-encargos-preview></div>
      <div class="form-actions"><button class="secondary-button" type="button" data-encargos-close>Cancelar</button><button class="primary-button" type="submit">Salvar encargos</button></div>
    `;
    item.appendChild(form);
    updateEncargosPreview(form);
    form.elements.juros.focus();
  }

  async function submitEncargos(form) {
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    try {
      const juros_centavos = encargosCentavos(form.elements.juros.value, Number(form.dataset.juros));
      const multa_centavos = encargosCentavos(form.elements.multa.value, Number(form.dataset.multa));
      const empresaId = form.dataset.empresaId;
      const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
      await Api.putJson(`/api/parcelas/${form.dataset.parcelaId}/encargos`, {
        juros_centavos, multa_centavos, versao: Number(form.dataset.versao)
      }, options);
      App.alert("Encargos atualizados nesta parcela.", "success");
      await refreshDetalhes();
      await Notas.loadNotas({ silent: true });
    } catch (error) {
      App.alert(error.message, "error");
      submit.disabled = false;
    }
  }

  function todayManaus() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Manaus",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date()).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  async function reloadCurrentView(originView) {
    if (originView === "pagar-hoje") {
      await PagarHoje.load();
      return;
    }
    if (originView === "detalhes" && currentNotaId) await loadDetalhes(currentNotaId, currentNotaEmpresaId);
  }

  async function submitPayment(form) {
    const id = form.dataset.parcelaId;
    const originView = form.dataset.originView || App.currentView;
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    try {
      const empresaId = String(form.dataset.empresaId || "");
      const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
      await Api.postForm(`/api/parcelas/${id}/pagar`, new FormData(form), options);
      App.alert("Pagamento registrado.", "success");
      await reloadCurrentView(originView);
    } catch (error) {
      App.alert(error.message, "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function reversePayment(id, empresaId = currentNotaEmpresaId) {
    const motivo = String(window.prompt("Informe o motivo do estorno:") || "").trim();
    if (!motivo) {
      App.alert("Informe o motivo do estorno.", "warning");
      return;
    }
    try {
      const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
      await Api.postJson(`/api/parcelas/${id}/estornar`, { motivo }, options);
      App.alert("Pagamento estornado.", "success");
      await reloadCurrentView(App.currentView);
    } catch (error) {
      App.alert(error.message || "Não foi possível estornar o pagamento.", "error");
    }
  }

  async function cancelNota(id, empresaId = currentNotaEmpresaId) {
    const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
    await Api.postJson(`/api/notas/${id}/cancelar`, {}, options);
    App.alert("Nota cancelada.", "success");
    await loadDetalhes(id, empresaId);
  }

  async function deleteNota(id, empresaId = currentNotaEmpresaId) {
    const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
    await Api.delete(`/api/notas/${id}`, options);
    App.alert("Nota excluida.", "success");
    App.showView("notas");
    await Notas.loadNotas();
  }

  function showDangerConfirmation(trigger, config) {
    const panel = trigger.closest(".panel");
    const actions = trigger.closest(".form-actions");
    panel.querySelector(".danger-confirm")?.remove();
    const noteNumber = trigger.dataset.noteNumber || "-";
    const supplier = trigger.dataset.noteSupplier || "-";
    const value = trigger.dataset.noteValue || "-";
    const box = document.createElement("div");
    box.className = "danger-confirm";
    box.innerHTML = `
      <strong>${App.escape(config.title)}</strong>
      <p>${App.escape(config.message)}</p>
      <p>Nota ${App.escape(noteNumber)} - ${App.escape(supplier)} - ${App.escape(value)}</p>
      <div class="danger-confirm-actions">
        <button class="secondary-button" type="button" data-danger-close>Manter nota</button>
        <button class="danger-button" type="button" data-danger-confirm>${App.escape(config.confirmLabel)}</button>
      </div>
    `;
    actions.insertAdjacentElement("afterend", box);
    box.querySelector("[data-danger-close]").addEventListener("click", () => box.remove());
    box.querySelector("[data-danger-confirm]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Confirmando...";
      try {
        await config.onConfirm();
      } catch (error) {
        App.alert(error.message || "Não foi possível concluir a ação.", "error");
        button.disabled = false;
        button.textContent = config.confirmLabel;
      }
    });
  }

  function bindDetalhes() {
    document.addEventListener("click", async (event) => {
      const pay = event.target.closest("[data-pay-id]");
      const pagarHojeDetail = event.target.closest("[data-pagar-hoje-detail-id]");
      const reverse = event.target.closest("[data-reverse-id]");
      const encargos = event.target.closest("[data-encargos-id]");
      const closeEncargos = event.target.closest("[data-encargos-close]");
      const edit = event.target.closest("[data-edit-id]");
      const cancel = event.target.closest("[data-cancel-id]");
      const del = event.target.closest("[data-delete-id]");
      const seriesRemove = event.target.closest("[data-series-remove-id], [data-series-delete-id]");
      if (seriesRemove) {
        const empresaId = seriesRemove.dataset.companyId;
        await Series.open({
          serieId: seriesRemove.dataset.seriesRemoveId || seriesRemove.dataset.seriesDeleteId,
          empresaId,
          whole: Boolean(seriesRemove.dataset.seriesDeleteId),
          onSuccess: async (result) => {
            currentNotaId = null;
            App.showView("notas");
            if (result.nota_restante_id) await loadDetalhes(result.nota_restante_id, empresaId);
          }
        });
      }
      if (pay) {
        openPaymentForm(pay);
      }
      if (encargos) openEncargosForm(encargos);
      if (closeEncargos) closeEncargos.closest(".encargos-form").remove();
      if (pagarHojeDetail) await openPagarHojeDetalhes(pagarHojeDetail);
      if (reverse) await reversePayment(reverse.dataset.reverseId, reverse.dataset.reverseCompanyId);
      if (edit) {
        try { await Notas.editNota(edit.dataset.editId, edit.dataset.companyId); } catch (error) { App.alert(error.message, "error"); }
      }
      if (cancel) {
        showDangerConfirmation(cancel, {
          title: "Cancelar esta nota?",
          message: "A nota deixa de aparecer como pendente, mas o histórico continua salvo para consulta.",
          confirmLabel: "Cancelar nota",
          onConfirm: () => cancelNota(cancel.dataset.cancelId, cancel.dataset.companyId)
        });
      }
      if (del) {
        showDangerConfirmation(del, {
          title: "Excluir definitivamente?",
          message: "Esta ação remove a nota do sistema. Use apenas quando o lançamento estiver incorreto.",
          confirmLabel: "Excluir nota",
          onConfirm: () => deleteNota(del.dataset.deleteId, del.dataset.companyId)
        });
      }
    });

    document.addEventListener("submit", (event) => {
      if (event.target.classList.contains("encargos-form")) {
        event.preventDefault();
        submitEncargos(event.target);
      }
      if (event.target.classList.contains("payment-form")) {
        event.preventDefault();
        submitPayment(event.target);
      }
    });

    document.addEventListener("input", (event) => {
      const form = event.target.closest(".encargos-form");
      if (form) updateEncargosPreview(form);
    });
  }

  window.Detalhes = {
    bindDetalhes,
    loadDetalhes,
    refreshDetalhes,
    openPagarHojeDetalhes,
    renderParcelas,
    renderDetalhes,
    submitPayment,
    openEncargosForm,
    updateEncargosPreview,
    submitEncargos,
    reversePayment,
    todayManaus
  };
})();
