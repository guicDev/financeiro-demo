'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/assets/demo/model');
function setup() { const app = M.create({ getItem: () => null, setItem: () => {} }); app.request('POST', '/api/auth/login', { login: 'admin', senha: 'demo' }); return (method, path, data = {}) => app.request(method, path, data, { 'X-Empresa-Id': '1' }); }
test('transferência fictícia liga contas distintas e reversão devolve os dois movimentos', () => {
  const call = setup(), initial = call('GET', '/api/recebiveis/movimentos').movimentos, credit = initial.find(m => m.valor_centavos === 50000);
  const debit = call('GET', `/api/recebiveis/movimentos/${credit.id}/debitos-transferencia`).debitos[0];
  assert.ok(debit); call('POST', '/api/recebiveis/transferencias', { credito_id: credit.id, debito_id: debit.id });
  assert.equal(call('GET', '/api/recebiveis/resumo').transferencias.length, 1);
  call('POST', `/api/recebiveis/movimentos/${credit.id}/desfazer`, { motivo: 'Conferência fictícia' });
  assert.equal(call('GET', '/api/recebiveis/resumo').transferencias.length, 0);
  assert.ok(call('GET', '/api/recebiveis/movimentos').movimentos.filter(m => [credit.id, debit.id].includes(m.id)).every(m => m.status === 'pendente'));
});
test('crédito pode ser classificado e revertido ou criar uma conta recebida', () => {
  const call = setup(), credit = call('GET', '/api/recebiveis/movimentos').movimentos.find(m => m.valor_centavos === 50000);
  call('POST', '/api/recebiveis/classificar-credito', { movimento_id: credit.id, tipo: 'outro', descricao: 'Entrada fictícia' }); assert.equal(call('GET', '/api/recebiveis/resumo').creditos.length, 1);
  call('POST', `/api/recebiveis/movimentos/${credit.id}/desfazer`, { motivo: 'Reclassificação fictícia' });
  const result = call('POST', '/api/recebiveis/criar-do-credito', { movimento_id: credit.id, cliente_id: 11 });
  const title = call('GET', '/api/recebiveis/resumo').titulos.find(t => t.id === result.conta_receber_id);
  assert.equal(title.saldo_centavos, 0); assert.equal(title.recebido_centavos, 50000);
});
