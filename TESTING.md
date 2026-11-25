# Verificação

`npm run check` verifica a sintaxe dos scripts originais e dos adaptadores. `npm test` usa dados novos em memória, sem rede ou banco externo. `npm run build` confere a lista permitida de arquivos públicos.

Os testes cobrem os contratos efetivamente usados pela interface: autenticação `user/authenticated`, empresa/categoria, criação e edição com `parcelas_json`, versões, pagamentos/estornos, encargos, dashboard/projeção, recorrências/remoção com snapshot, custos fixos, OFX simples e agrupado, recebíveis, transferências, classificação, documentos fiscais e downloads. Também conferem rejeição de entradas inválidas, isolamento, atomicidade, restauração e falha de armazenamento.

Os relatórios são gerados e reabertos com ExcelJS. As verificações incluem arquivo ZIP/XLSX válido, cabeçalho na linha 7, células monetárias numéricas, legenda, totais, categorias e subtotais de cartões.

Roteiro visual em desktop e celular:

1. Entrar em cada perfil e conferir os menus originais e a seleção de empresa.
2. Abrir dashboard, notas, cadastro, pagar hoje, conciliação, recebíveis, custos fixos, relatórios, histórico, empresas e categorias.
3. Cadastrar R$ 100,01 com três parcelas; conferir R$ 33,33, R$ 33,33 e R$ 33,35. Editar, pagar, tentar editar parcela paga, estornar e aplicar juros/multa.
4. Criar série recorrente, editar ocorrências, abrir correção de quantidade e proteger notas pagas contra remoção.
5. Cadastrar custo fixo, conferir as competências e encerrá-lo preservando o mês atual.
6. Selecionar conta/período no OFX; conciliar uma parcela, conciliar três parcelas somando R$ 100,01, criar nota pelo débito, ignorar e desconciliar. A data de pagamento prévia deve ser mantida.
7. Registrar recebimento parcial, conciliar crédito, vincular recebimento manual, classificar, transferir e desfazer.
8. Conferir abas NFS-e/NFC-e, anexos e XML fictícios. Nenhuma consulta fiscal real deve ocorrer.
9. Clicar os botões originais de XLSX/CSV e reabrir arquivos. Conferir filtros e valores.
10. Reabrir a página, conferir persistência e restaurar somente os exemplos deste projeto. Verificar console e ausência de chamadas externas.

O diagnóstico em memória `window.DemoNotes` oferece `state()`, `requests`, `errors` e `download()`. O registro de chamadas contém somente método, caminho e status; não guarda corpos, credenciais ou conteúdo de arquivos.
