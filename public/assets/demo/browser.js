(function () {
  'use strict';
  const M = window.DemoModel, requests = [], errors = [];
  let store, startupError;
  const trace = (method, path, status) => { const item = { method, path, status }; requests.push(item); if (requests.length > 500) requests.shift(); if (status >= 400) errors.push(item); };
  try { store = M.create(window.localStorage); } catch (error) { startupError = error; }
  function message(text, error = false) {
    const node = document.getElementById('demoMessage'); if (node) { node.textContent = text; node.setAttribute('role', error ? 'alert' : 'status'); }
    if (window.App) window.App.alert(text, error ? 'error' : 'success');
  }
  function company() { return String(window.AppState?.empresaId || ''); }
  function headers(input = {}) { const result = {}; new Headers(input).forEach((value, key) => { result[key] = value; }); return result; }
  const fixtureOfx = () => `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>${M.today().replaceAll('-', '')}<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><TRNUID>DEMO-FINANCEIRO-OFX-V2<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>000<ACCTID>DEMO-001<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST><DTSTART>${M.today().replaceAll('-', '')}<DTEND>${M.today().replaceAll('-', '')}${[-1250, 2400, -100.01].map((amount, i) => `<STMTTRN><TRNTYPE>${amount < 0 ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${M.today().replaceAll('-', '')}<TRNAMT>${amount.toFixed(2)}<FITID>DEMO-${i + 1}<MEMO>MOVIMENTO FICTICIO ${i + 1}</STMTTRN>`).join('')}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const fixtureNfce = '<?xml version="1.0" encoding="UTF-8"?><documentoDemonstrativo><marcador>DEMO-FINANCEIRO-NFCE-V2</marcador><aviso>XML FICTICIO SEM VALIDADE FISCAL</aviso></documentoDemonstrativo>';
  function fixturePdf() {
    const stream = 'BT /F1 18 Tf 50 760 Td (DOCUMENTO FICTICIO DE DEMONSTRACAO) Tj 0 -30 Td /F1 12 Tf (Sem validade fiscal ou financeira.) Tj 0 -22 Td (Nenhum pagamento real foi realizado.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = '%PDF-1.4\n% DOCUMENTO-FICTICIO-V2\n'; const offsets = [0];
    objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return pdf;
  }
  async function bodyData(body) {
    if (!body) return {};
    if (!(body instanceof FormData)) return typeof body === 'string' ? JSON.parse(body) : body;
    const result = {};
    for (const [key, value] of body.entries()) {
      if (!(value instanceof File)) { result[key] = value; continue; }
      if (!value.size) continue;
      if (value.size > 100000) throw Error('Use somente os arquivos fictícios disponíveis nesta demonstração.');
      const contents = await value.text();
      if (key === 'ofx' && value.name === 'exemplo-ofx.ofx' && contents === fixtureOfx()) result._fixture = 'ofx';
      else if (key === 'xml' && value.name === 'exemplo-nfce.xml' && contents === fixtureNfce) result._fixture = 'nfce';
      else if (['anexo_nota', 'comprovante_pagamento'].includes(key) && value.name === 'anexo-ficticio.pdf' && contents === fixturePdf()) result._fixtureAttachment = true;
      else throw Error('Arquivos reais não são aceitos. Use OFX fictício, XML fictício ou anexo fictício no aviso da demonstração.');
    }
    return result;
  }
  window.fetch = async function (input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin), method = options.method || 'GET';
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) { trace(method, url.pathname, 403); throw Error('Conexões externas estão desativadas na demonstração.'); }
    try {
      if (!store) throw startupError || Error('Restaure os exemplos da demonstração.');
      const data = await bodyData(options.body), result = store.request(method, url.pathname + url.search, data, headers(options.headers));
      trace(method, url.pathname, 200);
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) { const status = error.status || 400; trace(method, url.pathname, status); return new Response(JSON.stringify({ error: error.message, existingNoteId: error.existingNoteId }), { status, headers: { 'Content-Type': 'application/json' } }); }
  };
  function saveFile(filename, contents, type) { const url = URL.createObjectURL(new Blob([contents], { type })), link = document.createElement('a'); link.href = url; link.download = filename; link.dataset.demoDownload = 'true'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function download(path) {
    try {
      if (!store) throw startupError;
      const url = new URL(path, location.origin); if (url.origin !== location.origin) throw Error('Consulta externa indisponível: os documentos são fictícios e não têm validade fiscal.');
      if (url.pathname === '/demo/documento-ficticio.pdf') return saveFile('documento-ficticio.pdf', fixturePdf(), 'application/pdf');
      const result = store.request('GET', url.pathname + url.search, {}, { 'X-Empresa-Id': company() }); trace('GET', url.pathname, 200);
      if (result.download === 'xlsx') {
        const workbook = window.DemoReports.createWorkbook(ExcelJS, result, value => window.Cartoes?.label(value) || '-');
        saveFile(result.filename, await workbook.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else if (result.download === 'text') saveFile(result.filename, result.content, result.type);
      else throw Error('Este caminho não representa uma exportação disponível.');
    } catch (error) { trace('GET', new URL(path, location.origin).pathname, error.status || 400); message(error.message, true); }
  }
  function putFixture(selector, name, contents, type) { const input = document.querySelector(selector); if (!input) return message('Abra a tela correspondente antes de preencher o arquivo fictício.', true); const transfer = new DataTransfer(); transfer.items.add(new File([contents], name, { type })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); message(`Arquivo fictício selecionado: ${name}. Confira a tela e use o botão original para importar.`); }
  function reset() { if (!confirm('Restaurar somente os exemplos desta demonstração?')) return; try { if (!store) { localStorage.removeItem(M.KEY); store = M.create(localStorage); } store.reset(); for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key?.startsWith('financeiro-demonstracao:empresa')) localStorage.removeItem(key); } sessionStorage.removeItem('financeiro-demonstracao:aba'); location.href = 'login.html'; } catch (error) { message(error.message, true); } }
  document.addEventListener('click', event => { const link = event.target.closest('a'); if (!link || link.dataset.demoDownload) return; const url = new URL(link.href, location.origin); if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/demo/') || url.origin !== location.origin) { event.preventDefault(); event.stopImmediatePropagation(); if (url.origin !== location.origin) message('Consulta externa simulada: os documentos são fictícios e não podem ser conferidos no serviço real.', true); else download(url.pathname + url.search); } }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div'); bar.id = 'demoToolbar'; bar.className = 'demo-toolbar';
    const notice = document.createElement('span'); notice.textContent = 'DEMONSTRAÇÃO • Dados fictícios • Não insira informações reais.';
    const resetButton = document.createElement('button'); resetButton.type = 'button'; resetButton.className = 'secondary-button compact-button'; resetButton.textContent = 'Restaurar demonstração'; resetButton.id = 'demoReset'; resetButton.addEventListener('click', reset);
    const info = document.createElement('span'); info.id = 'demoMessage'; info.setAttribute('aria-live', 'polite');
    bar.append(notice, resetButton);
    if (document.getElementById('loginForm')) {
      const form = document.getElementById('loginForm'); form.elements.login.value = 'admin'; form.elements.senha.value = 'demo';
      const hint = document.createElement('p'); hint.className = 'meta'; hint.textContent = 'Perfis fictícios: admin, financeiro, compras ou consulta. Senha demonstrativa: demo. Nenhuma credencial real é utilizada.'; form.insertAdjacentElement('afterend', hint);
    } else {
      for (const [label, handler] of [['OFX fictício', () => putFixture('#ofxForm input[type="file"]', 'exemplo-ofx.ofx', fixtureOfx(), 'application/x-ofx')], ['XML fictício', () => putFixture('#nfceForm input[type="file"]', 'exemplo-nfce.xml', fixtureNfce, 'application/xml')]]) { const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button compact-button'; button.textContent = label; button.addEventListener('click', handler); bar.append(button); }
      const attachment = document.createElement('button'); attachment.type = 'button'; attachment.className = 'secondary-button compact-button'; attachment.textContent = 'Anexo fictício'; attachment.addEventListener('click', () => { const field = [...document.querySelectorAll('input[type="file"]')].find(input => ['anexo_nota', 'comprovante_pagamento'].includes(input.name) && input.getClientRects().length); if (!field) return message('Abra o cadastro de nota ou um pagamento para selecionar o anexo fictício.', true); const transfer = new DataTransfer(); transfer.items.add(new File([fixturePdf()], 'anexo-ficticio.pdf', { type: 'application/pdf' })); field.files = transfer.files; field.dispatchEvent(new Event('change', { bubbles: true })); message('PDF fictício selecionado. Use o botão original do formulário para salvar.'); }); bar.append(attachment);
      const profile = document.createElement('select'); profile.setAttribute('aria-label', 'Perfil demonstrativo'); for (const role of ['admin', 'financeiro', 'compras', 'consulta']) profile.add(new Option(`Perfil: ${role}`, role)); const user = store?.getState().usuarios.find(u => u.id === store.getState().session); profile.value = user?.tipo || 'admin'; profile.addEventListener('change', async () => { try { store.request('POST', '/api/auth/login', { login: profile.value, senha: 'demo' }); location.href = 'index.html'; } catch (error) { message(error.message, true); } }); bar.append(profile);
    }
    bar.append(info); document.body.prepend(bar);
    if (startupError) message(startupError.message, true);
    const fiscal = document.getElementById('fiscalStatus'); if (fiscal) { const hint = document.createElement('p'); hint.className = 'meta'; hint.textContent = 'Busca fiscal simulada: somente documentos fictícios locais; nenhuma consulta externa é realizada.'; fiscal.parentElement.append(hint); }
  });
  window.DemoNotes = { state: () => store?.getState(), reset, requests, errors, download, request: (method, path, data, context) => { if (!store) throw startupError; return store.request(method, path, data, context); }, fixtureOfx, fixtureNfce, fixturePdf };
})();
