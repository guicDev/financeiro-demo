(function () {
  'use strict';
  const M = window.FinanceModel, $ = id => document.getElementById(id), e = M.escaped;
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
  const dateLabel = value => String(value).split('-').reverse().join('/');
  const titles = { dashboard: 'Dashboard', notes: 'Notas', new: 'Cadastrar nota', today: 'Pagar hoje', ofx: 'Conciliação OFX', receivables: 'Contas a receber', fixed: 'Custos fixos', reports: 'Relatórios', history: 'Histórico', companies: 'Empresas', categories: 'Categorias' };
  let store, company = 1, view = 'dashboard', detailId, editingId;
  const Api = window.Api = {
    async get() { if (!store) throw Error('Entre na demonstração.'); return store.current(); },
    async post(action, values) { if (!store) throw Error('Entre na demonstração.'); return store.update(action, values, company); }
  };
  function notify(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
  const state = () => store.current();
  const rows = name => state()[name].filter(row => row.company === company);
  const active = () => state().companies.find(c => c.id === company)?.active;
  const table = (headers, contents) => `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${contents || `<tr><td colspan="${headers.length}" class="empty-state">Nenhum registro para este filtro.</td></tr>`}</tbody></table></div>`;
  const panel = (title, content) => `<section class="panel"><h2>${e(title)}</h2>${content}</section>`;
  const button = (label, action, id = '', extra = '', disabled = false) => `<button class="secondary-button" type="button" data-action="${e(action)}" data-id="${e(id)}" ${extra} ${disabled ? 'disabled' : ''}>${e(label)}</button>`;
  const input = (label, name, type = 'text', value = '', extra = '') => `<label>${e(label)}<input name="${name}" type="${type}" value="${e(value)}" required ${type === 'text' ? 'maxlength="160"' : ''} ${extra}></label>`;
  const fieldCompany = () => `<p class="note-hint">Empresa: <strong>${e(state().companies.find(c => c.id === company)?.name)}</strong>. ${active() ? 'As alterações afetam somente esta demonstração.' : 'Empresa inativa: somente consulta.'}</p>`;
  function options(items, value, label, selected = '') { return items.map(item => `<option value="${e(item[value])}" ${String(item[value]) === String(selected) ? 'selected' : ''}>${e(item[label])}</option>`).join(''); }
  function nav() {
    $('navigation').innerHTML = Object.entries(titles).map(([key, label]) => `<button type="button" class="nav-link ${view === key ? 'active' : ''}" data-view="${key}">${label}</button>`).join('');
    $('company').innerHTML = options(state().companies.map(c => ({ ...c, label: c.name + (c.active ? '' : ' (inativa)') })), 'id', 'label', company);
  }
  const allInstallments = () => rows('notes').filter(n => !n.canceled).flatMap(n => n.installments.map(p => ({ ...p, note: n })));
  function dashboard() {
    const installments = allInstallments(), pending = installments.filter(p => !p.paid), sum = list => list.reduce((a, p) => a + p.amount, 0);
    const metrics = [['Em aberto', sum(pending)], ['Pagar hoje', sum(pending.filter(p => p.due === M.day()))], ['Em atraso', sum(pending.filter(p => p.due < M.day()))], ['Já pago', sum(installments.filter(p => p.paid))]];
    const months = Array.from({ length: 4 }, (_, i) => { const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + i); const month = M.day(0, base).slice(0, 7); return { month, amount: sum(pending.filter(p => p.due.startsWith(month))) }; });
    const max = Math.max(1, ...months.map(m => m.amount));
    return `<div class="metrics-grid">${metrics.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${money(value)}</strong></article>`).join('')}</div><div class="content-grid">${panel('Vencimentos próximos', pending.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6).map(p => `<div class="detail-row"><div><strong>${e(p.note.supplier)}</strong><div class="meta">${dateLabel(p.due)} • Nota ${e(p.note.number)}</div></div><div>${money(p.amount)}<br>${button('Detalhes', 'detail', p.note.id)}</div></div>`).join('') || '<p>Sem parcelas pendentes.</p>')}${panel('Previsão mensal em aberto', months.map(m => `<div class="bar-row">${e(m.month)} • <strong>${money(m.amount)}</strong><progress max="${max}" value="${m.amount}" aria-label="Previsão de ${e(m.month)}"></progress></div>`).join(''))}</div>`;
  }
  function notes(search = '', filter = '') {
    const list = rows('notes').filter(n => `${n.number} ${n.supplier}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (!filter || M.status(n) === filter));
    return panel('Notas cadastradas', `<div class="view-heading">${button('Nova nota', 'new', '', '', !active())}</div><form id="filter-form" class="search-row"><input name="search" aria-label="Buscar nota ou fornecedor" placeholder="Número ou fornecedor" value="${e(search)}"><select name="status" aria-label="Status"><option value="">Todos os status</option>${['aberta', 'parcial', 'paga', 'vencida', 'cancelada'].map(s => `<option ${filter === s ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="secondary-button">Filtrar</button></form>${table(['Nota', 'Fornecedor', 'Emissão', 'Valor', 'Status', 'Ações'], list.map(n => `<tr><td>${e(n.number)}</td><td>${e(n.supplier)}</td><td>${dateLabel(n.issued)}</td><td>${money(n.total)}</td><td><span class="pill ${M.status(n)}">${M.status(n)}</span></td><td>${button('Detalhes', 'detail', n.id)}</td></tr>`).join(''))}`);
  }
  function noteForm() {
    const note = editingId ? rows('notes').find(n => n.id === Number(editingId)) : null;
    const categories = rows('categories');
    if (!active()) return panel('Somente consulta', 'Ative a empresa para cadastrar ou editar.');
    if (!categories.length) return panel('Categoria necessária', `Cadastre uma categoria antes de lançar uma nota. ${button('Categorias', 'categories')}`);
    return panel(note ? 'Editar nota' : 'Cadastrar nota', `${fieldCompany()}<form id="note-form" class="form-grid">${input('Número da nota', 'number', 'text', note?.number || '')}${input('Fornecedor fictício', 'supplier', 'text', note?.supplier || '')}<label>Categoria<select name="category">${categories.map(c => `<option ${c.name === note?.category ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></label>${input('Data de emissão', 'issued', 'date', note?.issued || M.day())}${input('Valor total (R$)', 'total', 'text', note ? (note.total / 100).toFixed(2) : '', 'inputmode="decimal" placeholder="100,01"')}${input('Quantidade de parcelas', 'count', 'number', note?.installments.length || 1, 'min="1" max="120"')}${input('Primeiro vencimento', 'due', 'date', note?.installments[0].due || M.day(7))}<p class="meta">Parcelas mensais. Centavos são distribuídos sem arredondar o total. Fim do mês é ajustado ao último dia válido.</p><div class="wide actions"><button class="primary-button" type="submit">${note ? 'Salvar alterações' : 'Cadastrar nota'}</button>${button('Prévia das parcelas', 'preview')}${button('Voltar às notas', 'notes')}</div><div id="preview" class="wide" aria-live="polite"></div></form><p class="readonly-note">Anexos e documentos fiscais reais não são aceitos nesta demonstração.</p>`);
  }
  function detail() {
    const note = rows('notes').find(n => n.id === Number(detailId)); if (!note) return panel('Nota não encontrada', button('Voltar', 'notes'));
    return panel(`Nota ${note.number}`, `<p><strong>${e(note.supplier)}</strong> • ${e(note.category)} • ${money(note.total)}</p><p>Status: <span class="pill ${M.status(note)}">${M.status(note)}</span></p><div class="actions">${button('Editar nota', 'edit', note.id, '', !active() || note.canceled || note.installments.some(p => p.paid))}${button('Cancelar nota', 'cancel', note.id, '', !active() || note.canceled || note.installments.some(p => p.paid))}${button('Baixar resumo', 'download-note', note.id)}${button('Voltar às notas', 'notes')}</div><h3>Parcelas</h3>${note.installments.map((p, i) => `<div class="detail-row"><div><strong>Parcela ${i + 1} • ${money(p.amount)}</strong><div class="meta">Vencimento ${dateLabel(p.due)} ${p.paid ? `• Paga em ${dateLabel(p.paidOn)}` : p.due < M.day() ? '• Vencida' : '• Em aberto'}</div></div>${button(p.paid ? 'Estornar' : 'Confirmar pagamento', p.paid ? 'reverse' : 'pay', note.id, `data-installment="${e(p.id)}"`, !active() || note.canceled)}</div>`).join('')}<p class="meta">Pagamentos são simulações; nenhum banco é acionado. Para editar, estorne todas as parcelas pagas.</p>`);
  }
  function today() { return panel('Pagar hoje e atrasadas', allInstallments().filter(p => !p.paid && p.due <= M.day()).map(p => `<div class="detail-row"><div><strong>${e(p.note.supplier)} • ${money(p.amount)}</strong><div class="meta">${dateLabel(p.due)} • ${e(p.note.number)}</div></div>${button('Confirmar pagamento', 'pay', p.note.id, `data-installment="${p.id}"`, !active())}</div>`).join('') || '<p>Nenhum pagamento pendente até hoje.</p>'); }
  function companies() { return panel('Empresas fictícias', `<form id="company-form" class="form-grid">${input('Nome da empresa fictícia', 'name')}<div class="actions"><button class="primary-button">Cadastrar empresa</button></div></form>${state().companies.map(c => `<div class="detail-row"><div><strong>${e(c.name)}</strong> • ${c.active ? 'Ativa' : 'Inativa'}</div>${button(c.active ? 'Inativar' : 'Ativar', 'toggle-company', c.id)}</div>`).join('')}<p class="meta">Cada empresa tem seus próprios lançamentos e categorias.</p>`); }
  function categories() { return panel('Categorias da empresa', `${fieldCompany()}<form id="category-form" class="form-grid">${input('Nome da categoria', 'name', 'text', '', 'maxlength="80"')}<div class="actions"><button class="primary-button" ${active() ? '' : 'disabled'}>Cadastrar categoria</button></div></form>${rows('categories').map(c => `<div class="detail-row">${e(c.name)}</div>`).join('') || '<p>Nenhuma categoria.</p>'}`); }
  function fixed() { return panel('Custos fixos mensais', `${fieldCompany()}<form id="fixed-form" class="form-grid">${input('Descrição fictícia', 'name')}${input('Valor mensal (R$)', 'amount', 'text', '', 'inputmode="decimal"')}${input('Primeiro vencimento', 'due', 'date', M.day(10))}<div class="actions"><button class="primary-button" ${active() ? '' : 'disabled'}>Cadastrar custo</button></div></form>${rows('fixed').map(f => `<div class="detail-row"><div><strong>${e(f.name)} • ${money(f.amount)}</strong><div class="meta">${f.active ? 'Ativo' : 'Encerrado'} • ${f.generated.length} competência(s) lançada(s)</div></div><div class="actions">${button('Lançar competência', 'generate-fixed', f.id, '', !active() || !f.active)}${button('Encerrar', 'stop-fixed', f.id, '', !active() || !f.active)}</div></div>`).join('')}<p class="meta">O lançamento de cada competência é manual. A mesma competência não pode ser gerada duas vezes.</p>`); }
  function receivables() { const list = rows('receivables'); return panel('Contas a receber', `${fieldCompany()}<p>Em aberto: <strong>${money(list.filter(r => !r.paid).reduce((s, r) => s + r.amount, 0))}</strong> • Recebido: <strong>${money(list.filter(r => r.paid).reduce((s, r) => s + r.amount, 0))}</strong></p><form id="receivable-form" class="form-grid">${input('Cliente fictício', 'client')}${input('Descrição', 'description')}${input('Valor (R$)', 'amount', 'text', '', 'inputmode="decimal"')}${input('Vencimento', 'due', 'date', M.day(7))}<div class="wide"><button class="primary-button" ${active() ? '' : 'disabled'}>Cadastrar título</button></div></form>${list.map(r => `<div class="detail-row"><div><strong>${e(r.client)} • ${money(r.amount)}</strong><div class="meta">${e(r.description)} • ${dateLabel(r.due)} • ${r.paid ? 'Recebido' : 'Em aberto'}</div></div>${button(r.paid ? 'Estornar recebimento' : 'Confirmar recebimento', r.paid ? 'reverse-receive' : 'receive', r.id, '', !active())}</div>`).join('')}${button('Baixar CSV', 'csv-receivables')}`); }
  function ofx() {
    return panel('Conciliação OFX — exemplo fictício', `${fieldCompany()}<p class="note-hint">Importação simulada de três movimentos em conta fictícia. Nenhum arquivo real ou conexão bancária é utilizado.</p><div class="actions">${button('Importar exemplo OFX', 'import-example', '', '', !active())}${button('Baixar exemplo OFX', 'download-ofx')}</div><p class="meta">Débitos podem ser conciliados com parcelas de mesmo valor. Créditos podem ser vinculados a títulos a receber. A conciliação confirma o pagamento/recebimento; desfazer restaura o estado anterior.</p>${rows('movements').map(m => {
      let opts = '';
      if (m.amount < 0) opts = allInstallments().filter(p => p.amount === -m.amount && !rows('movements').some(x => x.installment === p.id)).map(p => `<option value="${p.note.id}:${e(p.id)}">${e(p.note.number)} • ${e(p.note.supplier)} • ${dateLabel(p.due)}</option>`).join('');
      else opts = rows('receivables').filter(r => r.amount === m.amount && !rows('movements').some(x => x.receivable === r.id)).map(r => `<option value="${r.id}">${e(r.client)} • ${e(r.description)}</option>`).join('');
      return `<div class="detail-row"><div><strong>${e(m.memo)} • ${money(m.amount)}</strong><div class="meta">${dateLabel(m.date)} • ${e(m.account)} • <span class="pill ${m.status}">${m.status}</span></div></div>${m.status === 'conciliado' ? button('Desconciliar', 'unreconcile', m.id, '', !active()) : `<form class="actions reconcile-form" data-movement="${m.id}"><label>Registro de mesmo valor<select name="target" required><option value="">Selecione</option>${opts}</select></label><button class="secondary-button" ${active() && opts ? '' : 'disabled'}>Conciliar</button></form>${opts ? '' : '<p class="meta">Cadastre uma parcela ou título do mesmo valor para conciliar.</p>'}`}</div>`;
    }).join('') || '<p>Importe o exemplo para começar.</p>'}`);
  }
  function reports() { return panel('Relatórios', `<p>Exportações CSV contendo somente os registros fictícios da empresa selecionada. O CSV pode ser aberto em uma planilha.</p><div class="actions">${button('Exportar notas e parcelas', 'csv-notes')}${button('Exportar contas a receber', 'csv-receivables')}</div><p class="meta">Colunas incluem valores em reais com duas casas decimais. Exportação XLSX e integrações fiscais não fazem parte desta demonstração.</p>`); }
  const actionNames = { company: 'Empresa cadastrada', 'toggle-company': 'Situação da empresa alterada', category: 'Categoria cadastrada', note: 'Nota salva', pay: 'Pagamento confirmado', reverse: 'Pagamento estornado', cancel: 'Nota cancelada', fixed: 'Custo fixo cadastrado', 'stop-fixed': 'Custo encerrado', 'generate-fixed': 'Competência lançada', receivable: 'Título cadastrado', receive: 'Recebimento confirmado', 'reverse-receive': 'Recebimento estornado', 'import-example': 'Exemplo importado', reconcile: 'Movimento conciliado', unreconcile: 'Conciliação desfeita' };
  function history() { return panel('Histórico da demonstração', state().history.filter(h => !h.company || h.company === company).map(h => `<div class="detail-row"><span>${e(actionNames[h.action] || h.action)}</span><span class="meta">${e(new Date(h.date).toLocaleString('pt-BR'))}</span></div>`).join('') || '<p>As ações realizadas aqui aparecerão neste histórico.</p>'); }
  function render() { nav(); $('title').textContent = view === 'detail' ? 'Detalhes da nota' : titles[view] || 'Financeiro'; const pages = { dashboard, notes, new: noteForm, detail, today, companies, categories, fixed, receivables, ofx, reports, history }; $('content').innerHTML = pages[view](); }
  function navigate(next) { view = next; if (view === 'new') editingId = null; notify(''); render(); window.scrollTo(0, 0); }
  function download(name, content, type = 'text/plain;charset=utf-8') { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportCSV(kind) {
    let data;
    if (kind === 'notes') data = [['Nota', 'Fornecedor', 'Categoria', 'Parcela', 'Vencimento', 'Valor em reais', 'Situação'], ...rows('notes').flatMap(n => n.installments.map((p, i) => [n.number, n.supplier, n.category, i + 1, p.due, (p.amount / 100).toFixed(2).replace('.', ','), n.canceled ? 'cancelada' : p.paid ? 'paga' : 'aberta']))];
    else data = [['Cliente', 'Descrição', 'Vencimento', 'Valor em reais', 'Situação'], ...rows('receivables').map(r => [r.client, r.description, r.due, (r.amount / 100).toFixed(2).replace('.', ','), r.paid ? 'recebido' : 'aberto'])];
    download(`${kind === 'notes' ? 'notas' : 'recebiveis'}-demo.csv`, '\uFEFF' + data.map(row => row.map(M.csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  async function mutate(action, values) { await Api.post(action, values); render(); notify(actionNames[action] || 'Operação concluída.'); }
  async function click(event) {
    const item = event.target.closest('[data-action], [data-view]'); if (!item) return;
    if (item.dataset.view) return navigate(item.dataset.view);
    const { action, id, installment } = item.dataset;
    try {
      if (titles[action]) return navigate(action);
      if (action === 'detail') { detailId = id; view = 'detail'; return render(); }
      if (action === 'edit') { editingId = id; view = 'new'; return render(); }
      if (action === 'preview') { const values = Object.fromEntries(new FormData($('note-form'))); const amounts = M.split(M.cents(values.total), Number(values.count)); const dates = M.installmentDates(values.due, amounts.length); $('preview').innerHTML = panel('Prévia', amounts.map((v, i) => `<div class="detail-row">Parcela ${i + 1}<strong>${money(v)}</strong>${dateLabel(dates[i])}</div>`).join('')); return; }
      if (action === 'download-note') { const n = rows('notes').find(n => n.id === Number(id)); return download('resumo-nota-demo.txt', `DEMONSTRAÇÃO — DADOS FICTÍCIOS\nNota: ${n.number}\nFornecedor: ${n.supplier}\nTotal: ${money(n.total)}\n${n.installments.map((p, i) => `Parcela ${i + 1}: ${money(p.amount)} — ${p.due} — ${p.paid ? 'paga' : 'aberta'}`).join('\n')}`); }
      if (action.startsWith('csv-')) return exportCSV(action.slice(4));
      if (action === 'download-ofx') return download('extrato-ficticio.ofx', `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>000<ACCTID>DEMO-001<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST>${[-1250, 2400, -159.90].map((v, i) => `<STMTTRN><TRNTYPE>${v < 0 ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${M.day().replaceAll('-', '')}<TRNAMT>${v.toFixed(2)}<FITID>DEMO-${i + 1}<MEMO>MOVIMENTO FICTICIO ${i + 1}</STMTTRN>`).join('')}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
      if (['cancel', 'reverse', 'reverse-receive', 'stop-fixed', 'toggle-company', 'unreconcile'].includes(action) && !window.confirm('Confirmar esta alteração nos dados fictícios?')) return;
      if (action === 'pay' && !window.confirm('Confirmar o pagamento fictício desta parcela hoje?')) return;
      const values = { id, installment };
      if (action === 'generate-fixed') { const due = window.prompt('Vencimento da competência (AAAA-MM-DD):', rows('fixed').find(f => f.id === Number(id)).due); if (due === null) return; values.due = due; }
      await mutate(action, values);
    } catch (error) { notify(error.message, true); }
  }
  async function submit(event) {
    event.preventDefault(); const form = event.target;
    try {
      const values = Object.fromEntries(new FormData(form));
      if (form.id === 'filter-form') { $('content').innerHTML = notes(values.search, values.status); return; }
      const forms = { 'note-form': 'note', 'company-form': 'company', 'category-form': 'category', 'fixed-form': 'fixed', 'receivable-form': 'receivable' };
      if (form.matches('.reconcile-form')) { values.id = form.dataset.movement; const movement = rows('movements').find(m => m.id === Number(values.id)); if (movement.amount < 0) [values.note, values.installment] = values.target.split(':'); else values.receivable = values.target; await mutate('reconcile', values); return; }
      const action = forms[form.id]; if (!action) throw Error('Formulário indisponível.');
      if (action === 'note' && editingId) values.id = editingId;
      await Api.post(action, values); if (action === 'note') { editingId = null; view = 'notes'; } render(); notify(actionNames[action]);
    } catch (error) { notify(error.message, true); }
  }
  function enter() { try { store = M.createStore(window.localStorage); const first = store.current().companies.find(c => c.active) || store.current().companies[0]; company = first.id; $('welcome').hidden = true; $('application').hidden = false; view = 'dashboard'; render(); } catch (error) { $('welcome-error').textContent = error.message; } }
  function reset() { if (!window.confirm('Restaurar os exemplos e apagar somente as alterações desta demonstração?')) return; try { if (!store) { window.localStorage.removeItem(M.KEY); store = M.createStore(window.localStorage); } store.reset(); company = 1; view = 'dashboard'; if (!$('application').hidden) render(); $('welcome-error').textContent = ''; notify('Demonstração restaurada.'); } catch (error) { if ($('application').hidden) $('welcome-error').textContent = error.message; else notify(error.message, true); } }
  $('enter').addEventListener('click', enter); $('welcome-reset').addEventListener('click', reset); $('reset').addEventListener('click', reset);
  $('exit').addEventListener('click', () => { $('application').hidden = true; $('welcome').hidden = false; });
  $('company').addEventListener('change', event => { company = Number(event.target.value); detailId = null; editingId = null; if (view === 'detail' || view === 'new') view = 'notes'; notify(''); render(); });
  document.addEventListener('click', click); $('content').addEventListener('submit', submit);
})();
