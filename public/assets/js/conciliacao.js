(function () {
  const list = () => document.getElementById('extratosLista');
  const moreButton = () => document.getElementById('ofxCarregarMais');
  const filters = () => Object.fromEntries(new FormData(document.getElementById('ofxFiltros')).entries());
  let movements = [];
  let cursor = null;
  let total = 0;
  let companyId = '';
  let generation = 0;
  let files = [];
  let selectedFile = '';
  let noteContext = null;

  function closeNoteDialog(force = false) {
    if (!noteContext || noteContext.saving) return;
    if (!force && !window.confirm('Descartar o cadastro desta nota?')) return;
    const context = noteContext;
    const form = document.getElementById('notaForm');
    context.home.append(form);
    for (const field of context.locked) field.disabled = false;
    form.elements.valor_total.readOnly = false;
    form.querySelector('[type="submit"]').textContent = 'Salvar nota';
    document.getElementById('ofxNotaDialog').close();
    noteContext = null;
    context.trigger?.focus();
  }

  function openNoteDialog(movement, trigger) {
    if (noteContext) return;
    let dialog = document.getElementById('ofxNotaDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'ofxNotaDialog';
      dialog.className = 'ofx-note-dialog';
      dialog.setAttribute('aria-label', 'Criar nota a partir do OFX');
      const title = document.createElement('h2');
      title.textContent = 'Criar nota e registrar pagamento';
      const summary = document.createElement('p');
      summary.dataset.ofxNoteSummary = '';
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Cancelar';
      close.className = 'secondary-button';
      close.addEventListener('click', () => closeNoteDialog());
      dialog.append(title, summary, close);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeNoteDialog(); });
      document.body.append(dialog);
    }
    Notas.newNota();
    const form = document.getElementById('notaForm');
    const home = form.parentElement;
    form.elements.empresa_id.value = companyId;
    form.elements.valor_total.value = App.moneyInput(Math.abs(movement.valor_centavos) / 100);
    form.elements.valor_total.readOnly = true;
    form.elements.forma_pagamento.value = 'nao_informado';
    form.elements.numero_parcelas.value = '1';
    form.elements.primeiro_vencimento.value = movement.data_movimento;
    form.elements.observacoes.value = movement.descricao || '';
    Notas.updatePaymentFields();
    Notas.gerarParcelas();
    Categorias.load(form);
    const locked = [form.elements.empresa_id, form.elements.numero_parcelas, document.getElementById('notaRecorrente'), form.querySelector('[type="reset"]')];
    locked.forEach((field) => { field.disabled = true; });
    form.querySelector('[type="submit"]').textContent = 'Criar nota e registrar pagamento';
    noteContext = { movement, company: companyId, file: selectedFile, home, trigger, locked, saving: false };
    dialog.querySelector('[data-ofx-note-summary]').textContent = `${movement.descricao || ''} · ${money(Math.abs(movement.valor_centavos))} · Pagamento em ${App.formatDate(movement.data_movimento)} · ${accountSelect().selectedOptions[0]?.textContent || ''}`;
    dialog.append(form);
    dialog.showModal();
    form.elements.numero_nota.focus();
  }

  async function saveCreatedNote(data) {
    if (!noteContext) return false;
    const context = noteContext;
    if (context.saving) throw new Error('Aguarde o cadastro da nota.');
    data.set('empresa_id', context.company);
    context.saving = true;
    try {
      await Api.postForm(`/api/extratos/${context.movement.id}/criar-pagamento`, data, { headers: { 'X-Empresa-Id': context.company } });
    } finally { context.saving = false; }
    closeNoteDialog(true);
    App.alert('Nota criada, paga e conciliada.', 'success');
    if (companyId === context.company && selectedFile === context.file) {
      try { await refreshOne(context.movement.id); }
      catch (error) { App.alert(error.message, 'error'); }
    }
    return true;
  }
  const accountSelect = () => document.getElementById('ofxConta');
  const periodSelect = () => document.getElementById('ofxPeriodo');
  const fileSelect = () => document.getElementById('ofxArquivo');
  const periodKey = (file) => `${file.periodo_declarado_inicio || file.periodo_inicio}|${file.periodo_declarado_fim || file.periodo_fim}`;
  const periodLabel = (file) => `${App.formatDate(file.periodo_declarado_inicio || file.periodo_inicio)} a ${App.formatDate(file.periodo_declarado_fim || file.periodo_fim)}`;

  function clearMovements(message) {
    generation += 1;
    movements = [];
    cursor = null;
    total = 0;
    list().innerHTML = `<div class="empty-state">${message}</div>`;
    document.getElementById('ofxCount').textContent = '';
    moreButton().hidden = true;
  }

  function renderSelection(preferredId = '') {
    const account = accountSelect();
    const previousAccount = account.value;
    account.innerHTML = '<option value="">Escolha a conta</option>' + [...new Map(files.map((file) => [file.conta_hash, file.conta_nome])).entries()]
      .map(([hash, name]) => `<option value="${hash}">${App.escape(name)}</option>`).join('');
    account.value = files.find((file) => String(file.id) === String(preferredId))?.conta_hash || previousAccount;
    const periods = [...new Map(files.filter((file) => file.conta_hash === account.value).map((file) => [periodKey(file), file])).entries()];
    const previousPeriod = periodSelect().value;
    periodSelect().innerHTML = '<option value="">Escolha o período</option>' + periods.map(([key, file]) =>
      `<option value="${key}">${periodLabel(file)}</option>`).join('');
    periodSelect().disabled = !account.value;
    periodSelect().value = files.find((file) => String(file.id) === String(preferredId)) ? periodKey(files.find((file) => String(file.id) === String(preferredId))) : previousPeriod;
    const matching = files.filter((file) => file.conta_hash === account.value && periodKey(file) === periodSelect().value);
    const label = document.getElementById('ofxArquivoLabel');
    label.hidden = matching.length < 2;
    fileSelect().innerHTML = '<option value="">Escolha o arquivo</option>' + matching.map((file) =>
      `<option value="${file.id}">#${file.id} · ${App.escape(file.criado_em)} · ${file.quantidade_movimentos} movimento(s)</option>`).join('');
    selectedFile = matching.length === 1 ? String(matching[0].id) : matching.some((file) => String(file.id) === String(preferredId)) ? String(preferredId) : '';
    fileSelect().value = selectedFile;
    const current = matching.find((file) => String(file.id) === selectedFile);
    document.getElementById('ofxEscolhaAviso').innerHTML = current && !current.conta_cadastrada ? 'Cadastre esta conta para consultar os movimentos. <button id="ofxAbrirBanco" class="secondary-button compact-button" type="button">Cadastrar conta</button>' : current && !current.quantidade_movimentos ? 'Este arquivo antigo não tem vínculos recuperáveis. Reenvie o mesmo OFX para restaurá-los.' : '';
    if (current && !current.conta_cadastrada) selectedFile = '';
    clearMovements(selectedFile ? 'Carregando movimentos...' : 'Escolha conta, período e arquivo OFX para consultar os movimentos.');
    if (selectedFile) load();
  }

  async function loadFiles(preferredId = '') {
    const selectedCompany = String(window.AppState.empresaId);
    const payload = await Api.get('/api/extratos/arquivos');
    if (selectedCompany !== String(window.AppState.empresaId)) return;
    files = payload.arquivos || [];
    renderSelection(preferredId);
  }

  function money(cents) {
    return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function canAccess() {
    return Boolean(window.AppState?.empresaId) && Empresas.hasActiveSelection();
  }

  function render() {
    if (!movements.length) {
      list().innerHTML = '<div class="empty-state">Nenhum movimento encontrado com estes filtros.</div>';
      return;
    }
    list().innerHTML = movements.map((item) => {
      const isDebit = item.tipo === 'debito';
      const options = (item.sugestoes || []).map((candidate) =>
        `<option value="${candidate.id}" data-paid="${candidate.data_pagamento ? 'true' : 'false'}">${App.escape(candidate.fornecedor)} — nota ${App.escape(candidate.numero_nota)} / parcela ${candidate.numero_parcela}${candidate.data_pagamento ? ` — já paga em ${App.formatDate(candidate.data_pagamento)}` : ''}${candidate.chave_nfse ? ` — NFS-e ${candidate.situacao_fiscal === 'cancelado' ? 'CANCELADA' : 'vinculada'}` : ''} — vence ${App.formatDate(candidate.data_vencimento)} — diferença ${candidate.diferenca_dias} dia(s)</option>`
      ).join('');
      const action = item.status === 'conciliado'
        ? `<span class="status-pill paga">Conciliado${item.quantidade_parcelas ? ` — ${item.quantidade_parcelas} parcelas` : item.fornecedor ? ` — ${App.escape(item.fornecedor)}` : ''}${item.chave_nfse ? ` · NFS-e ${item.situacao_fiscal === 'cancelado' ? 'cancelada' : 'vinculada'}` : ''}</span>${item.tipo === 'credito' || item.transferencia_id ? '<button class="secondary-button compact-button" data-view-link="recebiveis" type="button">Ver recebimentos</button>' : window.AppState?.userRole === 'admin' ? `<button class="secondary-button compact-button" data-ofx-reverse="${item.id}" type="button">Desfazer</button>` : ''}`
        : item.status === 'ignorado' ? '<span class="status-pill cancelada">Ignorado</span>'
          : isDebit ? `<label class="ofx-match">Parcela correspondente<select data-ofx-candidate="${item.id}"><option value="">${options ? 'Escolha uma sugestão' : 'Sem sugestão exata'}</option>${options}</select></label><div class="fiscal-action-buttons"><button class="primary-button compact-button" data-ofx-match="${item.id}" type="button" ${options ? '' : 'disabled'}>Conciliar</button><button class="secondary-button compact-button" data-ofx-group-toggle="${item.id}" type="button">Várias parcelas</button><button class="secondary-button compact-button" data-ofx-create="${item.id}" type="button">Criar nota</button><button class="ghost-button compact-button" data-ofx-ignore="${item.id}" type="button">Ignorar</button></div><div class="ofx-group-panel" data-ofx-panel="${item.id}" hidden><label>Buscar conta<input data-ofx-group-query="${item.id}" type="search" placeholder="Fornecedor ou nº da nota"></label><button class="secondary-button compact-button" data-ofx-group-search="${item.id}" type="button">Buscar</button><div data-ofx-group-results="${item.id}"></div><div class="meta" data-ofx-group-total="${item.id}"></div><button class="primary-button compact-button" data-ofx-group-confirm="${item.id}" type="button" disabled>Conciliar selecionadas</button></div>`
            : '<button class="secondary-button compact-button" data-view-link="recebiveis" type="button">Conferir crédito</button>';
      return `<article class="list-item" data-row-id="${item.id}" tabindex="-1">
        <div><strong>${App.escape(item.descricao || 'Movimento bancário')}</strong>
          <div class="meta">${App.escape(item.conta_nome)} · ${App.formatDate(item.data_movimento)} · ${isDebit ? 'Débito' : 'Crédito'}</div>
        </div>
        <div class="item-actions${item.status === 'pendente' && isDebit ? ' fiscal-item-actions' : ''}"><strong class="money-value">${money(item.valor_centavos)}</strong>${action}</div>
      </article>`;
    }).join('');
  }

  async function load({ more = false, anchorId = null, focus = false, reuse = false } = {}) {
    const container = list();
    if (!canAccess()) {
      clearMovements('Selecione uma empresa ativa para consultar e conciliar extratos.');
      companyId = '';
      files = [];
      accountSelect().value = '';
      periodSelect().value = '';
      fileSelect().value = '';
      selectedFile = '';
      return;
    }
    const selectedCompany = String(window.AppState.empresaId);
    if (companyId !== selectedCompany) {
      container.style.minHeight = '';
      clearMovements('Escolha conta e período para consultar os movimentos.');
      companyId = selectedCompany;
      files = [];
      accountSelect().value = '';
      periodSelect().value = '';
      fileSelect().value = '';
      selectedFile = '';
      await loadFiles();
      return;
    }
    if (!selectedFile) {
      clearMovements('Escolha conta, período e arquivo OFX para consultar os movimentos.');
      return;
    }
    if (reuse && movements.length) return;
    if (more && !cursor) return;
    const sequence = ++generation;
    const selected = new Map([...container.querySelectorAll('[data-ofx-candidate]')].map((field) => [field.dataset.ofxCandidate, field.value]));
    const restore = !more && movements.length ? App.captureListPosition(container, anchorId, focus) : null;
    if (!movements.length) container.innerHTML = '<div class="empty-state">Carregando movimentos...</div>';
    moreButton().disabled = true;
    try {
      const payload = await Api.get('/api/extratos', { ...filters(), extrato_id: selectedFile, cursor: more ? cursor : '' });
      if (sequence !== generation || selectedCompany !== String(window.AppState.empresaId) || document.getElementById('ofxPane').hidden) return;
      movements = more ? movements.concat(payload.movimentos || []) : (payload.movimentos || []);
      cursor = payload.proximo_cursor;
      total = payload.total;
      render();
      for (const field of container.querySelectorAll('[data-ofx-candidate]')) {
        if (selected.has(field.dataset.ofxCandidate)) field.value = selected.get(field.dataset.ofxCandidate);
      }
      document.getElementById('ofxCount').textContent = `${total} movimento(s) encontrado(s). Exibindo ${movements.length}.`;
      moreButton().hidden = !payload.mais;
      restore?.();
    } catch (error) {
      if (sequence !== generation) return;
      if (!movements.length) container.innerHTML = '<div class="empty-state">Não foi possível carregar os movimentos.</div>';
      App.alert(error.message, 'error');
      restore?.();
    } finally {
      if (sequence === generation) moreButton().disabled = false;
      if (document.getElementById('ofxPane').hidden) container.style.minHeight = '';
    }
  }

  async function refreshOne(id) {
    const selectedCompany = companyId;
    const fileId = selectedFile;
    const payload = await Api.get('/api/extratos', { id, extrato_id: fileId, status: 'todos', tipo: 'todos' },
      { headers: { 'X-Empresa-Id': selectedCompany } });
    if (selectedCompany !== String(window.AppState.empresaId) || fileId !== selectedFile || document.getElementById('ofxPane').hidden) return;
    const updated = payload.movimentos?.[0];
    if (!updated) throw new Error('Movimento atualizado, mas não foi possível relê-lo.');
    const restore = App.captureListPosition(list(), id, true);
    const selected = new Map([...list().querySelectorAll('[data-ofx-candidate]')].map((field) => [field.dataset.ofxCandidate, field.value]));
    const index = movements.findIndex((item) => String(item.id) === String(id));
    const state = filters();
    if (index >= 0) {
      if (state.status === 'todos' || state.status === updated.status) movements[index] = updated;
      else { movements.splice(index, 1); total -= 1; }
    }
    render();
    for (const field of list().querySelectorAll('[data-ofx-candidate]')) {
      if (selected.has(field.dataset.ofxCandidate)) field.value = selected.get(field.dataset.ofxCandidate);
    }
    document.getElementById('ofxCount').textContent = `${total} movimento(s) encontrado(s). Exibindo ${movements.length}.`;
    restore();
  }

  async function importFile(event) {
    event.preventDefault();
    if (!canAccess()) return App.alert('Selecione uma empresa ativa.', 'error');
    const importedCompany = String(window.AppState.empresaId);
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const result = await Api.postForm('/api/extratos/ofx', new FormData(form));
      if (importedCompany !== String(window.AppState.empresaId)) return;
      App.alert(result.duplicado ? 'Este OFX já foi importado; nenhuma movimentação foi duplicada.' :
        `Extrato importado: ${result.novos} movimento(s) novo(s), ${result.repetidos} repetido(s).`, 'success');
      form.reset();
      await loadFiles(result.id);
      if (result.conta_sugerida) {
        App.alert('Esta conta precisa ser cadastrada para consultar o OFX.', 'error');
        openBankDialog(result.conta_sugerida);
      }
    } catch (error) { App.alert(error.message || 'Não foi possível importar o OFX.', 'error'); }
    finally { button.disabled = false; }
  }

  function openBankDialog(suggestion) {
    const form = document.getElementById('ofxBancoForm');
    form.reset();
    for (const key of ['conta_hash', 'banco_codigo', 'numero', 'nome']) form.elements[key].value = suggestion[key] || '';
    document.getElementById('ofxBancoDialog').showModal();
    form.elements.nome.focus();
  }

  async function saveBank(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const wanted = fileSelect().value;
      await Api.postJson('/api/recebiveis/bancos', Object.fromEntries(new FormData(form).entries()));
      document.getElementById('ofxBancoDialog').close();
      App.alert('Conta bancária cadastrada.', 'success');
      await loadFiles(wanted);
    } catch (error) { App.alert(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-ofx-match], [data-ofx-create], [data-ofx-ignore], [data-ofx-reverse], [data-ofx-group-toggle], [data-ofx-group-search], [data-ofx-group-confirm]');
    if (!button || button.disabled) return;
    const groupId = button.dataset.ofxGroupToggle || button.dataset.ofxGroupSearch || button.dataset.ofxGroupConfirm;
    if (groupId) {
      const panel = list().querySelector(`[data-ofx-panel="${groupId}"]`);
      if (button.dataset.ofxGroupToggle) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden && !panel.dataset.loaded) await loadGroupCandidates(groupId);
      } else if (button.dataset.ofxGroupSearch) await loadGroupCandidates(groupId);
      else {
        const ids = [...panel.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
        if (ids.length < 2 || !window.confirm(`Conciliar este débito com ${ids.length} parcelas? As parcelas em aberto serão baixadas; as já pagas manterão sua data.`)) return;
        button.disabled = true;
        try {
          await Api.postJson(`/api/extratos/${groupId}/conciliar-varios`, { parcelas_ids: ids });
          App.alert('Débito conciliado com as parcelas selecionadas.', 'success');
          await refreshOne(groupId);
        } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
      }
      return;
    }
    const movementId = button.dataset.ofxMatch || button.dataset.ofxCreate || button.dataset.ofxIgnore || button.dataset.ofxReverse;
    if (button.dataset.ofxMatch) {
      const candidate = list().querySelector(`[data-ofx-candidate="${movementId}"]`)?.value;
      if (!candidate) return App.alert('Escolha a parcela que corresponde ao débito.', 'error');
      const alreadyPaid = list().querySelector(`[data-ofx-candidate="${movementId}"]`)?.selectedOptions[0]?.dataset.paid === 'true';
      if (!window.confirm(alreadyPaid ? 'Associar este débito a uma parcela já paga? A data do pagamento será mantida.' : 'Confirmar a baixa desta parcela com a data do débito bancário?')) return;
      button.disabled = true;
      try {
        await Api.postJson(`/api/extratos/${movementId}/conciliar`, { parcela_id: candidate });
        App.alert('Pagamento conciliado.', 'success');
        await refreshOne(movementId);
      } catch (error) { App.alert(error.message || 'Não foi possível conciliar.', 'error'); button.disabled = false; }
    } else if (button.dataset.ofxCreate) {
      const movement = movements.find((item) => String(item.id) === String(movementId));
      if (movement) openNoteDialog(movement, button);
    } else if (button.dataset.ofxIgnore) {
      button.disabled = true;
      try {
        await Api.postJson(`/api/extratos/${movementId}/ignorar`, {});
        App.alert('Movimento ignorado.', 'success');
        await refreshOne(movementId);
      } catch (error) { App.alert(error.message || 'Não foi possível ignorar.', 'error'); button.disabled = false; }
    } else {
      const motivo = window.prompt('Motivo para desfazer esta conciliação:');
      if (!motivo?.trim()) return;
      button.disabled = true;
      try {
        await Api.postJson(`/api/extratos/${movementId}/desconciliar`, { motivo });
        App.alert('Conciliação desfeita.', 'success');
        await refreshOne(movementId);
      } catch (error) { App.alert(error.message || 'Não foi possível desfazer.', 'error'); button.disabled = false; }
    }
  }

  async function loadGroupCandidates(id) {
    const panel = list().querySelector(`[data-ofx-panel="${id}"]`);
    const results = panel.querySelector(`[data-ofx-group-results="${id}"]`);
    results.textContent = 'Buscando parcelas...';
    try {
      const query = panel.querySelector(`[data-ofx-group-query="${id}"]`).value;
      const payload = await Api.get(`/api/extratos/${id}/candidatos`, { busca: query });
      if (!panel.isConnected) return;
      results.innerHTML = payload.parcelas.length ? payload.parcelas.map((row) =>
        `<label class="ofx-group-row"><input type="checkbox" value="${row.id}" data-value="${row.valor_centavos}"><span>${App.escape(row.fornecedor)} · ${App.escape(row.numero_nota)} / ${row.numero_parcela} · ${money(row.valor_centavos)}${row.data_pagamento ? ` · já paga ${App.formatDate(row.data_pagamento)}` : ` · vence ${App.formatDate(row.data_vencimento)}`}</span></label>`).join('') : '<div class="meta">Nenhuma parcela encontrada. Busque por fornecedor ou número.</div>';
      panel.dataset.loaded = 'true';
      updateGroupTotal(id);
    } catch (error) { results.textContent = error.message; }
  }

  function updateGroupTotal(id) {
    const panel = list().querySelector(`[data-ofx-panel="${id}"]`);
    const chosen = [...panel.querySelectorAll('input[type="checkbox"]:checked')];
    const sum = chosen.reduce((value, input) => value + Number(input.dataset.value), 0);
    const movement = movements.find((item) => String(item.id) === String(id));
    const target = Math.abs(movement?.valor_centavos || 0);
    panel.querySelector(`[data-ofx-group-total="${id}"]`).textContent = `Selecionado: ${money(sum)} de ${money(target)}.`;
    panel.querySelector(`[data-ofx-group-confirm="${id}"]`).disabled = chosen.length < 2 || sum !== target;
  }

  function init(user) {
    document.getElementById('conciliacaoNav').hidden = !['admin', 'financeiro'].includes(user?.tipo);
    document.getElementById('ofxForm').addEventListener('submit', importFile);
    document.getElementById('atualizarExtratos').addEventListener('click', () => canAccess() && loadFiles(selectedFile));
    accountSelect().addEventListener('change', () => { periodSelect().value = ''; renderSelection(); });
    periodSelect().addEventListener('change', () => renderSelection());
    fileSelect().addEventListener('change', () => renderSelection(fileSelect().value));
    document.getElementById('ofxEscolhaAviso').addEventListener('click', (event) => {
      if (event.target.id !== 'ofxAbrirBanco') return;
      const file = files.find((item) => String(item.id) === fileSelect().value);
      if (file) openBankDialog({ conta_hash: file.conta_hash, nome: file.conta_nome, banco_codigo: file.banco_codigo, numero: file.numero });
    });
    document.getElementById('ofxBancoForm').addEventListener('submit', saveBank);
    document.getElementById('ofxBancoCancelar').addEventListener('click', () => document.getElementById('ofxBancoDialog').close());
    document.getElementById('ofxFiltros').addEventListener('submit', (event) => { event.preventDefault(); load(); });
    moreButton().addEventListener('click', () => load({ more: true }));
    list().addEventListener('click', handleClick);
    list().addEventListener('change', (event) => {
      const panel = event.target.closest('[data-ofx-panel]');
      if (panel && event.target.matches('input[type="checkbox"]')) updateGroupTotal(panel.dataset.ofxPanel);
    });
  }

  window.Conciliacao = { init, load, saveCreatedNote };
})();
