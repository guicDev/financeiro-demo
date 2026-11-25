(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FinanceModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'financeiro-demo:v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const day = (offset = 0, base = new Date()) => {
    const date = new Date(base); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  function text(value, max = 160) {
    const result = String(value ?? '').trim();
    if (!result || result.length > max || /[<>\u0000-\u001f]/.test(result)) throw new Error(`Preencha um texto válido, com até ${max} caracteres e sem marcação HTML.`);
    return result;
  }
  function cents(value) {
    let raw = String(value ?? '').trim();
    if (raw.includes(',')) {
      if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(raw)) throw new Error('Formato monetário inválido. Use 1234,56 ou 1.234,56.');
      raw = raw.replace(/\./g, '').replace(',', '.');
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Informe um valor positivo, com até duas casas decimais.');
    const [whole, fraction = ''] = raw.split('.');
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result <= 0 || result > 100000000000) throw new Error('Valor fora do limite da demonstração.');
    return result;
  }
  function date(value) {
    const result = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T12:00:00Z`)) || new Date(`${result}T12:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error('Informe uma data válida.');
    return result;
  }
  function split(total, count) {
    if (!Number.isSafeInteger(total) || total <= 0 || !Number.isInteger(count) || count < 1 || count > 120 || total < count) throw new Error('Quantidade de parcelas inválida (1 a 120), ou valor insuficiente.');
    return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
  }
  function installmentDates(first, count) {
    date(first); const [year, month, number] = first.split('-').map(Number);
    return Array.from({ length: count }, (_, i) => {
      const last = new Date(year, month + i, 0, 12).getDate();
      return day(0, new Date(year, month - 1 + i, Math.min(number, last), 12));
    });
  }
  const escaped = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const csvCell = value => {
    const raw = String(value ?? ''); const safe = /^[\s]*[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  function seed(base = new Date()) {
    const state = { version: 1, next: 30, companies: [{ id: 1, name: 'Empresa Exemplo A', active: true }, { id: 2, name: 'Empresa Exemplo B', active: true }], categories: [{ id: 3, company: 1, name: 'Materiais' }, { id: 4, company: 1, name: 'Serviços' }, { id: 5, company: 2, name: 'Operação' }], notes: [], fixed: [], receivables: [], movements: [], history: [] };
    const entries = [['DEMO-001', 'Fornecedor Fictício A', 85075, -8, 3, false], ['DEMO-002', 'Fornecedor Fictício B', 125000, 0, 1, false], ['DEMO-003', 'Fornecedor Fictício C', 30001, 12, 3, false], ['DEMO-004', 'Fornecedor Fictício D', 98000, -12, 1, true], ['DEMO-005', 'Fornecedor Fictício E', 62500, 7, 2, false]];
    entries.forEach((entry, index) => {
      const [number, supplier, total, offset, count, paid] = entry; const company = index === 4 ? 2 : 1;
      state.notes.push({ id: 6 + index, company, number, supplier, category: company === 1 ? 'Materiais' : 'Operação', issued: day(-15, base), total, canceled: false, installments: split(total, count).map((amount, i) => ({ id: `${6 + index}-${i + 1}`, amount, due: day(offset + i * 30, base), paid: paid || (index === 0 && i === 0), paidOn: paid || (index === 0 && i === 0) ? day(-2, base) : null })) });
    });
    state.notes.push(
      { id: 14, company: 1, number: 'DEMO-006', supplier: 'Fornecedor Fictício F', category: 'Serviços', issued: day(-20, base), total: 45000, canceled: false, installments: [{ id: '14-1', amount: 45000, due: day(-5, base), paid: false, paidOn: null }] },
      { id: 15, company: 1, number: 'DEMO-007', supplier: 'Fornecedor Fictício G', category: 'Materiais', issued: day(-10, base), total: 23000, canceled: true, installments: [{ id: '15-1', amount: 23000, due: day(8, base), paid: false, paidOn: null }] }
    );
    state.fixed.push({ id: 12, company: 1, name: 'Assinatura de exemplo', amount: 15990, due: day(10, base), active: true, generated: [] });
    state.receivables.push({ id: 13, company: 1, client: 'Cliente Fictício A', description: 'Serviço demonstrativo', amount: 240000, due: day(6, base), paid: false });
    return state;
  }
  function createStore(storage) {
    let state;
    try {
      const saved = storage.getItem(KEY); state = saved ? JSON.parse(saved) : seed();
      if (state.version !== 1 || !Array.isArray(state.notes) || !Array.isArray(state.companies) || !Array.isArray(state.categories) || !Array.isArray(state.fixed) || !Array.isArray(state.receivables) || !Array.isArray(state.movements) || !Array.isArray(state.history) || !Number.isSafeInteger(state.next)) throw Error('Formato inválido.');
      if (!state.companies.length || state.companies.some(c => !Number.isSafeInteger(c.id) || typeof c.active !== 'boolean' || !text(c.name))) throw Error('Empresas inválidas.');
      const hasCompany = row => state.companies.some(c => c.id === row.company);
      const validAmount = amount => Number.isSafeInteger(amount) && amount > 0 && amount <= 100000000000;
      if (state.categories.some(c => !hasCompany(c) || !text(c.name, 80))) throw Error('Categorias inválidas.');
      for (const n of state.notes) {
        if (!hasCompany(n) || !Number.isSafeInteger(n.id) || !text(n.number, 60) || !text(n.supplier) || !text(n.category, 80) || !validAmount(n.total) || !Array.isArray(n.installments) || n.installments.length < 1 || n.installments.length > 120 || typeof n.canceled !== 'boolean') throw Error('Nota inválida.');
        date(n.issued);
        if (n.installments.some(p => typeof p.id !== 'string' || !validAmount(p.amount) || typeof p.paid !== 'boolean' || !date(p.due) || (p.paid && !date(p.paidOn))) || n.installments.reduce((sum, p) => sum + p.amount, 0) !== n.total) throw Error('Parcelas inválidas.');
      }
      if (state.fixed.some(f => !hasCompany(f) || !text(f.name) || !validAmount(f.amount) || !date(f.due) || !Array.isArray(f.generated) || typeof f.active !== 'boolean')) throw Error('Custos inválidos.');
      if (state.receivables.some(r => !hasCompany(r) || !text(r.client) || !text(r.description) || !validAmount(r.amount) || !date(r.due) || typeof r.paid !== 'boolean')) throw Error('Recebíveis inválidos.');
      if (state.movements.some(m => !hasCompany(m) || !Number.isSafeInteger(m.amount) || m.amount === 0 || !text(m.memo) || !text(m.account) || !date(m.date) || !['pendente', 'conciliado'].includes(m.status))) throw Error('Movimentos inválidos.');
      if (state.history.some(h => !text(h.action) || !Number.isFinite(Date.parse(h.date)))) throw Error('Histórico inválido.');
    }
    catch (error) { throw new Error('Não foi possível ler a demonstração. Permita armazenamento local ou use Restaurar demonstração.'); }
    const current = () => clone(state);
    function save(next) { try { storage.setItem(KEY, JSON.stringify(next)); } catch { throw new Error('Armazenamento indisponível ou cheio. A operação não foi salva.'); } state = next; return current(); }
    function reset() { return save(seed()); }
    const companyFor = (s, id) => { const found = s.companies.find(c => c.id === Number(id)); if (!found || !found.active) throw new Error('Selecione uma empresa ativa.'); return found; };
    function update(action, values = {}, company) {
      const s = current(); const record = (list, id) => { const item = list.find(item => String(item.id) === String(id) && item.company === Number(company)); if (!item) throw new Error('Registro não encontrado nesta empresa.'); return item; };
      if (!['company', 'toggle-company'].includes(action)) companyFor(s, company);
      let label = action;
      if (action === 'company') s.companies.push({ id: s.next++, name: text(values.name), active: true });
      else if (action === 'toggle-company') { const c = s.companies.find(c => c.id === Number(values.id)); if (!c) throw Error('Empresa não encontrada.'); c.active = !c.active; }
      else if (action === 'category') { const name = text(values.name, 80); if (s.categories.some(c => c.company === Number(company) && c.name.toLowerCase() === name.toLowerCase())) throw Error('Categoria já cadastrada.'); s.categories.push({ id: s.next++, company: Number(company), name }); }
      else if (action === 'note') {
        const total = cents(values.total), count = Number(values.count); const amounts = split(total, count); const dueDates = installmentDates(values.due, count);
        const category = text(values.category, 80); if (!s.categories.some(c => c.company === Number(company) && c.name === category)) throw Error('Selecione uma categoria da empresa.');
        const number = text(values.number, 60); const existing = values.id ? record(s.notes, values.id) : null;
        if (existing && (existing.canceled || existing.installments.some(p => p.paid))) throw Error('Estorne os pagamentos antes de editar. Notas canceladas não podem ser editadas.');
        if (s.notes.some(n => n.company === Number(company) && n.number === number && n.id !== existing?.id)) throw Error('Número de nota já cadastrado nesta empresa.');
        const id = existing ? existing.id : s.next++;
        const note = { id, company: Number(company), number, supplier: text(values.supplier), category, issued: date(values.issued), total, canceled: false, installments: amounts.map((amount, i) => ({ id: `${id}-${i + 1}`, amount, due: dueDates[i], paid: false, paidOn: null })) };
        if (existing) s.notes[s.notes.indexOf(existing)] = note; else s.notes.push(note);
      } else if (['pay', 'reverse'].includes(action)) {
        const note = record(s.notes, values.id); if (note.canceled) throw Error('Nota cancelada.');
        const installment = note.installments.find(p => p.id === values.installment); if (!installment) throw Error('Parcela não encontrada.');
        if (action === 'pay' && installment.paid) throw Error('Parcela já paga.'); if (action === 'reverse' && !installment.paid) throw Error('Parcela não está paga.');
        if (action === 'reverse' && s.movements.some(m => m.installment === installment.id && m.status === 'conciliado')) throw Error('Desconcilie o movimento antes de estornar.');
        installment.paid = action === 'pay'; installment.paidOn = action === 'pay' ? date(values.paidOn || day()) : null;
      } else if (action === 'cancel') { const note = record(s.notes, values.id); if (note.installments.some(p => p.paid)) throw Error('Estorne os pagamentos antes de cancelar.'); if (s.movements.some(m => note.installments.some(p => p.id === m.installment))) throw Error('Desconcilie os movimentos primeiro.'); note.canceled = true; }
      else if (action === 'fixed') s.fixed.push({ id: s.next++, company: Number(company), name: text(values.name), amount: cents(values.amount), due: date(values.due), active: true, generated: [] });
      else if (action === 'stop-fixed') record(s.fixed, values.id).active = false;
      else if (action === 'generate-fixed') {
        const fixed = record(s.fixed, values.id); if (!fixed.active) throw Error('Custo encerrado.');
        const month = date(values.due).slice(0, 7); if (fixed.generated.includes(month)) throw Error('Este custo já foi lançado neste mês.');
        const id = s.next++; s.notes.push({ id, company: Number(company), number: `FIX-${fixed.id}-${month}`, supplier: fixed.name, category: 'Custo fixo', issued: day(), total: fixed.amount, canceled: false, installments: [{ id: `${id}-1`, amount: fixed.amount, due: values.due, paid: false, paidOn: null }] }); fixed.generated.push(month);
      } else if (action === 'receivable') s.receivables.push({ id: s.next++, company: Number(company), client: text(values.client), description: text(values.description), amount: cents(values.amount), due: date(values.due), paid: false });
      else if (action === 'receive' || action === 'reverse-receive') { const r = record(s.receivables, values.id); if (action === 'reverse-receive' && s.movements.some(m => m.receivable === r.id)) throw Error('Desconcilie o crédito antes de estornar.'); r.paid = action === 'receive'; }
      else if (action === 'import-example') {
        if (s.movements.some(m => m.company === Number(company) && m.file === 'EXEMPLO-OFX-01')) throw Error('O exemplo já foi importado nesta empresa.');
        const examples = [{ amount: -125000, memo: 'Pagamento demonstrativo' }, { amount: 240000, memo: 'Recebimento demonstrativo' }, { amount: -15990, memo: 'Assinatura demonstrativa' }];
        for (const example of examples) s.movements.push({ id: s.next++, company: Number(company), file: 'EXEMPLO-OFX-01', account: 'Conta fictícia 001', date: day(), status: 'pendente', ...example });
      } else if (action === 'reconcile') {
        const movement = record(s.movements, values.id); if (movement.status !== 'pendente') throw Error('Movimento já tratado.');
        if (movement.amount < 0) {
          const note = record(s.notes, values.note); const p = note.installments.find(p => p.id === values.installment);
          if (!p || note.canceled || p.amount !== -movement.amount || s.movements.some(m => m.installment === p.id)) throw Error('Selecione uma parcela de mesmo valor sem conciliação.');
          movement.wasPaid = p.paid; movement.wasPaidOn = p.paidOn; p.paid = true; p.paidOn = movement.date; movement.installment = p.id;
        } else { const r = record(s.receivables, values.receivable); if (r.amount !== movement.amount || s.movements.some(m => m.receivable === r.id)) throw Error('Selecione um título de mesmo valor sem conciliação.'); movement.wasPaid = r.paid; r.paid = true; movement.receivable = r.id; }
        movement.status = 'conciliado';
      } else if (action === 'unreconcile') {
        const movement = record(s.movements, values.id); if (movement.status !== 'conciliado') throw Error('Movimento não conciliado.');
        if (movement.installment) { const p = s.notes.flatMap(n => n.installments).find(p => p.id === movement.installment); if (p) { p.paid = movement.wasPaid; p.paidOn = movement.wasPaidOn || null; } }
        if (movement.receivable) { const r = s.receivables.find(r => r.id === movement.receivable); if (r) r.paid = movement.wasPaid; }
        delete movement.installment; delete movement.receivable; delete movement.wasPaid; delete movement.wasPaidOn; movement.status = 'pendente';
      } else throw Error('Operação indisponível na demonstração.');
      s.history.unshift({ id: s.next++, company: Number(company) || null, date: new Date().toISOString(), action: label });
      return save(s);
    }
    return { current, reset, update };
  }
  function status(note) {
    if (note.canceled) return 'cancelada'; if (note.installments.every(p => p.paid)) return 'paga';
    if (note.installments.some(p => p.paid)) return 'parcial'; if (note.installments.some(p => p.due < day())) return 'vencida'; return 'aberta';
  }
  return { KEY, day, text, cents, date, split, installmentDates, escaped, csvCell, seed, createStore, status };
});
