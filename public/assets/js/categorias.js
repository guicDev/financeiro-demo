(function () {
  const states = new WeakMap();
  let adminBound = false;
  let adminItems = [];

  function state(form) {
    if (!states.has(form)) states.set(form, { request: 0, items: [], existing: null, ready: false });
    return states.get(form);
  }

  function fields(form) {
    const root = form.querySelector('.categoria-field');
    return {
      text: root.querySelector('[data-categoria-text]'),
      id: root.querySelector('[data-categoria-id]'),
      picker: root.querySelector('[data-categoria-picker]'),
      search: root.querySelector('[data-categoria-search]'),
      options: root.querySelector('[data-categoria-options]'),
      hint: root.querySelector('[data-categoria-hint]')
    };
  }

  function render(form) {
    const current = state(form);
    const { text, id, picker, search, options, hint } = fields(form);
    const catalog = current.items.length > 0;
    text.hidden = catalog;
    text.disabled = false;
    picker.hidden = !catalog;
    search.value = '';
    options.replaceChildren();
    if (!catalog) {
      text.value = current.existing?.categoria || '';
      id.value = current.existing?.categoria_id || '';
      hint.textContent = '';
      return;
    }
    const active = current.items.filter((item) => item.tipo === 'Despesa' && Number(item.ativo) === 1);
    const groups = new Map();
    for (const item of active) {
      if (!groups.has(item.grupo)) groups.set(item.grupo, []);
      groups.get(item.grupo).push(item);
    }
    current.options = active.map((item) => ({ ...item, label: `${item.nome} — ${item.grupo}` }));
    const existing = current.existing;
    const match = active.find((item) => String(item.id) === String(existing?.categoria_id || ''));
    if (existing && !match) {
      const label = existing.categoria ? `${existing.categoria}${existing.categoria_id ? ' (inativa)' : ' (categoria anterior não padronizada)'}` : 'Sem categoria anterior';
      options.replaceChildren();
      text.value = existing.categoria;
      id.value = existing.categoria_id || '';
      search.value = existing.categoria || '';
    } else if (match) {
      text.value = existing.categoria || match.nome;
      id.value = String(match.id);
      search.value = match.nome;
    } else {
      text.value = '';
      id.value = '';
    }
    if (!(existing && !match)) search.value = match?.nome || '';
    hint.textContent = active.length ? 'Escolha uma despesa ativa. O grupo distingue nomes iguais.' : 'Esta empresa não possui categorias de Despesa ativas.';
    renderOptions(form);
  }

  function renderOptions(form) {
    const current = state(form);
    const { search, options } = fields(form);
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const matches = current.options.filter((item) => item.label.toLocaleLowerCase('pt-BR').includes(query));
    options.replaceChildren();
    for (const item of matches) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'categoria-option';
      option.setAttribute('role', 'option');
      option.textContent = item.label;
      option.addEventListener('click', () => {
        const { text, id, search: input } = fields(form);
        text.value = item.nome;
        id.value = String(item.id);
        input.value = item.nome;
        options.hidden = true;
      });
      options.append(option);
    }
    options.hidden = !matches.length;
  }

  async function load(form, existing = null) {
    const current = state(form);
    current.existing = existing;
    const companyId = form.elements.empresa_id.value;
    const request = ++current.request;
    current.ready = false;
    const { text, picker, hint } = fields(form);
    text.hidden = true;
    text.disabled = false;
    picker.hidden = true;
    hint.textContent = companyId ? 'Carregando categorias...' : '';
    if (!companyId) {
      current.items = [];
      current.ready = true;
      render(form);
      return;
    }
    try {
      const items = await Api.get('/api/categorias', { empresa_id: companyId }, { headers: { 'X-Empresa-Id': companyId } });
      if (request !== current.request || form.elements.empresa_id.value !== companyId) return;
      current.items = Api.pickArray(items, ['categorias', 'items', 'data']);
      current.ready = true;
      render(form);
    } catch (error) {
      if (request !== current.request) return;
      current.items = [];
      hint.textContent = error.message || 'Não foi possível carregar as categorias.';
      App.alert(hint.textContent, 'error');
    }
  }

  function bind(form) {
    const { search, text, id, options } = fields(form);
    form.elements.empresa_id.addEventListener('change', () => load(form));
    search.addEventListener('input', () => {
      text.value = search.value;
      id.value = '';
      renderOptions(form);
    });
    search.addEventListener('focus', () => renderOptions(form));
    search.addEventListener('click', () => renderOptions(form));
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') options.hidden = true;
      if (event.key === 'Enter' && !options.hidden) {
        event.preventDefault();
        options.querySelector('button')?.click();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-categoria-picker]')) options.hidden = true;
    });
    return load(form);
  }

  function validate(form) {
    const current = state(form);
    if (!current.ready) { App.alert('Aguarde o carregamento das categorias.', 'error'); return false; }
    if (!current.items.length) return true;
    const { id, text, search } = fields(form);
    if (id.value && current.items.some((item) => String(item.id) === String(id.value))) return true;
    if (current.existing && text.value === current.existing.categoria) return true;
    App.alert('Selecione uma categoria de Despesa desta empresa.', 'error');
    search.focus();
    return false;
  }

  async function loadAdmin() {
    const companyId = document.getElementById('categoriaEmpresa').value;
    const list = document.getElementById('categoriasList');
    if (!companyId) { list.textContent = 'Selecione uma empresa.'; return; }
    try {
      adminItems = await Api.get('/api/categorias', { empresa_id: companyId }, { headers: { 'X-Empresa-Id': companyId } });
      list.replaceChildren();
      if (!adminItems.length) { list.textContent = 'Nenhuma categoria cadastrada.'; return; }
      for (const item of adminItems) {
        const row = document.createElement('article');
        row.className = 'list-item';
        const info = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = item.nome;
        const detail = document.createElement('div');
        detail.className = 'meta';
        detail.textContent = `${item.tipo} · ${item.grupo} · ${Number(item.ativo) ? 'Ativa' : 'Inativa'}${item.codigo_omie ? ` · Omie ${item.codigo_omie}` : ''}`;
        info.append(name, detail);
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const rename = document.createElement('button');
        rename.type = 'button'; rename.className = 'secondary-button compact-button'; rename.textContent = 'Renomear';
        rename.dataset.renameCategory = item.id;
        actions.append(rename);
        if (Number(item.ativo)) {
          const deactivate = document.createElement('button');
          deactivate.type = 'button'; deactivate.className = 'ghost-button compact-button'; deactivate.textContent = 'Inativar';
          deactivate.dataset.deactivateCategory = item.id;
          actions.append(deactivate);
        }
        row.append(info, actions);
        list.append(row);
      }
    } catch (error) { App.alert(error.message, 'error'); }
  }

  async function initAdmin(user) {
    const isAdmin = user?.tipo === 'admin';
    document.getElementById('categoriasNav').hidden = !isAdmin;
    if (!isAdmin || adminBound) return;
    adminBound = true;
    const company = document.getElementById('categoriaEmpresa');
    const empresas = Api.pickArray(await Api.get('/api/empresas'), ['empresas', 'items', 'data']);
    company.replaceChildren(new Option('Selecione uma empresa', ''));
    for (const empresa of empresas.filter((item) => Number(item.ativo) === 1)) company.add(new Option(empresa.nome, empresa.id));
    if (Empresas.hasActiveSelection()) company.value = Empresas.selectedId();
    company.addEventListener('change', loadAdmin);
    document.getElementById('categoriaForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await Api.postJson('/api/categorias', Object.fromEntries(new FormData(form)), { headers: { 'X-Empresa-Id': company.value } });
        form.elements.nome.value = '';
        await loadAdmin();
        App.alert('Categoria cadastrada.', 'success');
      } catch (error) { App.alert(error.message, 'error'); }
      finally { button.disabled = false; }
    });
    document.getElementById('categoriasList').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-rename-category], [data-deactivate-category]');
      if (!button) return;
      const item = adminItems.find((row) => String(row.id) === String(button.dataset.renameCategory || button.dataset.deactivateCategory));
      if (!item) return;
      const rename = Boolean(button.dataset.renameCategory);
      const name = rename ? window.prompt('Novo nome da categoria:', item.nome)?.trim() : null;
      if (rename && (!name || name === item.nome)) return;
      if (!rename && !window.confirm(`Inativar ${item.nome}? A categoria continuará nos registros antigos.`)) return;
      button.disabled = true;
      try {
        const body = { empresa_id: company.value };
        if (rename) await Api.putJson(`/api/categorias/${item.id}`, { ...body, nome: name }, { headers: { 'X-Empresa-Id': company.value } });
        else await Api.postJson(`/api/categorias/${item.id}/inativar`, body, { headers: { 'X-Empresa-Id': company.value } });
        await loadAdmin();
      } catch (error) { App.alert(error.message, 'error'); button.disabled = false; }
    });
    await loadAdmin();
  }

  window.Categorias = { bind, load, validate, initAdmin, loadAdmin };
})();
