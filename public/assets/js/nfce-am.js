(function () {
  const list = () => document.getElementById('nfceLista');
  const form = () => document.getElementById('nfceForm');
  let generation = 0;
  let companyId = '';
  let loaded = false;

  async function load({ reuse = false } = {}) {
    const selected = String(window.AppState?.empresaId || '');
    if (!selected) {
      generation += 1;
      companyId = ''; loaded = false;
      form().querySelector('button').disabled = true;
      list().innerHTML = '<div class="empty-state">Selecione uma empresa para consultar as NFC-e importadas.</div>';
      document.getElementById('nfceCount').textContent = '';
      return;
    }
    form().querySelector('button').disabled = !Empresas.hasActiveSelection();
    if (selected !== companyId) { companyId = selected; loaded = false; }
    if (reuse && loaded) return;
    const sequence = ++generation;
    list().innerHTML = '<div class="empty-state">Carregando NFC-e...</div>';
    try {
      const payload = await Api.get('/api/nfce-am');
      if (sequence !== generation || selected !== String(window.AppState?.empresaId) || document.getElementById('nfcePane').hidden) return;
      const rows = payload.documentos || [];
      list().innerHTML = rows.length ? rows.map((item) => `<article class="list-item">
        <div><strong>${App.escape(item.fornecedor)} · NFC-e ${App.escape(item.numero_nota)}</strong>
          <div class="meta">Emissão ${App.formatDate(item.data_emissao)} · CNPJ fornecedor ${App.escape(item.cnpj_fornecedor)} · ${(item.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
          <div class="meta">Chave ${App.escape(item.chave_acesso)} · <a href="/api/nfce-am/${item.id}/xml?empresa_id=${encodeURIComponent(selected)}">Baixar XML</a> · <a href="https://www.sefaz.am.gov.br/nfce/formConsulta.do" target="_blank" rel="noopener noreferrer">Conferir na SEFAZ-AM</a></div>
        </div><span class="status-pill">Conferência manual</span></article>`).join('') : '<div class="empty-state">Nenhuma NFC-e importada para esta empresa.</div>';
      document.getElementById('nfceCount').textContent = `${rows.length} NFC-e exibida(s), até 100 por empresa.`;
      loaded = true;
    } catch (error) {
      if (sequence === generation) list().textContent = error.message;
    }
  }

  async function importFile(event) {
    event.preventDefault();
    const button = form().querySelector('button');
    button.disabled = true;
    try {
      const result = await Api.postForm('/api/nfce-am', new FormData(form()));
      App.alert(result.duplicado ? 'Esta NFC-e já estava importada para a empresa.' : 'NFC-e importada para conferência, sem criar conta a pagar.', 'success');
      form().reset();
      await load();
    } catch (error) { App.alert(error.message, 'error'); }
    finally { button.disabled = !Empresas.hasActiveSelection(); }
  }

  function init(user) {
    if (!['admin', 'financeiro'].includes(user?.tipo)) return;
    form().addEventListener('submit', importFile);
  }

  window.NfceAm = { init, load };
})();
