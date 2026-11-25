'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/model');
function memory() { const map = new Map([['unrelated', 'preserve']]); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }
const note = overrides => ({ number: 'TEST-001', supplier: 'Fornecedor fictício', category: 'Materiais', issued: M.day(), total: '100,01', count: '3', due: M.day(4), ...overrides });
test('centavos, parcelas e vencimentos conservam total e ajustam mês curto', () => {
  assert.equal(M.cents('1.234,56'), 123456); assert.equal(M.cents('100.01'), 10001);
  assert.deepEqual(M.split(10001, 3), [3334, 3334, 3333]);
  assert.deepEqual(M.installmentDates('2028-01-31', 3), ['2028-01-31', '2028-02-29', '2028-03-31']);
  for (const total of [1, 100, 10001, 999999]) for (const count of [1, 2, 3, 12]) if (total >= count) assert.equal(M.split(total, count).reduce((a, b) => a + b), total);
});
test('entradas inválidas e CSV de fórmulas são protegidos', () => {
  for (const value of ['0', '-1', '1.001', 'Infinity', '1e8', '', 'NaN', '1.2,34', '1..000,00', '1234.567,89']) assert.throws(() => M.cents(value));
  for (const count of [0, 121, 1.5, NaN]) assert.throws(() => M.split(100, count));
  assert.throws(() => M.date('2026-02-30')); assert.throws(() => M.text('<img onerror=alert(1)>'));
  assert.equal(M.escaped('<script>"&'), '&lt;script&gt;&quot;&amp;');
  assert.equal(M.csvCell('=1+1'), '"\'=1+1"'); assert.equal(M.csvCell('  +cmd'), '"\'  +cmd"'); assert.equal(M.csvCell('a"b'), '"a""b"');
});
test('nota, pagamento, proteção de edição, estorno e isolamento por empresa', () => {
  const store = M.createStore(memory()); store.update('note', note(), 1); const n = store.current().notes.at(-1);
  assert.equal(n.total, 10001); assert.equal(n.installments.length, 3);
  assert.throws(() => store.update('pay', { id: n.id, installment: n.installments[0].id }, 2));
  store.update('pay', { id: n.id, installment: n.installments[0].id }, 1);
  assert.equal(M.status(store.current().notes.at(-1)), 'parcial');
  assert.throws(() => store.update('note', note({ id: n.id }), 1));
  store.update('reverse', { id: n.id, installment: n.installments[0].id }, 1);
  store.update('note', note({ id: n.id, total: '90', count: 2 }), 1);
  assert.equal(store.current().notes.at(-1).total, 9000);
  assert.throws(() => store.update('note', note({ number: '<svg>' }), 1));
});
test('reset restaura apenas chave da demo e navegadores têm estados independentes', () => {
  const storage = memory(), a = M.createStore(storage), b = M.createStore(memory()); a.update('company', { name: 'Nova Exemplo' });
  assert.equal(a.current().companies.length, 3); assert.equal(b.current().companies.length, 2); a.reset();
  assert.equal(a.current().companies.length, 2); assert.equal(storage.getItem('unrelated'), 'preserve');
  const snapshot = a.current(); snapshot.companies[0].name = 'Alterado'; assert.notEqual(a.current().companies[0].name, 'Alterado');
});
test('armazenamento cheio não aplica operação e dados corrompidos são rejeitados', () => {
  const store = M.createStore({ getItem: () => null, setItem: () => { throw Error('quota'); } });
  assert.throws(() => store.update('company', { name: 'Teste' }), /não foi salva/); assert.equal(store.current().companies.length, 2);
  assert.throws(() => M.createStore({ getItem: () => '{invalid' }), /ler a demonstração/);
});
test('conciliação débito/crédito, importação idempotente e restauração do estado anterior', () => {
  const store = M.createStore(memory()); store.update('import-example', {}, 1); assert.throws(() => store.update('import-example', {}, 1));
  let s = store.current(); const debit = s.movements.find(m => m.amount === -125000), n = s.notes.find(n => n.total === 125000), p = n.installments[0];
  store.update('reconcile', { id: debit.id, note: n.id, installment: p.id }, 1); assert.equal(store.current().notes.find(x => x.id === n.id).installments[0].paid, true);
  assert.throws(() => store.update('reverse', { id: n.id, installment: p.id }, 1));
  store.update('unreconcile', { id: debit.id }, 1); assert.equal(store.current().notes.find(x => x.id === n.id).installments[0].paid, false);
  const credit = s.movements.find(m => m.amount > 0), r = s.receivables[0];
  store.update('reconcile', { id: credit.id, receivable: r.id }, 1); assert.equal(store.current().receivables[0].paid, true);
  store.update('unreconcile', { id: credit.id }, 1); assert.equal(store.current().receivables[0].paid, false);
});
test('empresa inativa bloqueia escrita e competências não duplicam', () => {
  const store = M.createStore(memory()); store.update('generate-fixed', { id: 12, due: M.day() }, 1);
  assert.throws(() => store.update('generate-fixed', { id: 12, due: M.day() }, 1));
  store.update('toggle-company', { id: 1 }); assert.throws(() => store.update('note', note(), 1));
  assert.throws(() => store.update('note', note({ category: 'Operação' }), 1));
});
test('desconciliar preserva a data de um pagamento anterior', () => {
  const store = M.createStore(memory()); const n = store.current().notes.find(n => n.total === 125000), p = n.installments[0], paidOn = M.day(-4);
  store.update('pay', { id: n.id, installment: p.id, paidOn }, 1); store.update('import-example', {}, 1);
  const movement = store.current().movements.find(m => m.amount === -125000);
  store.update('reconcile', { id: movement.id, note: n.id, installment: p.id }, 1);
  store.update('unreconcile', { id: movement.id }, 1);
  const after = store.current().notes.find(note => note.id === n.id).installments[0];
  assert.equal(after.paid, true); assert.equal(after.paidOn, paidOn);
});
test('armazenamento com estruturas aninhadas inválidas exige restauração', () => {
  const storage = memory(), invalid = M.seed(); invalid.notes[0].installments = null;
  storage.setItem(M.KEY, JSON.stringify(invalid)); assert.throws(() => M.createStore(storage), /Restaurar/);
  storage.removeItem(M.KEY); const store = M.createStore(storage); store.reset(); assert.equal(store.current().notes.length, M.seed().notes.length);
});
test('exemplos iniciais demonstram atraso e cancelamento mantendo as somas', () => {
  const initial = M.seed(), statuses = initial.notes.map(M.status);
  for (const status of ['aberta', 'parcial', 'paga', 'vencida', 'cancelada']) assert.ok(statuses.includes(status), `Estado inicial ausente: ${status}`);
  for (const note of initial.notes) assert.equal(note.installments.reduce((sum, p) => sum + p.amount, 0), note.total);
  const overdue = initial.notes.filter(n => !n.canceled).flatMap(n => n.installments).filter(p => !p.paid && p.due < M.day());
  assert.equal(overdue.reduce((sum, p) => sum + p.amount, 0), 45000);
  assert.equal(new Set(initial.notes.map(n => n.id)).size, initial.notes.length);
});
