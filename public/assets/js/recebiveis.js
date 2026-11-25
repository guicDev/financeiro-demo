(function () {
  let summary = null;
  let movements = [];
  let companyId = '';
  let generation = 0;
  const $ = (id) => document.getElementById(id);
  const money = (value) => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const escape = (value) => App.escape(value ?? '');
  const isoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  function active() {
    return Boolean(window.AppState?.empresaId) && Empresas.hasActiveSelection();
  }

  function renderBancos() {
    $('recebiveisBancos').innerHTML = summary.bancos.length ? summary.bancos.map((row) =>
      `<article class="list-item"><div><strong>${escape(row.nome)}</strong><div class="meta">${escape(row.banco_codigo || 'Banco não informado')} · agência ${escape(row.agencia || '-')} · conta ${escape(row.numero || '-')}</div><div class="meta">${row.pendentes} movimento(s) pendente(s)</div></div><div class="item-actions"><strong class="money-value">${money(row.saldo_calculado_centavos)}</strong><button class="secondary-button compact-button" data-bank-edit="${row.id}" type="button">Editar</button></div></article>`
    ).join('') : '<div class="empty-state">Nenhuma conta bancária cadastrada para esta empresa.</div>';
  }

  function renderTitulos() {
    $('recebiveisClienteSelect').innerHTML = '<option value="">Selecione o cliente</option>' + summary.clientes.map((row) =>
      `<option value="${row.id}">${escape(row.nome)}</option>`).join('');
    $('recebiveisTitulos').innerHTML = summary.titulos.length ? summary.titulos.map((row) =>
      `<article class="list-item"><div><strong>${escape(row.cliente_nome)} · ${escape(row.descricao)}</strong><div class="meta">Vence ${App.formatDate(row.vencimento)} · Valor ${money(row.valor_centavos)} · Recebido ${money(row.recebido_centavos)} · ${escape(row.situacao)}</div>${summary.recebimentos.filter((receipt) => receipt.conta_receber_id === row.id).map((receipt) => `<div class="meta">Recebimento #${receipt.id}: ${money(receipt.valor_centavos)} em ${App.formatDate(receipt.data_recebimento)}${receipt.movimento_id ? ` · OFX #${receipt.movimento_id}` : ' · manual'}${window.AppState?.userRole === 'admin' ? ` <button class="text-button" data-receipt-reverse="${receipt.id}" type="button">Desfazer</button>` : ''}</div>`).join('')}</div><div class="item-actions"><strong class="money-value">Em aberto: ${money(row.saldo_centavos)}</strong>${row.saldo_centavos ? `<form data-receipt-form="${row.id}" class="work-filters"><label>Receber (R$)<input name="valor" type="number" min="0.01" max="${(row.saldo_centavos / 100).toFixed(2)}" step="0.01" required></label><label>Data<input name="data_recebimento" type="date" value="${isoToday()}" required></label><button class="secondary-button compact-button" type="submit">Registrar</button></form>` : ''}</div></article>`
    ).join('') : '<div class="empty-state">Nenhuma conta a receber cadastrada.</div>';
  }

  function renderMovimentos() {
    const pendingDebits = movements.filter((row) => row.tipo === 'debito' && row.status === 'pendente' && row.conta_nome);
    $('recebiveisMovimentos').innerHTML = movements.length ? movements.map((row) => {
      const credit = row.tipo === 'credito';
      const transferOptions = pendingDebits.filter((debit) => debit.valor_centavos + row.valor_centavos === 0 && debit.conta_hash !== row.conta_hash);
      const titles = summary.titulos.filter((title) => title.saldo_centavos >= row.valor_centavos && title.saldo_centavos > 0);
      const manualReceipts = summary.recebimentos.filter((receipt) => !receipt.movimento_id && receipt.valor_centavos === row.valor_centavos);
      const canReverse = row.status === 'conciliado' && (row.conta_receber_id || row.classificacao || row.transferencia_id) && window.AppState?.userRole === 'admin';
      const actions = canReverse
        ? `<button class="secondary-button compact-button" data-receive-reverse="${row.id}" type="button">Desfazer</button>`
        : row.status !== 'pendente' ? `<span class="meta">${row.status === 'conciliado' ? escape(row.classificacao || (row.transferencia_id ? 'Transferência' : row.conta_receber_id ? 'Recebimento' : 'Conciliado')) : 'Ignorado'}</span>`
          : !credit ? '<span class="meta">Débito disponível para transferência ou pagamentos.</span>'
            : !row.conta_nome ? '<span class="meta">Cadastre a conta bancária deste OFX para conferir o crédito.</span>'
              : `<div class="work-filters"><label>Conta a receber<select data-credit-title="${row.id}"><option value="">Selecione</option>${titles.map((title) => `<option value="${title.id}">${escape(title.cliente_nome)} · ${escape(title.descricao)} · saldo ${money(title.saldo_centavos)}</option>`).join('')}</select></label><button class="primary-button compact-button" data-credit-link="${row.id}" type="button">Conciliar</button></div>
                ${manualReceipts.length ? `<div class="work-filters"><label>Ou vincular recebimento manual<select data-credit-receipt="${row.id}"><option value="">Selecione</option>${manualReceipts.map((receipt) => `<option value="${receipt.id}">#${receipt.id} · ${escape(receipt.cliente_nome)} · ${App.formatDate(receipt.data_recebimento)}</option>`).join('')}</select></label><button class="secondary-button compact-button" data-credit-existing="${row.id}" type="button">Vincular</button></div>` : ''}
                <div class="work-filters"><label>Ou criar para cliente<select data-credit-client="${row.id}"><option value="">Selecione</option>${summary.clientes.map((client) => `<option value="${client.id}">${escape(client.nome)}</option>`).join('')}</select></label><button class="secondary-button compact-button" data-credit-new="${row.id}" type="button">Criar e receber</button></div>
                <div class="work-filters"><label>Outra entrada<select data-credit-kind="${row.id}"><option value="rendimento">Rendimento</option><option value="devolucao">Devolução</option><option value="outro">Outra</option></select></label><button class="secondary-button compact-button" data-credit-classify="${row.id}" type="button">Classificar</button></div>
                <div class="work-filters"><label>Transferência de<select data-credit-debit="${row.id}"><option value="">Selecione o débito</option>${transferOptions.map((debit) => `<option value="${debit.id}">${escape(debit.conta_nome)} · ${App.formatDate(debit.data_movimento)} · ${money(debit.valor_centavos)}</option>`).join('')}</select></label><button class="secondary-button compact-button" data-credit-load-transfer="${row.id}" type="button">Buscar débitos</button><button class="secondary-button compact-button" data-credit-transfer="${row.id}" type="button">Ligar transferência</button></div>`;
      return `<article class="list-item" data-row-id="${row.id}"><div><strong>${escape(row.descricao || 'Movimento bancário')}</strong><div class="meta">#${row.id} · ${escape(row.conta_nome || 'Conta não cadastrada')} · ${App.formatDate(row.data_movimento)} · ${credit ? 'Crédito' : 'Débito'} · ${escape(row.status)}</div></div><div class="item-actions"><strong class="money-value">${money(row.valor_centavos)}</strong>${actions}</div></article>`;
    }).join('') : '<div class="empty-state">Nenhum movimento OFX encontrado.</div>';
  }

  async function load() {
    if (!active()) {
      generation += 1;
      summary = null;
      movements = [];
      companyId = '';
      for (const name of ['Bancos', 'Titulos', 'Movimentos']) $(`recebiveis${name}`).innerHTML = '<div class="empty-state">Selecione uma empresa ativa.</div>';
      $('recebiveisResumo').textContent = '';
      return;
    }
    const selected = String(window.AppState.empresaId);
    const sequence = ++generation;
    try {
      const [nextSummary, nextMovements] = await Promise.all([
        Api.get('/api/recebiveis/resumo'), Api.get('/api/recebiveis/movimentos', { busca: $('recebiveisBusca').value })
      ]);
      if (sequence !== generation || selected !== String(window.AppState.empresaId)) return;
      companyId = selected;
      summary = nextSummary;
      movements = nextMovements.movimentos || [];
      $('recebiveisResumo').textContent = `A receber: ${money(summary.total_aberto_centavos)} · Recebido: ${money(summary.total_recebido_centavos)} · OFX pendentes: ${summary.pendentes_ofx}.`;
      $('recebiveisCsv').href = `/api/recebiveis/relatorio.csv?empresa_id=${encodeURIComponent(companyId)}`;
      renderBancos(); renderTitulos(); renderMovimentos();
    } catch (error) { App.alert(error.message, 'error'); }
  }

  function prefillBanco(suggestion) {
    const form = $('recebiveisBancoForm');
    form.reset();
    form.elements.id.value = '';
    for (const key of ['conta_hash', 'banco_codigo', 'numero', 'nome']) form.elements[key].value = suggestion[key] || '';
    App.showView('recebiveis');
    form.elements.nome.focus();
  }

  async function submit(event, path, message) {
    event.preventDefault();
    if (!active()) return App.alert('Selecione uma empresa ativa.', 'error');
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      if (path === '/api/recebiveis/bancos' && data.id) await Api.putJson(`${path}/${data.id}`, data);
      else await Api.postJson(path, data);
      form.reset();
      if (path.endsWith('/bancos')) { form.elements.id.value = ''; form.elements.conta_hash.value = ''; }
      App.alert(message, 'success');
      await load();
    } catch (error) { App.alert(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function handleReceipt(event) {
    const form = event.target.closest('[data-receipt-form]');
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.conta_receber_id = form.dataset.receiptForm;
    if (!window.confirm(`Registrar recebimento de R$ ${data.valor} nesta conta?`)) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await Api.postJson('/api/recebiveis/recebimentos', data);
      App.alert('Recebimento registrado.', 'success');
      await load();
    } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
  }

  async function handleMovement(event) {
    const button = event.target.closest('[data-credit-link], [data-credit-existing], [data-credit-new], [data-credit-classify], [data-credit-load-transfer], [data-credit-transfer], [data-receive-reverse]');
    if (!button || button.disabled) return;
    const movementId = button.dataset.creditLink || button.dataset.creditExisting || button.dataset.creditNew || button.dataset.creditClassify || button.dataset.creditLoadTransfer || button.dataset.creditTransfer || button.dataset.receiveReverse;
    const row = movements.find((item) => String(item.id) === String(movementId));
    if (!row) return;
    if (button.dataset.creditLoadTransfer) {
      button.disabled = true;
      try {
        const payload = await Api.get(`/api/recebiveis/movimentos/${movementId}/debitos-transferencia`);
        const select = document.querySelector(`[data-credit-debit="${movementId}"]`);
        select.innerHTML = '<option value="">Selecione o débito</option>' + payload.debitos.map((debit) =>
          `<option value="${debit.id}">${escape(debit.conta_nome)} · ${App.formatDate(debit.data_movimento)} · ${money(debit.valor_centavos)}</option>`).join('');
        if (!payload.debitos.length) App.alert('Nenhum débito pendente do mesmo valor em outra conta.', 'error');
      } catch (error) { App.alert(error.message, 'error'); }
      finally { button.disabled = false; }
      return;
    }
    let path, data;
    if (button.dataset.creditLink) {
      const titleId = document.querySelector(`[data-credit-title="${movementId}"]`).value;
      if (!titleId) return App.alert('Selecione uma conta a receber.', 'error');
      path = '/api/recebiveis/recebimentos';
      data = { conta_receber_id: titleId, movimento_id: movementId, valor: (row.valor_centavos / 100).toFixed(2), data_recebimento: row.data_movimento };
    } else if (button.dataset.creditExisting) {
      const receiptId = document.querySelector(`[data-credit-receipt="${movementId}"]`).value;
      if (!receiptId) return App.alert('Selecione o recebimento manual.', 'error');
      path = '/api/recebiveis/recebimentos/vincular';
      data = { recebimento_id: receiptId, movimento_id: movementId };
    } else if (button.dataset.creditNew) {
      const clientId = document.querySelector(`[data-credit-client="${movementId}"]`).value;
      if (!clientId) return App.alert('Selecione um cliente.', 'error');
      path = '/api/recebiveis/criar-do-credito';
      data = { cliente_id: clientId, movimento_id: movementId };
    } else if (button.dataset.creditClassify) {
      const tipo = document.querySelector(`[data-credit-kind="${movementId}"]`).value;
      const descricao = window.prompt('Descreva a origem deste crédito:', row.descricao || '');
      if (!descricao?.trim()) return;
      path = '/api/recebiveis/classificar-credito';
      data = { movimento_id: movementId, tipo, descricao };
    } else if (button.dataset.creditTransfer) {
      const debitId = document.querySelector(`[data-credit-debit="${movementId}"]`).value;
      if (!debitId) return App.alert('Selecione o débito da conta de origem.', 'error');
      path = '/api/recebiveis/transferencias';
      data = { credito_id: movementId, debito_id: debitId };
    } else {
      const motivo = window.prompt('Motivo para desfazer esta conciliação:');
      if (!motivo?.trim()) return;
      path = `/api/recebiveis/movimentos/${movementId}/desfazer`;
      data = { motivo };
    }
    if (!button.dataset.receiveReverse && !window.confirm('Confirmar esta operação financeira?')) return;
    button.disabled = true;
    try {
      await Api.postJson(path, data);
      App.alert('Movimento atualizado.', 'success');
      await load();
    } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
  }

  function init(user) {
    $('recebiveisNav').hidden = !['admin', 'financeiro'].includes(user?.tipo);
    $('recebiveisBancoForm').addEventListener('submit', (event) => submit(event, '/api/recebiveis/bancos', 'Conta bancária salva.'));
    $('recebiveisClienteForm').addEventListener('submit', (event) => submit(event, '/api/recebiveis/clientes', 'Cliente cadastrado.'));
    $('recebiveisTituloForm').addEventListener('submit', (event) => submit(event, '/api/recebiveis/titulos', 'Conta a receber cadastrada.'));
    $('recebiveisBancoLimpar').addEventListener('click', () => { $('recebiveisBancoForm').reset(); $('recebiveisBancoForm').elements.id.value = ''; $('recebiveisBancoForm').elements.conta_hash.value = ''; });
    $('recebiveisBancos').addEventListener('click', (event) => {
      const button = event.target.closest('[data-bank-edit]');
      if (!button) return;
      const account = summary.bancos.find((row) => row.id === Number(button.dataset.bankEdit));
      const form = $('recebiveisBancoForm');
      for (const key of ['id', 'conta_hash', 'nome', 'banco_codigo', 'agencia', 'numero']) form.elements[key].value = account[key] ?? '';
      form.elements.nome.focus();
    });
    $('recebiveisTitulos').addEventListener('submit', handleReceipt);
    $('recebiveisTitulos').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-receipt-reverse]');
      if (!button || button.disabled) return;
      const motivo = window.prompt('Motivo para desfazer este recebimento:');
      if (!motivo?.trim()) return;
      button.disabled = true;
      try {
        await Api.postJson(`/api/recebiveis/recebimentos/${button.dataset.receiptReverse}/desfazer`, { motivo });
        App.alert('Recebimento desfeito.', 'success');
        await load();
      } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
    });
    $('recebiveisMovimentos').addEventListener('click', handleMovement);
    $('recebiveisAtualizar').addEventListener('click', load);
    $('recebiveisBusca').addEventListener('change', load);
  }

  window.Recebiveis = { init, load, prefillBanco };
})();
