'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('../public/assets/vendor/exceljs.min');
const reports = require('../public/assets/demo/reports');
const M = require('../public/assets/demo/model');
function result(path) { const store = M.create({ getItem: () => null, setItem: () => {} }); store.request('POST', '/api/auth/login', { login: 'admin', senha: 'demo' }); return store.request('GET', path, {}, { 'X-Empresa-Id': '1' }); }
test('XLSX real preserva cabeçalho na linha 7, legenda, totais, categorias e valores numéricos', async () => {
  const data = result('/api/relatorios/geral.xlsx'), workbook = reports.createWorkbook(ExcelJS, data), buffer = await workbook.xlsx.writeBuffer();
  assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), 'PK');
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(buffer); const sheet = loaded.getWorksheet('Relatório');
  assert.equal(sheet.getCell('A1').value, 'Relatorio geral'); assert.equal(sheet.getCell('A5').value, 'Legenda'); assert.equal(sheet.getCell('A7').value, 'Empresa');
  assert.equal(sheet.getCell('E8').value, data.rows[0].valor_centavos / 100);
  const values = []; sheet.eachRow(row => row.eachCell(cell => values.push(cell.value)));
  assert.ok(values.includes('TOTAL GERAL')); assert.ok(values.includes('TOTAIS POR CATEGORIA')); assert.ok(values.includes('Total unico das notas'));
});
test('relatório de cartões conserva emissão, fração da parcela e grupos/subtotais', async () => {
  const data = result('/api/relatorios/cartao-credito.xlsx?ordenacao=cartao'), workbook = reports.createWorkbook(ExcelJS, data, value => `Cartão fictício ${value}`);
  const buffer = await workbook.xlsx.writeBuffer(), loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(buffer);
  const sheet = loaded.getWorksheet('Relatório'); assert.equal(sheet.getCell('B7').value, 'Emissao'); const values = []; sheet.eachRow(row => row.eachCell(cell => values.push(cell.value)));
  assert.ok(values.some(value => typeof value === 'string' && value.startsWith('CARTAO:'))); assert.ok(values.includes('1/3')); assert.ok(values.some(value => typeof value === 'string' && value.startsWith('Subtotal')));
});
