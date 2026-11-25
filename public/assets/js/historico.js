(function () {
  const PAGE_SIZE = 50;
  let offset = 0;
  let currentCategory = '';
  let filtersLoaded = false;
  let user = null;

  function node(id) {
    return document.getElementById(id);
  }

  function escape(value) {
    return App.escape(value || '-');
  }

  function currentFilters() {
    return {
      categoria: currentCategory,
      inicio: node('historicoInicio').value,
      fim: node('historicoFim').value,
      usuario_id: node('historicoUsuario').value,
      acao: node('historicoAcao').value,
      busca: node('historicoBusca').value,
      limit: PAGE_SIZE,
      offset
    };
  }

  function renderCategories(categories) {
    const container = node('historicoCategorias');
    const entries = [{ value: '', label: 'Tudo' }, ...(categories || [])];
    container.innerHTML = entries.map((item) => `
      <button class="history-category ${item.value === currentCategory ? 'active' : ''}" data-history-category="${escape(item.value)}" type="button">
        ${escape(item.label)}
      </button>
    `).join('');
  }

  function renderSelect(select, items, emptyLabel) {
    const current = select.value;
    select.innerHTML = `<option value="">${emptyLabel}</option>${(items || []).map((item) => `<option value="${escape(item.value ?? item.id)}">${escape(item.label ?? item.nome)}</option>`).join('')}`;
    select.value = current;
  }

  async function loadFilters() {
    if (filtersLoaded) return;
    const data = await Api.get('/api/historico/filtros');
    renderCategories(data.categorias);
    renderSelect(node('historicoUsuario'), data.usuarios, 'Todos os usuários');
    renderSelect(node('historicoAcao'), data.acoes, 'Todas as ações');
    filtersLoaded = true;
  }

  function renderItems(data) {
    const container = node('historicoList');
    const items = data.items || [];
    node('historicoTotal').textContent = `${data.total || 0} registro${Number(data.total) === 1 ? '' : 's'}`;
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Nenhuma ação encontrada para estes filtros.</div>';
    } else {
      container.innerHTML = items.map((item) => `
        <article class="history-item">
          <div class="history-main">
            <div class="history-heading"><strong>${escape(item.titulo)}</strong><span class="history-category-label">${escape(item.categoria.replaceAll('_', ' '))}</span></div>
            <p>${escape(item.descricao)}</p>
            <div class="meta">${escape(item.empresa_nome)} · ${escape(item.usuario_exibicao)} · ${App.formatDateTime(item.quando_exibicao)}</div>
            ${item.nota_numero ? `<div class="meta">Nota ${escape(item.nota_numero)} · ${escape(item.fornecedor || 'Fornecedor não informado')}</div>` : ''}
          </div>
          ${item.nota_id ? `<button class="secondary-button compact-button" data-history-note-id="${item.nota_id}" data-history-company-id="${item.empresa_id || ''}" type="button">Abrir nota</button>` : ''}
        </article>
      `).join('');
    }
    const previous = node('historicoAnterior');
    const next = node('historicoProximo');
    previous.disabled = offset <= 0;
    next.disabled = offset + items.length >= Number(data.total || 0);
  }

  async function load({ silent = false } = {}) {
    if (!user || !['admin', 'financeiro'].includes(user.tipo)) return;
    const container = node('historicoList');
    if (!silent && !container.dataset.rendered) container.innerHTML = '<div class="empty-state">Carregando histórico...</div>';
    try {
      await loadFilters();
      const data = await Api.get('/api/historico', currentFilters());
      renderItems(data);
      container.dataset.rendered = '1';
    } catch (error) {
      if (!silent) {
        App.alert(error.message || 'Não foi possível carregar o histórico.', 'error');
        container.innerHTML = '<div class="empty-state">Não foi possível carregar o histórico.</div>';
      }
    }
  }

  function resetAndLoad() {
    offset = 0;
    load();
  }

  function bind() {
    node('historicoFiltros').addEventListener('submit', (event) => {
      event.preventDefault();
      resetAndLoad();
    });
    node('historicoLimpar').addEventListener('click', () => {
      node('historicoFiltros').reset();
      currentCategory = '';
      renderCategories(Array.from(node('historicoCategorias').querySelectorAll('[data-history-category]')).filter((button) => button.dataset.historyCategory).map((button) => ({ value: button.dataset.historyCategory, label: button.textContent.trim() })));
      resetAndLoad();
    });
    node('historicoCategorias').addEventListener('click', (event) => {
      const button = event.target.closest('[data-history-category]');
      if (!button) return;
      currentCategory = button.dataset.historyCategory || '';
      Array.from(node('historicoCategorias').querySelectorAll('[data-history-category]')).forEach((item) => item.classList.toggle('active', item === button));
      resetAndLoad();
    });
    node('historicoList').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-history-note-id]');
      if (!button) return;
      await Detalhes.loadDetalhes(button.dataset.historyNoteId, button.dataset.historyCompanyId);
    });
    node('historicoAnterior').addEventListener('click', () => {
      offset = Math.max(0, offset - PAGE_SIZE);
      load();
    });
    node('historicoProximo').addEventListener('click', () => {
      offset += PAGE_SIZE;
      load();
    });
  }

  function init(currentUser) {
    user = currentUser;
    const allowed = ['admin', 'financeiro'].includes(user?.tipo);
    node('historicoNav').hidden = !allowed;
    if (allowed) bind();
  }

  window.Historico = { init, load };
})();
