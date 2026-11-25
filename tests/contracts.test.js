'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/assets/demo/model');
function memory() { const map = new Map([['outro-projeto', 'preservar']]); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; }
function setup() { const storage = memory(), app = M.create(storage); app.request('POST', '/api/auth/login', { login: 'admin', senha: 'demo' }); return { storage, app, call: (method, path, data = {}, company = 1) => app.request(method, path, data, company ? { 'X-Empresa-Id': String(company) } : {}) }; }
function note(overrides = {}) { return { empresa_id: 1, numero_nota: 'NOVA-DEMO', fornecedor: 'Fornecedor Novo Fictício', cnpj_cpf: 'DOCUMENTO-FICTICIO', data_emissao: M.today(), valor_total: '100,01', valor_total_centavos: 10001, numero_parcelas: 3, categoria_id: 11, centro_custo: 'Operação', forma_pagamento: 'boleto', parcelas_json: JSON.stringify(M.splitCents(10001, 3).map((valor_centavos, i) => ({ valor_centavos, data_vencimento: M.addMonths(M.addDays(M.today(), 5), i) }))), ...overrides }; }
test('contratos de autenticação conservam user/authenticated e nunca guardam senha', () => {
  const storage = memory(), app = M.create(storage); assert.deepEqual(app.request('GET', '/api/auth/status'), { authenticated: false, user: null });
  assert.throws(() => app.request('POST', '/api/auth/login', { login: 'admin', senha: 'errada' }));
  assert.equal(app.request('POST', '/api/auth/login', { login: 'admin', senha: 'demo' }).user.tipo, 'admin');
  assert.equal(app.request('GET', '/api/auth/status').authenticated, true); assert.ok(!storage.getItem(M.KEY).includes('senha'));
  app.request('POST', '/api/auth/logout'); assert.throws(() => app.request('GET', '/api/notas'));
});
test('divisão usa resto na última parcela, datas e valores seguem contratos financeiros', () => {
  assert.deepEqual(M.splitCents(10001, 3), [3333, 3333, 3335]); assert.equal(M.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(M.cents('1.234,56'), 123456); assert.equal(M.cents('100.01'), 10001);
  for (const value of ['1.2,34', '1..000,00', '-1', '1e8', 'NaN', '0', '0.001']) assert.throws(() => M.cents(value));
  for (const count of [0, -1, 1.5, 121]) assert.throws(() => M.splitCents(10001, count));
  assert.throws(() => M.iso('2026-02-30')); assert.throws(() => M.text('<img onerror=alert(1)>'));
  assert.equal(M.csvCell(' =1+1'), '"\' =1+1"'); assert.equal(M.csvCell('a"b'), '"a""b"');
});
test('dashboard, projeção, detalhes e listas expõem os DTOs usados pelas telas', () => {
  const { call } = setup(), dashboard = call('GET', '/api/dashboard'), list = call('GET', '/api/notas');
  for (const key of ['indicadores', 'resumo', 'agrupamento_vencimentos', 'vencimentos', 'cards']) assert.ok(dashboard[key]);
  const detail = call('GET', `/api/notas/${list[0].id}`); for (const key of ['nota', 'parcelas', 'resumo_financeiro', 'historico']) assert.ok(detail[key]);
  assert.equal(detail.nota.empresa_id, 1); assert.equal(detail.parcelas.reduce((sum, p) => sum + p.valor_centavos, 0), detail.resumo_financeiro.valor_total_a_pagar_centavos);
  const projection = call('GET', '/api/dashboard/projecao-mensal'); assert.equal(projection.horizonte[0].mes, '2026-01'); assert.equal(projection.horizonte.at(-1).mes, M.addMonths(`${M.today().slice(0, 7)}-01`, 11).slice(0, 7));
  const all = call('GET', '/api/notas', {}, null); assert.equal(all.length, list.length * 2); assert.ok(all.some(n => n.empresa_id === 2));
});
test('nota via parcelas_json, versão de edição, pagamento e encargos mantêm invariantes', () => {
  const { call } = setup(), { id } = call('POST', '/api/notas', note()); let detail = call('GET', `/api/notas/${id}`);
  assert.deepEqual(detail.parcelas.map(p => p.valor_centavos), [3333, 3333, 3335]); const p = detail.parcelas[0];
  call('POST', `/api/parcelas/${p.id}/pagar`, { data_pagamento: M.today() }); detail = call('GET', `/api/notas/${id}`); assert.equal(detail.nota.versao, 1); assert.equal(detail.nota.status, 'parcial');
  assert.throws(() => call('PUT', `/api/notas/${id}`, note({ id, versao: 1, parcelas_json: JSON.stringify([{ valor_centavos: 10001, data_vencimento: M.today() }]), numero_parcelas: 1 })));
  call('POST', `/api/parcelas/${p.id}/estornar`, { motivo: 'Conferência fictícia' }); assert.equal(call('GET', `/api/notas/${id}`).nota.versao, 1);
  call('PUT', `/api/parcelas/${p.id}/encargos`, { juros_centavos: 100, multa_centavos: 20, versao: 1 }); detail = call('GET', `/api/notas/${id}`); assert.equal(detail.nota.versao, 2); assert.equal(detail.parcelas[0].valor_centavos, 3453); assert.equal(detail.nota.valor_total_centavos, 10001);
  assert.throws(() => call('PUT', `/api/parcelas/${p.id}/encargos`, { juros_centavos: 0, multa_centavos: 0, versao: 1 }));
});
test('operações inválidas são atômicas, identificam duplicatas e respeitam empresa/perfil', () => {
  const { app, call } = setup(), initial = JSON.stringify(app.getState());
  assert.throws(() => call('POST', '/api/notas', note({ parcelas_json: '[{"valor_centavos":1,"data_vencimento":"2026-01-01"}]' }))); assert.equal(JSON.stringify(app.getState()), initial);
  const result = call('POST', '/api/notas', note()); assert.throws(() => call('POST', '/api/notas', note()), error => error.existingNoteId === result.id);
  assert.throws(() => call('GET', `/api/notas/${result.id}`, {}, 2));
  app.request('POST', '/api/auth/login', { login: 'consulta', senha: 'demo' }); assert.throws(() => call('POST', '/api/notas', note())); assert.throws(() => call('GET', '/api/recebiveis/resumo'));
  app.request('POST', '/api/auth/login', { login: 'financeiro', senha: 'demo' }); assert.throws(() => call('POST', '/api/categorias', { nome: 'Exemplo', tipo: 'Despesa', grupo: 'Grupo' }));
});
test('cadastro, situação e categorias por empresa conservam consulta histórica', () => {
  const { call } = setup(), company = call('POST', '/api/empresas', { nome: 'Empresa Fictícia Nova', cnpj: '12345678000195' }, null);
  const cat = call('POST', '/api/categorias', { tipo: 'Despesa', grupo: 'Grupo fictício', nome: 'Nova categoria' }, company.id);
  call('PUT', `/api/categorias/${cat.id}`, { nome: 'Categoria renomeada' }, company.id); call('POST', `/api/categorias/${cat.id}/inativar`, {}, company.id);
  assert.equal(call('GET', '/api/categorias', {}, company.id)[0].ativo, 0);
  call('PUT', '/api/empresas/1', { nome: 'Empresa Exemplo A', ativo: 0 }, null); assert.throws(() => call('POST', '/api/notas', note())); assert.ok(call('GET', '/api/notas').length);
});
test('recorrências usam ocorrencias_json, protegem snapshot e pagamentos nas remoções', () => {
  const { call } = setup(), occurrences = [0, 1, 2].map(i => ({ data_emissao: M.addMonths(M.today(), i), data_vencimento: M.addMonths(M.addDays(M.today(), 5), i), valor_total: '100,01' }));
  const result = call('POST', '/api/notas/recorrentes', note({ numero_nota: 'SERIE-NOVA', ocorrencias_json: JSON.stringify(occurrences) })); assert.equal(result.notas_criadas, 3);
  let preview = call('GET', `/api/notas/recorrencias/${result.id}/remocao`); assert.equal(preview.notas.length, 3);
  assert.throws(() => call('POST', `/api/notas/recorrencias/${result.id}/remover`, { nota_ids: [preview.notas[0].id], snapshot: 'obsoleto', excluir_serie: false }));
  const removed = call('POST', `/api/notas/recorrencias/${result.id}/remover`, { nota_ids: [preview.notas[0].id], snapshot: preview.snapshot, excluir_serie: false }); assert.equal(removed.restantes, 2);
  preview = call('GET', `/api/notas/recorrencias/${result.id}/remocao`); const first = call('GET', `/api/notas/${preview.notas[0].id}`); call('POST', `/api/parcelas/${first.parcelas[0].id}/pagar`, { data_pagamento: M.today() });
  preview = call('GET', `/api/notas/recorrencias/${result.id}/remocao`); assert.throws(() => call('POST', `/api/notas/recorrencias/${result.id}/remover`, { nota_ids: preview.notas.map(n => n.id), snapshot: preview.snapshot, excluir_serie: true }));
});
test('custos projetam doze competências e encerramento preserva mês atual', () => {
  const { call } = setup(), month = M.today().slice(0, 7), result = call('POST', '/api/custos-fixos', { empresa_id: 1, descricao: 'Assinatura fictícia', fornecedor: 'Fornecedor Mensal Fictício', categoria_id: 12, dia_vencimento: 31, inicio_mes: month, valor_mensal: '99,90', forma_pagamento: 'boleto' });
  assert.equal(result.competencias_geradas, 12); const notes = call('GET', '/api/notas').filter(n => n.custo_fixo_id === result.id); assert.equal(notes.length, 12); assert.equal(new Set(notes.map(n => n.competencia_custo_fixo)).size, 12);
  const end = call('POST', `/api/custos-fixos/${result.id}/encerrar`); assert.equal(end.previsoes_removidas, 11); assert.equal(call('GET', '/api/notas').filter(n => n.custo_fixo_id === result.id).length, 1);
});
test('OFX lista arquivos, sugestões, agrupa parcelas e preserva pagamento anterior', () => {
  const { call } = setup(), files = call('GET', '/api/extratos/arquivos').arquivos; assert.ok(files[0].conta_cadastrada); assert.equal(files[0].quantidade_movimentos, 4);
  let movements = call('GET', `/api/extratos?extrato_id=${files[0].id}&status=todos&tipo=todos`).movimentos; const debit = movements.find(m => m.valor_centavos === -125000), p = debit.sugestoes[0]; assert.ok(p.fornecedor);
  const before = M.addDays(M.today(), -3); call('POST', `/api/parcelas/${p.id}/pagar`, { data_pagamento: before }); call('POST', `/api/extratos/${debit.id}/conciliar`, { parcela_id: p.id });
  assert.equal(call('GET', `/api/notas/${p.nota_id}`).parcelas[0].data_pagamento, before); assert.throws(() => call('POST', `/api/parcelas/${p.id}/estornar`, { motivo: 'Teste' }));
  call('POST', `/api/extratos/${debit.id}/desconciliar`, { motivo: 'Conferência' }); assert.equal(call('GET', `/api/notas/${p.nota_id}`).parcelas[0].data_pagamento, before);
  const grouped = movements.find(m => m.valor_centavos === -10001), candidates = call('GET', `/api/extratos/${grouped.id}/candidatos`).parcelas.filter(p => p.numero_nota === 'EX-1-002');
  call('POST', `/api/extratos/${grouped.id}/conciliar-varios`, { parcelas_ids: candidates.map(p => p.id) }); assert.equal(call('GET', '/api/notas/102').nota.status, 'paga');
  call('POST', `/api/extratos/${grouped.id}/desconciliar`, { motivo: 'Teste fictício' }); assert.equal(call('GET', '/api/notas/102').nota.status, 'aberta');
  assert.throws(() => call('POST', '/api/extratos/ofx', {})); assert.equal(call('POST', '/api/extratos/ofx', { _fixture: 'ofx' }).duplicado, true);
});
test('recebíveis, crédito OFX, vínculo manual e reversões recalculam saldo', () => {
  const { call } = setup(); let summary = call('GET', '/api/recebiveis/resumo'); assert.equal(summary.total_aberto_centavos, 240000);
  const title = summary.titulos[0], credit = call('GET', '/api/recebiveis/movimentos').movimentos.find(m => m.tipo === 'credito');
  assert.throws(() => call('POST', '/api/recebiveis/recebimentos', { conta_receber_id: title.id, valor: '2400,01', data_recebimento: M.today() }));
  const receipt = call('POST', '/api/recebiveis/recebimentos', { conta_receber_id: title.id, valor: '2400,00', data_recebimento: M.today() });
  call('POST', '/api/recebiveis/recebimentos/vincular', { recebimento_id: receipt.id, movimento_id: credit.id }); summary = call('GET', '/api/recebiveis/resumo'); assert.equal(summary.total_aberto_centavos, 0); assert.equal(summary.recebimentos[0].movimento_id, credit.id);
  call('POST', `/api/recebiveis/movimentos/${credit.id}/desfazer`, { motivo: 'Teste' }); summary = call('GET', '/api/recebiveis/resumo'); assert.equal(summary.total_aberto_centavos, 240000); assert.equal(summary.total_recebido_centavos, 0);
});
test('documentos fiscais só vinculam sem pagar; download conserva XML e exportação real', () => {
  const { call } = setup(), list = call('GET', '/api/documentos-fiscais?situacao=todas'); assert.ok(list.status.demonstracao); assert.equal(list.documentos.length, 2);
  const doc = list.documentos.find(f => f.situacao === 'pendente'), target = doc.sugestoes[0]; call('POST', `/api/documentos-fiscais/${doc.id}/vincular`, { nota_id: target.id }); assert.equal(call('GET', `/api/notas/${target.id}`).parcelas[0].data_pagamento, null);
  assert.match(call('GET', `/api/documentos-fiscais/${doc.id}/xml`).content, /SEM VALIDADE FISCAL/);
  const xlsx = call('GET', '/api/relatorios/cartao-credito.xlsx'); assert.equal(xlsx.download, 'xlsx'); assert.ok(xlsx.rows.every(row => row.forma_pagamento === 'cartao_credito'));
  assert.equal(call('GET', '/api/recebiveis/relatorio.csv').type, 'text/csv;charset=utf-8');
  assert.throws(() => call('POST', '/api/nfce-am', {})); assert.equal(call('POST', '/api/nfce-am', { _fixture: 'nfce' }).duplicado, true);
  assert.throws(() => call('GET', '/api/inexistente'), error => error.status === 501);
});
test('persistência, restauração por namespace, corrupção e quota falham de forma explícita', () => {
  const { app, storage, call } = setup(); call('POST', '/api/notas', note()); assert.equal(M.create(storage).getState().notas.length, app.getState().notas.length);
  app.reset(); assert.equal(storage.getItem('outro-projeto'), 'preservar'); assert.equal(app.getState().notas.length, M.seed().notas.length);
  storage.setItem(M.KEY, '{invalid'); assert.throws(() => M.create(storage), /Restaurar/); storage.removeItem(M.KEY); assert.ok(M.create(storage));
  const full = M.create({ getItem: () => null, setItem: () => { throw Error('quota'); } }); assert.throws(() => full.request('POST', '/api/auth/login', { login: 'admin', senha: 'demo' }), /não foi salva/); assert.equal(full.getState().session, null);
});
