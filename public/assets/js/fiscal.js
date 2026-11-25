(function () {
  const list = () => document.getElementById('documentosFiscaisLista');
  const statusNode = () => document.getElementById('fiscalStatus');
  const syncButton = () => document.getElementById('sincronizarFiscal');
  const moreButton = () => document.getElementById('fiscalCarregarMais');
  const filters = () => Object.fromEntries(new FormData(document.getElementById('fiscalFiltros')).entries());
  let documents = [];
  let cursor = null;
  let total = 0;
  let companyId = '';
  let generation = 0;
  let returnAnchorId = null;
  let created = null;

  function money(cents) {
    return cents === null || cents === undefined ? '-' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function render() {
    if (!documents.length) {
      list().innerHTML = '<div class="empty-state">Nenhuma NFS-e encontrada com estes filtros.</div>';
      return;
    }
    list().innerHTML = documents.map((item) => {
      const open = item.situacao === 'pendente';
      const options = (item.sugestoes || []).map((note) =>
        `<option value="${note.id}">${note.tipo === 'agrupada' ? 'Possível conta agrupada — conferir: ' : ''}${App.escape(note.numero_nota)} · ${App.escape(note.fornecedor)} · ${money(note.valor_total_centavos)}</option>`
      ).join('');
      const newlyCreated = created?.docId === item.id && created.companyId === companyId ? created : null;
      const creationHint = newlyCreated ? `<span class="meta">Conta ${newlyCreated.noteId} criada. ${(item.sugestoes || []).some((note) => note.id === newlyCreated.noteId) ? 'Confira os dados e vincule abaixo.' : 'Dados não coincidem para vínculo automático; revise a conta.'}</span>` : '';
      const noteControl = open ? `${creationHint}<label class="ofx-match">Conta para vincular<select data-fiscal-candidate="${item.id}" ${options ? '' : 'disabled'}><option value="">${options ? 'Selecione e confira a conta' : 'Nenhuma conta compatível encontrada'}</option>${options}</select></label>
        <div class="fiscal-action-buttons"><button class="primary-button compact-button" data-fiscal-link="${item.id}" type="button" ${options ? '' : 'disabled'}>Vincular</button>
        ${window.AppState?.userRole === 'admin' ? `<button class="secondary-button compact-button" data-fiscal-create="${item.id}" type="button">Cadastrar conta</button>` : ''}
        <button class="ghost-button compact-button" data-fiscal-ignore="${item.id}" type="button">Não gerar conta</button></div>` :
        item.nota_id ? `<button class="secondary-button compact-button" data-fiscal-open="${item.nota_id}" data-fiscal-source="${item.id}" type="button">Abrir nota vinculada</button>` : '';
      const label = item.situacao === 'cancelado' ? 'NFS-e cancelada — revise qualquer conta ligada a ela' :
        item.situacao === 'vinculado' ? `Vinculada${item.nota_valor_centavos > item.valor_vinculado_centavos ? ` a conta agrupada (${money(item.valor_vinculado_centavos)} nesta NFS-e)` : ''}` : item.situacao === 'ignorado' ? 'Sem conta a pagar' : 'Pendente de revisão';
      return `<article class="list-item" data-row-id="${item.id}" tabindex="-1">
        <div><strong>${App.escape(item.fornecedor || 'Prestador não informado')} · NFS-e ${App.escape(item.numero_nota || '-')}</strong>
          <div class="meta">Emissão ${App.formatDate(item.data_emissao)} · CNPJ/CPF ${App.escape(item.cnpj_cpf || '-')} · ${label}</div>
          <div class="meta">Bruto ${money(item.valor_bruto_centavos)} · líquido ${money(item.valor_liquido_centavos)}${item.evento_tipo ? ` · Evento: ${App.escape(item.evento_tipo)}` : ''}</div>
          <div class="meta">Chave ${App.escape(item.chave_acesso)} · <a href="/api/documentos-fiscais/${item.id}/xml?empresa_id=${encodeURIComponent(companyId)}">Baixar XML</a></div>
        </div>
        <div class="item-actions${open ? ' fiscal-item-actions' : ''}">${noteControl}</div>
      </article>`;
    }).join('');
    if (created) {
      const field = list().querySelector(`[data-fiscal-candidate="${created.docId}"]`);
      if (field && [...field.options].some((option) => Number(option.value) === created.noteId)) field.value = String(created.noteId);
    }
  }

  async function load({ more = false, anchorId = null, focus = false, reuse = false } = {}) {
    if (!window.AppState?.empresaId) {
      generation += 1;
      documents = []; cursor = null; total = 0; companyId = '';
      statusNode().textContent = 'Selecione uma empresa.';
      list().innerHTML = '<div class="empty-state">Selecione uma empresa para consultar as NFS-e.</div>';
      document.getElementById('fiscalCount').textContent = '';
      syncButton().disabled = true;
      moreButton().hidden = true;
      return;
    }
    const selectedCompany = String(window.AppState.empresaId);
    if (companyId !== selectedCompany) {
      list().style.minHeight = '';
      documents = []; cursor = null; total = 0; companyId = selectedCompany;
      returnAnchorId = null; created = null;
      list().innerHTML = '<div class="empty-state">Carregando NFS-e...</div>';
    }
    if (returnAnchorId && documents.length && !more) {
      const target = list().querySelector(`[data-row-id="${returnAnchorId}"]`);
      returnAnchorId = null;
      target?.scrollIntoView({ block: 'center' });
      target?.focus({ preventScroll: true });
      return;
    }
    if (reuse && documents.length) return;
    if (more && !cursor) return;
    const sequence = ++generation;
    const selected = new Map([...list().querySelectorAll('[data-fiscal-candidate]')].map((field) => [field.dataset.fiscalCandidate, field.value]));
    const restore = !more && documents.length ? App.captureListPosition(list(), anchorId, focus) : null;
    if (!documents.length) list().innerHTML = '<div class="empty-state">Carregando NFS-e...</div>';
    moreButton().disabled = true;
    try {
      const payload = await Api.get('/api/documentos-fiscais', { ...filters(), cursor: more ? cursor : '' });
      if (sequence !== generation || selectedCompany !== String(window.AppState.empresaId) || document.getElementById('fiscalPane').hidden) return;
      const state = payload.status;
      syncButton().disabled = !state.configurado || state.em_andamento || !Empresas.hasActiveSelection();
      statusNode().textContent = state.configurado ?
        `Última consulta: ${App.formatDateTime(state.consultado_em)} · NSU ${state.ultimo_nsu}${state.erro ? ` · Erro: ${state.erro}` : ''}` :
        'Busca automática indisponível para esta empresa: certificado A1 ainda não configurado.';
      documents = more ? documents.concat(payload.documentos || []) : (payload.documentos || []);
      cursor = payload.proximo_cursor;
      total = payload.total;
      render();
      for (const field of list().querySelectorAll('[data-fiscal-candidate]')) {
        if (selected.has(field.dataset.fiscalCandidate) &&
            (selected.get(field.dataset.fiscalCandidate) || created?.docId !== Number(field.dataset.fiscalCandidate))) {
          field.value = selected.get(field.dataset.fiscalCandidate);
        }
      }
      document.getElementById('fiscalCount').textContent = `${total} NFS-e encontrada(s). Exibindo ${documents.length}.`;
      moreButton().hidden = !payload.mais;
      restore?.();
    } catch (error) {
      if (sequence !== generation) return;
      if (!documents.length) list().innerHTML = '<div class="empty-state">Não foi possível consultar os documentos fiscais.</div>';
      statusNode().textContent = error.message;
      syncButton().disabled = true;
      restore?.();
    } finally {
      if (sequence === generation) moreButton().disabled = false;
      if (document.getElementById('fiscalPane').hidden) list().style.minHeight = '';
    }
  }

  async function refreshOne(id) {
    const selectedCompany = companyId;
    const payload = await Api.get('/api/documentos-fiscais', { id, situacao: 'todas' },
      { headers: { 'X-Empresa-Id': selectedCompany } });
    if (selectedCompany !== String(window.AppState.empresaId) || document.getElementById('fiscalPane').hidden) return;
    const updated = payload.documentos?.[0];
    if (!updated) throw new Error('NFS-e atualizada, mas não foi possível relê-la.');
    const restore = App.captureListPosition(list(), id, true);
    const selected = new Map([...list().querySelectorAll('[data-fiscal-candidate]')].map((field) => [field.dataset.fiscalCandidate, field.value]));
    const index = documents.findIndex((item) => String(item.id) === String(id));
    if (index >= 0) {
      if (filters().situacao === 'todas' || filters().situacao === updated.situacao) documents[index] = updated;
      else { documents.splice(index, 1); total -= 1; }
    }
    render();
    for (const field of list().querySelectorAll('[data-fiscal-candidate]')) {
      if (selected.has(field.dataset.fiscalCandidate) &&
          (selected.get(field.dataset.fiscalCandidate) || created?.docId !== Number(field.dataset.fiscalCandidate))) {
        field.value = selected.get(field.dataset.fiscalCandidate);
      }
    }
    document.getElementById('fiscalCount').textContent = `${total} NFS-e encontrada(s). Exibindo ${documents.length}.`;
    restore();
  }

  async function sync() {
    syncButton().disabled = true;
    statusNode().textContent = 'Buscando NFS-e no ambiente nacional...';
    try {
      const result = await Api.postJson('/api/documentos-fiscais/sincronizar', {});
      App.alert(`${result.novos} NFS-e nova(s) capturada(s).${result.mais_paginas ? ' Há mais documentos: clique em Buscar novas NFS-e novamente.' : ''}`, 'success');
    } catch (error) { App.alert(error.message, 'error'); }
    await load();
  }

  function createFrom(item) {
    const due = window.prompt('Informe o vencimento combinado para esta conta (AAAA-MM-DD):');
    if (!due) return;
    const date = new Date(`${due}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== due) {
      return App.alert('Informe um vencimento válido no formato AAAA-MM-DD.', 'error');
    }
    returnAnchorId = item.id;
    created = null;
    App.showView('cadastro');
    const form = document.getElementById('notaForm');
    form.elements.numero_nota.value = item.numero_nota;
    form.elements.fornecedor.value = item.fornecedor;
    form.elements.cnpj_cpf.value = item.cnpj_cpf;
    form.elements.data_emissao.value = item.data_emissao;
    form.elements.valor_total.value = App.moneyInput(item.valor_liquido_centavos / 100);
    form.elements.forma_pagamento.value = 'nao_informado';
    form.elements.primeiro_vencimento.value = due;
    document.getElementById('gerarParcelas').click();
    App.alert('Confira valor, vencimento e categoria. Após salvar, você voltará a esta NFS-e.', 'success');
  }

  async function completeCreatedNote(noteId, savedCompanyId) {
    if (!returnAnchorId || companyId !== String(savedCompanyId)) return false;
    created = { docId: Number(returnAnchorId), noteId: Number(noteId), companyId };
    App.showView('conciliacao');
    try { await refreshOne(created.docId); }
    catch (error) { App.alert(error.message, 'error'); }
    return true;
  }

  async function click(event) {
    const button = event.target.closest('button[data-fiscal-link], button[data-fiscal-ignore], button[data-fiscal-create], button[data-fiscal-open]');
    if (!button || button.disabled) return;
    if (button.dataset.fiscalOpen) {
      returnAnchorId = Number(button.dataset.fiscalSource);
      return Detalhes.loadDetalhes(button.dataset.fiscalOpen, window.AppState.empresaId);
    }
    const id = button.dataset.fiscalLink || button.dataset.fiscalIgnore || button.dataset.fiscalCreate;
    const item = documents.find((row) => String(row.id) === String(id));
    if (!item) return;
    if (button.dataset.fiscalCreate) {
      if (item.sugestoes?.some((note) => note.tipo === 'agrupada') &&
          !window.confirm('Há uma possível conta agrupada nesta lista. Confira-a antes de criar outra conta. Deseja continuar mesmo assim?')) return;
      return createFrom(item);
    }
    if (button.dataset.fiscalLink) {
      const noteId = list().querySelector(`[data-fiscal-candidate="${id}"]`)?.value;
      if (!noteId) return App.alert('Escolha uma nota cadastrada.', 'error');
      const candidate = item.sugestoes?.find((note) => String(note.id) === noteId);
      if (!candidate) return App.alert('Atualize a lista e escolha uma conta válida.', 'error');
      let allocated = null;
      if (candidate.tipo === 'agrupada') {
        if (!window.confirm(`A conta ${candidate.numero_nota} reúne mais de uma nota e totaliza ${money(candidate.valor_total_centavos)}. Confira os documentos antes de vincular a NFS-e ${item.numero_nota}. Nenhum pagamento será alterado. Continuar?`)) return;
        const value = window.prompt('Qual valor desta NFS-e está incluído na conta? Informe o bruto ou líquido (R$):', App.moneyInput(item.valor_liquido_centavos / 100));
        if (value === null) return;
        allocated = Math.round(App.parseMoney(value) * 100);
        if (![item.valor_bruto_centavos, item.valor_liquido_centavos].includes(allocated)) return App.alert('Informe o valor bruto ou líquido exibido nesta NFS-e.', 'error');
      } else if (!window.confirm('Vincular esta NFS-e à conta cadastrada? A parcela não será marcada como paga.')) return;
      button.disabled = true;
      try {
        await Api.postJson(`/api/documentos-fiscais/${id}/vincular`, { nota_id: noteId, valor_vinculado_centavos: allocated });
        App.alert('NFS-e vinculada à nota.', 'success');
        await refreshOne(id);
        if (created?.docId === Number(id)) created = null;
      } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
    } else {
      const reason = window.prompt('Motivo para não gerar conta a pagar (ex.: já paga no ato):');
      if (!reason?.trim()) return;
      button.disabled = true;
      try {
        await Api.postJson(`/api/documentos-fiscais/${id}/ignorar`, { motivo: reason });
        App.alert('Documento revisado.', 'success');
        await refreshOne(id);
      } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
    }
  }

  function init(user) {
    if (!['admin', 'financeiro'].includes(user?.tipo)) return;
    syncButton().addEventListener('click', sync);
    document.getElementById('fiscalFiltros').addEventListener('submit', (event) => { event.preventDefault(); load(); });
    moreButton().addEventListener('click', () => load({ more: true }));
    list().addEventListener('click', click);
  }

  window.Fiscal = { init, load, completeCreatedNote };
})();
