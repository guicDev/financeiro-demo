(function () {
  const MAX_PARCELAS = 120;
  let editingNotaId = null;
  let editingNotaVersion = null;
  let editingEmpresaId = null;
  let editingRecorrenciaId = null;
  let suppressResetHandler = false;
  let lastParcelasGlobalKey = "";
  let preserveCadastroStateOnce = false;
  let paidParcelasByNumber = new Map();
  let editingDirty = false;
  let submittingNota = false;
  let documentoSugerido = "";
  let buscaDocumentoId = 0;
  let buscaDocumentoTimer;

  function limparSugestoesDocumento() {
    clearTimeout(buscaDocumentoTimer);
    buscaDocumentoId += 1;
    document.getElementById("documentosFornecedor").replaceChildren();
    const campo = document.querySelector("#notaForm [name='cnpj_cpf']");
    if (documentoSugerido && campo.value === documentoSugerido) campo.value = "";
    documentoSugerido = "";
  }

  function sugerirDocumentoFornecedor() {
    limparSugestoesDocumento();
    if (editingNotaId) return;
    const form = document.getElementById("notaForm");
    const fornecedor = form.elements.fornecedor.value.trim();
    const empresaId = form.elements.empresa_id.value;
    if (!fornecedor || !empresaId) return;
    const buscaId = buscaDocumentoId;
    buscaDocumentoTimer = setTimeout(async () => {
      try {
        const documentos = await Api.get("/api/notas/documentos-fornecedor", { fornecedor }, { headers: { "X-Empresa-Id": empresaId } });
        if (buscaId !== buscaDocumentoId || editingNotaId || form.elements.fornecedor.value.trim() !== fornecedor || form.elements.empresa_id.value !== empresaId) return;
        const lista = document.getElementById("documentosFornecedor");
        for (const numero of documentos) {
          const opcao = document.createElement("option");
          opcao.value = numero;
          lista.append(opcao);
        }
        const campo = form.elements.cnpj_cpf;
        if (documentos.length === 1 && !campo.value.trim()) {
          campo.value = documentos[0];
          documentoSugerido = documentos[0];
        }
      } catch {
        // A consulta falhou; o campo permanece livre para preenchimento manual.
      }
    }, 250);
  }

  function userRole() {
    return window.AppState?.user?.tipo || "";
  }

  function canEditNotas() {
    return ["admin", "financeiro", "compras"].includes(userRole());
  }

  function notaParams() {
    const params = {
      busca: document.getElementById("notaBusca").value.trim(),
      status: document.getElementById("notaStatus").value,
      inicio: document.getElementById("notaInicio").value,
      fim: document.getElementById("notaFim").value
    };
    return params;
  }

  function normalizeNotas(payload) {
    return Api.pickArray(payload, ["notas", "items", "data", "resultados"]);
  }

  function renderNotas(notas) {
    const tbody = document.getElementById("notasTable");
    const mostrarParcela = document.getElementById("notaMostrarParcela").checked;
    document.getElementById("notaValorHeader").textContent = mostrarParcela ? "Valor da parcela" : "Total a pagar";
    if (!notas.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma nota encontrada. Ajuste os filtros ou cadastre uma nova nota.</td></tr>';
      tbody.dataset.rendered = "1";
      return;
    }

    tbody.innerHTML = notas.map((nota) => `
      <tr>
        <td>${App.escape(nota.empresa_nome || Empresas.getName(nota.empresa_id))}</td>
        <td>${App.escape(nota.numero_nota || nota.numero || "-")}</td>
        <td>${App.escape(nota.fornecedor || "-")}</td>
        <td>${App.formatDate(nota.data_emissao)}</td>
        <td>${mostrarParcela
          ? nota.valor_parcela_exibicao_centavos == null ? "—" : Dashboard.valueToMoney(nota.valor_parcela_exibicao_centavos)
          : Dashboard.valueToMoney(nota.valor_total_a_pagar_centavos ?? nota.valor_total_centavos ?? nota.valor_total)}</td>
        <td><span class="status-pill ${App.statusClass(nota.status)}">${App.formatStatus(nota.status)}</span></td>
        <td><button class="secondary-button" data-detail-id="${nota.id}" data-empresa-id="${nota.empresa_id}" type="button">Detalhes</button></td>
      </tr>
    `).join("");
    tbody.dataset.rendered = "1";
  }

  async function loadNotas({ silent = false } = {}) {
    const tbody = document.getElementById("notasTable");
    if (!silent && !tbody.dataset.rendered) tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Buscando notas...</td></tr>';
    try {
      const payload = await Api.get("/api/notas", notaParams());
      renderNotas(normalizeNotas(payload));
    } catch (error) {
      if (silent) return;
      App.alert(error.message || "Não foi possível carregar as notas.", "error");
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Não conseguimos carregar as notas agora. Tente filtrar novamente.</td></tr>';
    }
  }

  async function clearNotaFilters() {
    document.getElementById("notaBusca").value = "";
    document.getElementById("notaStatus").value = "";
    document.getElementById("notaInicio").value = "";
    document.getElementById("notaFim").value = "";
    document.getElementById("notaMostrarParcela").checked = true;
    await loadNotas();
  }

  function buildNotaFormData(form) {
    if (!Categorias.validate(form)) throw new Error("Selecione uma categoria válida.");
    const formData = new FormData(form);
    if (form.elements?.empresa_id?.disabled) formData.set('empresa_id', form.elements.empresa_id.value);
    if (!editingNotaId && !formData.get("empresa_id")) {
      throw new Error("Selecione a empresa da nota.");
    }
    let totalCentavos = Math.round(App.parseMoney(formData.get("valor_total")) * 100);
    const quantidade = normalizeParcelCount();
    formData.set("numero_parcelas", String(quantidade));
    formData.set("valor_total_centavos", String(totalCentavos));
    const parcelas = [];
    document.querySelectorAll(".parcela-row").forEach((row) => {
      const numero = row.querySelector("[data-parcela-numero]").value;
      const valor = row.querySelector("[data-parcela-valor]").value;
      const vencimento = row.querySelector("[data-parcela-vencimento]").value;
      const valorCentavos = Math.round(App.parseMoney(valor) * 100);
      if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
        throw new Error(`A parcela ${numero} deve possuir valor maior que zero.`);
      }
      parcelas.push({
        numero_parcela: numero,
        valor,
        valor_centavos: valorCentavos,
        data_vencimento: vencimento
      });
    });
    const somaCentavos = parcelas.reduce((total, parcela) => total + parcela.valor_centavos, 0);
    if (editingNotaId && !editingRecorrenciaId) {
      totalCentavos = somaCentavos;
      formData.set("valor_total", App.moneyInput(totalCentavos / 100));
    }
    if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) throw new Error("Informe um valor total maior que zero.");
    if (somaCentavos !== totalCentavos) {
      throw new Error("A soma das parcelas deve ser igual ao valor total da nota.");
    }
    if (parcelas.length !== quantidade) {
      throw new Error("Gere todas as parcelas antes de salvar a nota.");
    }
    formData.set("parcelas_json", JSON.stringify(parcelas));
    if (editingNotaId && Number.isInteger(editingNotaVersion)) formData.set("versao", String(editingNotaVersion));
    return formData;
  }

  function setField(form, name, value) {
    const field = form.elements[name];
    if (field && field.type !== "file") field.value = value ?? "";
  }

  function normalizeNota(payload) {
    if (!payload) return { nota: {}, parcelas: [] };
    if (payload.nota) return { nota: payload.nota, parcelas: payload.parcelas || [] };
    if (payload.data && payload.data.nota) return { nota: payload.data.nota, parcelas: payload.data.parcelas || [] };
    return { nota: payload.data || payload, parcelas: payload.parcelas || [] };
  }

  function normalizeFormaPagamento(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_");

    if (normalized === "pix") return "pix";
    if (normalized === "boleto") return "boleto";
    if (["cartao", "cartao_credito", "cartao_de_credito", "credito"].includes(normalized)) return "cartao_credito";
    if (["nao_informado", "nao_informada", "indefinido"].includes(normalized)) return "nao_informado";
    return "nao_informado";
  }

  function addMonths(dateValue, months) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const targetMonthIndex = (month - 1) + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate();
    const targetDay = Math.min(day, lastDay);
    return `${targetYear}-${String(normalizedMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
  }

  function todayValue() {
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

  function normalizeParcelCount() {
    const field = document.getElementById("numeroParcelas");
    const parsed = Number(field.value || 1);
    const quantidade = Math.min(MAX_PARCELAS, Math.max(1, Number.isInteger(parsed) ? parsed : 1));
    field.value = String(quantidade);
    return quantidade;
  }

  function baseVencimento(forma, quantidade) {
    const primeiro = document.getElementById("primeiroVencimento").value;
    const fatura = document.getElementById("dataVencimentoFatura").value;

    if (forma === "cartao_credito") return fatura || primeiro || "";
    if (forma === "boleto") return primeiro || "";
    if (forma === "nao_informado") return primeiro || "";
    if (forma === "pix" && quantidade === 1) return primeiro || todayValue();
    if (forma === "pix") return primeiro || "";
    return primeiro || "";
  }

  function isRecorrente() {
    return Boolean(document.getElementById("notaRecorrente").checked);
  }

  function occurrenceRow({ dataEmissao = "", dataVencimento = "", valor = "", notaId = "", versao = "", paid = false, removivel = true } = {}) {
    const identity = notaId ? ` data-ocorrencia-nota-id="${App.escapeAttr(notaId)}" data-ocorrencia-versao="${App.escapeAttr(versao)}"` : "";
    const bloqueado = paid ? " disabled" : "";
    return `
      <div class="parcela-row ocorrencia-row"${identity}>
        <label>Emissao<input data-ocorrencia-emissao type="date" value="${App.escapeAttr(dataEmissao)}" required></label>
        <label>Vencimento<input data-ocorrencia-vencimento type="date" value="${App.escapeAttr(dataVencimento)}" required${bloqueado}></label>
        <label>Valor<input data-ocorrencia-valor inputmode="decimal" value="${App.escapeAttr(valor)}" placeholder="0,00" required${bloqueado}></label>
        ${removivel ? '<button class="ghost-button" data-remover-ocorrencia type="button">Remover</button>' : ""}
        ${paid ? '<span class="meta">Parcela paga — valor e vencimento bloqueados</span>' : ""}
      </div>`;
  }

  function addOcorrencia(values = {}) {
    document.getElementById("ocorrenciasFields").insertAdjacentHTML("beforeend", occurrenceRow(values));
  }

  function gerarOcorrencias({ confirmReplace = false } = {}) {
    if (confirmReplace && document.querySelector(".ocorrencia-row")
      && !window.confirm("Gerar linhas novamente substitui as datas e os valores das linhas atuais. Continuar?")) return;
    const quantidadeField = document.getElementById("recorrenciaQuantidade");
    const parsed = Number(quantidadeField.value || 1);
    const quantidade = Math.min(MAX_PARCELAS, Math.max(1, Number.isInteger(parsed) ? parsed : 1));
    quantidadeField.value = String(quantidade);
    const emissao = document.querySelector("[name='data_emissao']").value || todayValue();
    const vencimento = baseVencimento(document.getElementById("formaPagamento").value, 1) || emissao;
    const valor = document.querySelector("[name='valor_total']").value || "";
    const container = document.getElementById("ocorrenciasFields");
    container.innerHTML = Array.from({ length: quantidade }, (_, index) => occurrenceRow({
      dataEmissao: addMonths(emissao, index),
      dataVencimento: addMonths(vencimento, index),
      valor
    })).join("");
  }

  function setRecorrenciaMode(enabled, { gerar = false } = {}) {
    const recorrenciaPanel = document.getElementById("recorrenciaPanel");
    const parcelasPanel = document.getElementById("parcelasPanel");
    const numeroParcelas = document.getElementById("numeroParcelas");
    const primeiro = document.getElementById("primeiroVencimento");
    const fatura = document.getElementById("dataVencimentoFatura");
    const valorTotal = document.querySelector("[name='valor_total']");
    const anexo = document.querySelector("[name='anexo_nota']");
    const editingSerie = Boolean(editingRecorrenciaId);
    recorrenciaPanel.hidden = !enabled;
    parcelasPanel.hidden = enabled;
    numeroParcelas.disabled = enabled;
    primeiro.disabled = enabled;
    fatura.disabled = enabled;
    valorTotal.required = !enabled;
    anexo.disabled = enabled;
    document.getElementById("recorrenciaQuantidade").closest(".item-actions").hidden = editingSerie;
    document.getElementById("adicionarOcorrencia").hidden = editingSerie;
    const removalActions = document.getElementById("serieRemovalActions");
    if (removalActions) removalActions.hidden = !editingSerie || !window.Series?.canRemove(editingEmpresaId);
    if (enabled) {
      if (!editingSerie && (gerar || !document.querySelector(".ocorrencia-row"))) gerarOcorrencias();
    } else {
      updatePaymentFields();
      if (!editingNotaId) gerarParcelas();
    }
  }

  function buildRecorrentePayload(form) {
    if (!Categorias.validate(form)) throw new Error("Selecione uma categoria válida.");
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.empresa_id) throw new Error("Selecione a empresa da nota.");
    const ocorrencias = Array.from(document.querySelectorAll(".ocorrencia-row")).map((row, index) => {
      const valor = row.querySelector("[data-ocorrencia-valor]").value;
      const valorCentavos = Math.round(App.parseMoney(valor) * 100);
      const dataEmissao = row.querySelector("[data-ocorrencia-emissao]").value;
      const dataVencimento = row.querySelector("[data-ocorrencia-vencimento]").value;
      if (!dataEmissao || !dataVencimento) throw new Error(`Preencha emissao e vencimento da ocorrencia ${index + 1}.`);
      if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) throw new Error(`Informe um valor maior que zero na ocorrencia ${index + 1}.`);
      return { data_emissao: dataEmissao, data_vencimento: dataVencimento, valor_total: valor };
    });
    if (!ocorrencias.length) throw new Error("Inclua ao menos uma ocorrencia.");
    data.ocorrencias_json = JSON.stringify(ocorrencias);
    delete data.anexo_nota;
    delete data.numero_parcelas;
    delete data.primeiro_vencimento;
    delete data.data_vencimento_fatura;
    return data;
  }

  function buildEditarRecorrenciaPayload(form) {
    if (!Categorias.validate(form)) throw new Error("Selecione uma categoria válida.");
    const data = Object.fromEntries(new FormData(form).entries());
    data.empresa_id = String(editingEmpresaId || "");
    if (!data.empresa_id) throw new Error("Selecione uma empresa da serie.");
    const ocorrencias = Array.from(document.querySelectorAll(".ocorrencia-row")).map((row, index) => {
      const notaId = row.dataset.ocorrenciaNotaId;
      const versao = row.dataset.ocorrenciaVersao;
      const valor = row.querySelector("[data-ocorrencia-valor]").value;
      const valorCentavos = Math.round(App.parseMoney(valor) * 100);
      const dataEmissao = row.querySelector("[data-ocorrencia-emissao]").value;
      const dataVencimento = row.querySelector("[data-ocorrencia-vencimento]").value;
      if (!notaId || !versao) throw new Error("Recarregue a serie antes de salvar.");
      if (!dataEmissao || !dataVencimento) throw new Error(`Preencha emissao e vencimento da ocorrencia ${index + 1}.`);
      if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) throw new Error(`Informe um valor maior que zero na ocorrencia ${index + 1}.`);
      return { nota_id: notaId, versao, data_emissao: dataEmissao, data_vencimento: dataVencimento, valor_total: valor };
    });
    if (!ocorrencias.length) throw new Error("A serie precisa ter ao menos uma nota ativa.");
    data.ocorrencias_json = JSON.stringify(ocorrencias);
    ["anexo_nota", "valor_total", "numero_parcelas", "primeiro_vencimento", "data_vencimento_fatura", "data_emissao"].forEach((field) => delete data[field]);
    return data;
  }

  function renderOcorrenciasExistentes(notas) {
    const container = document.getElementById("ocorrenciasFields");
    container.innerHTML = notas.map((nota) => occurrenceRow({
      notaId: nota.id,
      versao: nota.versao,
      dataEmissao: nota.data_emissao || "",
      dataVencimento: nota.parcela_data_vencimento || "",
      valor: App.moneyInput(Number(nota.valor_total_centavos || nota.parcela_valor_centavos || 0) / 100),
      paid: Boolean(nota.parcela_data_pagamento || nota.parcela_status === "paga"),
      removivel: false
    })).join("");
  }

  function parcelasGlobalKey() {
    return [
      document.getElementById("formaPagamento").value,
      document.getElementById("numeroParcelas").value,
      document.querySelector("[name='valor_total']").value,
      document.getElementById("primeiroVencimento").value,
      document.getElementById("dataVencimentoFatura").value
    ].join("|");
  }

  function updatePaymentFields() {
    const forma = document.getElementById("formaPagamento").value;
    const faturaField = document.getElementById("faturaField");
    const primeiroField = document.getElementById("primeiroVencimentoField");
    const primeiro = document.getElementById("primeiroVencimento");
    const fatura = document.getElementById("dataVencimentoFatura");
    const cartaoFinalField = document.getElementById("cartaoFinalField");
    const cartaoFinal = document.getElementById("cartaoFinal");
    const isCartao = forma === "cartao_credito";
    const isBoleto = forma === "boleto";
    const isPixParcelado = forma === "pix" && normalizeParcelCount() > 1;
    const isNaoInformado = forma === "nao_informado";

    faturaField.hidden = !isCartao;
    cartaoFinalField.hidden = !isCartao;
    primeiroField.hidden = isCartao;
    fatura.required = isCartao;
    cartaoFinal.required = isCartao;
    primeiro.required = isBoleto || isPixParcelado || isNaoInformado;
    if (!isCartao) fatura.value = "";
    if (!isCartao) cartaoFinal.value = "";
    if (isCartao) primeiro.value = "";
    updateCartaoFinalHint();
  }

  function updateCartaoFinalHint() {
    const input = document.getElementById("cartaoFinal");
    const hint = document.getElementById("cartaoFinalHint");
    const label = window.Cartoes?.label(input.value) || "";
    hint.textContent = label;
    hint.hidden = !label;
  }

  function gerarParcelas() {
    const totalInput = document.querySelector("[name='valor_total']");
    const quantidade = normalizeParcelCount();
    const total = App.parseMoney(totalInput.value);
    const base = Math.floor((total / quantidade) * 100) / 100;
    const container = document.getElementById("parcelasFields");
    const forma = document.getElementById("formaPagamento").value;
    const baseDue = baseVencimento(forma, quantidade);

    container.innerHTML = Array.from({ length: quantidade }, (_, index) => {
      const due = baseDue ? addMonths(baseDue, index) : "";
      const value = index === quantidade - 1 ? Math.max(0, total - base * (quantidade - 1)) : base;
      const paid = paidParcelasByNumber.get(index + 1);
      const readonly = paid ? " readonly" : "";
      const paidBase = Number(paid?.valor_centavos || 0) - Number(paid?.juros_centavos || 0) - Number(paid?.multa_centavos || 0);
      const displayedValue = paid ? App.moneyInput(paidBase / 100) : App.moneyInput(value);
      const displayedDue = paid?.data_vencimento || due;
      return `
        <div class="parcela-row">
          <label>Parcela<input data-parcela-numero value="${index + 1}" readonly></label>
          <label>Valor<input data-parcela-valor inputmode="decimal" value="${App.escapeAttr(displayedValue)}" required${readonly}></label>
          <label>Vencimento<input data-parcela-vencimento type="date" value="${App.escapeAttr(displayedDue)}" required${readonly}></label>
          ${paid ? '<span class="meta">Parcela paga — edição bloqueada</span>' : ""}
        </div>
      `;
    }).join("");
    lastParcelasGlobalKey = parcelasGlobalKey();
  }

  function syncParcelasFromGlobalFields() {
    const quantidade = normalizeParcelCount();
    const rows = Array.from(document.querySelectorAll(".parcela-row"));
    if (rows.length !== quantidade || parcelasGlobalKey() !== lastParcelasGlobalKey) gerarParcelas();
  }

  function renderParcelasExistentes(parcelas) {
    const container = document.getElementById("parcelasFields");
    paidParcelasByNumber = new Map(parcelas
      .filter((parcela) => parcela.data_pagamento || parcela.status === "paga")
      .map((parcela) => [Number(parcela.numero_parcela), parcela]));
    container.innerHTML = parcelas.map((parcela, index) => {
      const paid = parcela.data_pagamento || parcela.status === "paga";
      const readonly = paid ? " readonly" : "";
      const juros = Number(parcela.juros_centavos || 0);
      const multa = Number(parcela.multa_centavos || 0);
      const original = Number(parcela.valor_centavos || 0) - juros - multa;
      return `
      <div class="parcela-row">
        <label>Parcela<input data-parcela-numero value="${App.escapeAttr(parcela.numero_parcela || index + 1)}" readonly></label>
        <label>Valor original<input data-parcela-valor inputmode="decimal" value="${App.moneyInput(original / 100)}" required${readonly}></label>
        <label>Vencimento<input data-parcela-vencimento type="date" value="${App.escapeAttr(parcela.data_vencimento || "")}" required${readonly}></label>
        ${juros || multa ? `<span class="meta">Juros ${Dashboard.valueToMoney(juros)} + multa ${Dashboard.valueToMoney(multa)}; total a pagar ${Dashboard.valueToMoney(parcela.valor_centavos)}</span>` : ""}
        ${paid ? '<span class="meta">Parcela paga — edição bloqueada</span>' : ""}
      </div>
    `;
    }).join("");
    lastParcelasGlobalKey = parcelasGlobalKey();
  }

  function syncTotalFromParcelas() {
    if (!editingNotaId || editingRecorrenciaId) return;
    const values = Array.from(document.querySelectorAll("[data-parcela-valor]")).map((input) => Math.round(App.parseMoney(input.value) * 100));
    if (!values.length || values.some((value) => !Number.isInteger(value) || value <= 0)) return;
    const total = values.reduce((sum, value) => sum + value, 0);
    document.querySelector("[name='valor_total']").value = App.moneyInput(total / 100);
    lastParcelasGlobalKey = parcelasGlobalKey();
  }

  async function editNota(id, empresaId = "") {
    if (!canEditNotas()) {
      App.alert("Seu perfil não permite editar notas.", "error");
      return;
    }
    if (!empresaId && !Empresas.hasSelection()) {
      App.alert("Selecione uma empresa para editar a nota.", "warning");
      return;
    }
    if (empresaId ? !Empresas.isActive(empresaId) : !Empresas.hasActiveSelection()) {
      App.alert("Empresa inativa permite somente consulta histórica.", "warning");
      return;
    }
    const requestedEmpresaId = String(empresaId || "");
    const options = requestedEmpresaId ? { headers: { "X-Empresa-Id": requestedEmpresaId } } : undefined;
    const payload = await Api.get(`/api/notas/${id}`, undefined, options);
    const { nota, parcelas } = normalizeNota(payload);
    if (!Empresas.isActive(nota.empresa_id)) {
      App.alert("Empresa inativa permite somente consulta histÃ³rica.", "warning");
      return;
    }
    if (nota.status === "cancelada") {
      App.alert("Nota cancelada não pode ser editada.", "error");
      return;
    }
    limparSugestoesDocumento();
    const form = document.getElementById("notaForm");
    editingNotaId = nota.id || id;
    editingNotaVersion = Number.isInteger(Number(nota.versao)) ? Number(nota.versao) : null;
    editingEmpresaId = String(nota.empresa_id || requestedEmpresaId || "");

    suppressResetHandler = true;
    form.reset();
    suppressResetHandler = false;
    document.getElementById("notaRecorrente").checked = false;
    document.getElementById("notaRecorrente").disabled = true;
    editingRecorrenciaId = null;
    setRecorrenciaMode(false);
    setField(form, "empresa_id", nota.empresa_id);
    document.getElementById("notaEmpresa").disabled = true;
    setField(form, "numero_nota", nota.numero_nota);
    setField(form, "fornecedor", nota.fornecedor);
    setField(form, "cnpj_cpf", nota.cnpj_cpf);
    setField(form, "data_emissao", String(nota.data_emissao || "").slice(0, 10));
    setField(form, "valor_total", App.moneyInput((nota.valor_total_centavos || 0) / 100));
    setField(form, "categoria", nota.categoria);
    await Categorias.load(form, { categoria: nota.categoria, categoria_id: nota.categoria_id });
    setField(form, "centro_custo", nota.centro_custo);
    const formaPagamento = normalizeFormaPagamento(nota.forma_pagamento || parcelas[0]?.forma_pagamento);
    setField(form, "forma_pagamento", formaPagamento);
    setField(form, "cartao_final", nota.cartao_final);
    setField(form, "numero_parcelas", nota.numero_parcelas || parcelas.length || 1);
    setField(form, "observacoes", nota.observacoes);

    updatePaymentFields();
    if (formaPagamento === "cartao_credito") {
      document.getElementById("dataVencimentoFatura").value = parcelas[0]?.data_vencimento || "";
    } else {
      document.getElementById("primeiroVencimento").value = parcelas[0]?.data_vencimento || "";
    }
    if (nota.recorrencia_id) {
      const seriePayload = await Api.get(`/api/notas/recorrencias/${nota.recorrencia_id}`, undefined, options);
      const notasDaSerie = seriePayload.notas || [];
      if (!notasDaSerie.length) throw new Error("Esta serie nao possui notas ativas para editar.");
      editingRecorrenciaId = Number(nota.recorrencia_id);
      document.getElementById("notaRecorrente").checked = true;
      document.getElementById("notaRecorrente").disabled = true;
      document.getElementById("recorrenciaQuantidade").value = String(notasDaSerie.length);
      renderOcorrenciasExistentes(notasDaSerie);
      setRecorrenciaMode(true);
      document.querySelector("#cadastroView .panel-header h2").textContent = "Editar serie de notas";
      document.querySelector("#notaForm button[type='submit']").textContent = "Salvar serie";
    } else {
      if (parcelas.length) renderParcelasExistentes(parcelas);
      else gerarParcelas();
      document.querySelector("#cadastroView .panel-header h2").textContent = "Editar nota";
      document.querySelector("#notaForm button[type='submit']").textContent = "Salvar alteracoes";
    }
    preserveCadastroStateOnce = true;
    editingDirty = false;
    App.showView("cadastro");
  }

  function exitEditMode() {
    limparSugestoesDocumento();
    editingNotaId = null;
    editingNotaVersion = null;
    editingEmpresaId = null;
    editingRecorrenciaId = null;
    editingDirty = false;
    const removalActions = document.getElementById("serieRemovalActions");
    if (removalActions) removalActions.hidden = true;
    paidParcelasByNumber = new Map();
    document.getElementById("notaEmpresa").disabled = false;
    document.getElementById("notaRecorrente").disabled = false;
    document.querySelector("#cadastroView .panel-header h2").textContent = "Dados da nota";
    document.querySelector("#notaForm button[type='submit']").textContent = "Salvar nota";
  }

  function newNota() {
    if (preserveCadastroStateOnce) {
      preserveCadastroStateOnce = false;
      return;
    }
    if (!canEditNotas()) {
      App.alert("Seu perfil não permite cadastrar notas.", "error");
      App.showView("notas");
      return;
    }
    const form = document.getElementById("notaForm");
    limparSugestoesDocumento();
    exitEditMode();
    suppressResetHandler = true;
    form.reset();
    suppressResetHandler = false;
    document.getElementById("notaRecorrente").checked = false;
    setRecorrenciaMode(false);
    Empresas.syncNotaEmpresa();
    Categorias.load(form);
    lastParcelasGlobalKey = "";
    updatePaymentFields();
    gerarParcelas();
  }

  async function submitNota(event) {
    event.preventDefault();
    if (submittingNota) return;
    submittingNota = true;
    const form = event.currentTarget;
    const submit = form.querySelector("button[type='submit']");
    let originalText = submit.textContent;
    submit.disabled = true;
    submit.textContent = editingNotaId ? "Salvando alteracoes..." : (isRecorrente() ? "Salvando ocorrencias..." : "Salvando nota...");
    try {
      if (editingRecorrenciaId) {
        const serieId = editingRecorrenciaId;
        const empresaId = String(editingEmpresaId || form.elements.empresa_id?.value || "");
        const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
        await Api.putJson(`/api/notas/recorrencias/${serieId}`, buildEditarRecorrenciaPayload(form), options);
        App.alert("Serie atualizada com sucesso.", "success");
        exitEditMode();
        form.reset();
        updatePaymentFields();
        document.getElementById("ocorrenciasFields").innerHTML = "";
        App.showView("notas");
        await loadNotas();
        return;
      }
      if (editingNotaId) {
        syncParcelasFromGlobalFields();
        const id = editingNotaId;
        const empresaId = String(editingEmpresaId || form.elements.empresa_id?.value || "");
        const options = empresaId ? { headers: { "X-Empresa-Id": empresaId } } : undefined;
        await Api.putForm(`/api/notas/${id}`, buildNotaFormData(form), options);
        App.alert("Nota atualizada com sucesso.", "success");
        exitEditMode();
        form.reset();
        updatePaymentFields();
        document.getElementById("parcelasFields").innerHTML = "";
        await Detalhes.loadDetalhes(id, empresaId);
        return;
      }
      if (isRecorrente()) {
        const payload = buildRecorrentePayload(form);
        const occurrences = JSON.parse(payload.ocorrencias_json);
        const total = occurrences.reduce((sum, row) => sum + Math.round(App.parseMoney(row.valor_total) * 100), 0);
        if (!window.confirm(`Cadastrar ${occurrences.length} nota(s), cada uma com uma parcela? Total da série: ${Dashboard.valueToMoney(total)}. Confira as datas e os valores antes de confirmar.`)) return;
        const result = await Api.postJson("/api/notas/recorrentes", payload);
        App.alert(`${result.notas_criadas} nota(s) cadastrada(s) na serie.`, "success");
        form.reset();
        exitEditMode();
        setRecorrenciaMode(false);
        document.getElementById("ocorrenciasFields").innerHTML = "";
        App.showView("notas");
        await loadNotas();
        return;
      }
      syncParcelasFromGlobalFields();
      const formData = buildNotaFormData(form);
      if (await window.Conciliacao?.saveCreatedNote(formData)) {
        originalText = 'Salvar nota';
        return;
      }
      const createdCompanyId = form.elements.empresa_id.value;
      const result = await Api.postForm("/api/notas", formData);
      App.alert("Nota cadastrada com sucesso.", "success");
      form.reset();
      exitEditMode();
      updatePaymentFields();
      document.getElementById("parcelasFields").innerHTML = "";
      if (await window.Fiscal?.completeCreatedNote(result.id, createdCompanyId)) return;
      App.showView("notas");
      await loadNotas();
    } catch (error) {
      if (error.existingNoteId) {
        const area = document.getElementById("alertArea");
        area.querySelector("[data-duplicate-alert]")?.remove();
        const notice = document.createElement("div");
        notice.className = "alert error";
        notice.dataset.duplicateAlert = "true";
        notice.append(document.createTextNode(`${error.message} `));
        const button = document.createElement("button");
        button.type = "button";
        button.className = "text-button";
        button.textContent = "Abrir nota existente";
        button.addEventListener("click", () => Detalhes.loadDetalhes(error.existingNoteId, form.elements.empresa_id?.value || editingEmpresaId));
        notice.appendChild(button);
        area.appendChild(notice);
      } else {
        App.alert(error.message || "Não foi possível salvar a nota.", "error");
      }
    } finally {
      submittingNota = false;
      submit.disabled = false;
      submit.textContent = originalText;
    }
  }

  function bindNotas() {
    const formNota = document.getElementById("notaForm");
    Categorias.bind(formNota);
    formNota.elements.fornecedor.addEventListener("input", sugerirDocumentoFornecedor);
    formNota.elements.empresa_id.addEventListener("change", sugerirDocumentoFornecedor);
    formNota.elements.cnpj_cpf.addEventListener("input", (event) => {
      documentoSugerido = [...document.getElementById("documentosFornecedor").options]
        .some((opcao) => opcao.value === event.target.value) ? event.target.value : "";
    });
    document.querySelectorAll("[data-role-create]").forEach((element) => {
      element.hidden = !canEditNotas();
    });
    document.getElementById("buscarNotas").addEventListener("click", loadNotas);
    document.getElementById("limparFiltrosNotas").addEventListener("click", clearNotaFilters);
    document.getElementById("notaMostrarParcela").addEventListener("change", loadNotas);
    document.getElementById("gerarParcelas").addEventListener("click", gerarParcelas);
    document.getElementById("notaRecorrente").addEventListener("change", (event) => {
      setRecorrenciaMode(event.target.checked, { gerar: event.target.checked });
    });
    document.getElementById("gerarOcorrencias").addEventListener("click", () => gerarOcorrencias({ confirmReplace: true }));
    async function openRemoval(whole) {
      if (!editingRecorrenciaId || submittingNota) return;
      if (editingDirty && !window.confirm("Há alterações não salvas. A correção usará os dados já salvos; se você confirmar uma remoção, as alterações deste formulário serão descartadas. Deseja continuar?")) return;
      const empresaId = editingEmpresaId;
      await Series.open({ serieId: editingRecorrenciaId, empresaId, whole, onSuccess: async (result) => {
        // Invalidate the old edit before any reload; an unavailable network must not leave stale controls.
        exitEditMode();
        suppressResetHandler = true;
        document.getElementById("notaForm").reset();
        suppressResetHandler = false;
        document.getElementById("ocorrenciasFields").innerHTML = "";
        App.showView("notas");
        if (result.nota_restante_id) await editNota(result.nota_restante_id, empresaId);
      } });
    }
    document.getElementById("corrigirQuantidadeSerie")?.addEventListener("click", () => openRemoval(false));
    document.getElementById("excluirSerieInteira")?.addEventListener("click", () => openRemoval(true));
    ["input", "change"].forEach((type) => document.getElementById("notaForm").addEventListener(type, () => {
      if (editingNotaId) editingDirty = true;
    }));
    document.getElementById("adicionarOcorrencia").addEventListener("click", () => {
      const emissao = document.querySelector("[name='data_emissao']").value || todayValue();
      const vencimento = baseVencimento(document.getElementById("formaPagamento").value, 1) || emissao;
      addOcorrencia({ dataEmissao: emissao, dataVencimento: vencimento, valor: document.querySelector("[name='valor_total']").value || "" });
    });
    document.getElementById("ocorrenciasFields").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remover-ocorrencia]");
      if (!button) return;
      const rows = document.querySelectorAll(".ocorrencia-row");
      if (rows.length === 1) {
        App.alert("A serie precisa ter ao menos uma ocorrencia.", "warning");
        return;
      }
      button.closest(".ocorrencia-row").remove();
    });
    document.getElementById("formaPagamento").addEventListener("change", () => {
      updatePaymentFields();
      gerarParcelas();
    });
    document.getElementById("cartaoFinal").addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
      updateCartaoFinalHint();
    });
    document.getElementById("numeroParcelas").addEventListener("input", () => {
      updatePaymentFields();
      gerarParcelas();
    });
    document.getElementById("numeroParcelas").addEventListener("change", () => {
      updatePaymentFields();
      gerarParcelas();
    });
    document.querySelector("[name='valor_total']").addEventListener("input", gerarParcelas);
    document.querySelector("[name='valor_total']").addEventListener("change", gerarParcelas);
    document.getElementById("parcelasFields").addEventListener("input", (event) => {
      if (event.target.matches("[data-parcela-valor]")) syncTotalFromParcelas();
    });
    document.getElementById("primeiroVencimento").addEventListener("input", gerarParcelas);
    document.getElementById("primeiroVencimento").addEventListener("change", gerarParcelas);
    document.getElementById("dataVencimentoFatura").addEventListener("input", gerarParcelas);
    document.getElementById("dataVencimentoFatura").addEventListener("change", gerarParcelas);
    document.getElementById("notaForm").addEventListener("reset", () => {
      limparSugestoesDocumento();
      if (suppressResetHandler) return;
      window.setTimeout(() => {
        exitEditMode();
        Empresas.syncNotaEmpresa();
        Categorias.load(formNota);
        document.getElementById("notaRecorrente").checked = false;
        setRecorrenciaMode(false);
        updatePaymentFields();
        gerarParcelas();
      }, 0);
    });
    document.getElementById("notaForm").addEventListener("submit", submitNota);
    document.getElementById("notasTable").addEventListener("click", (event) => {
      const button = event.target.closest("[data-detail-id]");
      if (!button) return;
      Detalhes.loadDetalhes(button.dataset.detailId, button.dataset.empresaId);
    });
  }

  window.Notas = {
    bindNotas,
    loadNotas,
    gerarParcelas,
    updatePaymentFields,
    editNota,
    newNota,
    buildNotaFormData,
    renderParcelasExistentes
  };
})();
