# Verificação

Execute `npm run check`, `npm test` e `npm run build`. Os testes usam somente memória e dados fictícios; nenhum banco ou serviço externo é acessado.

Os testes cobrem centavos e divisão exata, datas mensais, validação de entrada, escape HTML e CSV, isolamento por empresa e armazenamento, pagamento e estorno, conciliação e restauração, limites de edição, competências duplicadas e falha de persistência.

Na interface, conferir em desktop e celular:

1. Entrar e alternar empresas; os números e listas devem mudar juntos.
2. Criar uma nota de R$ 100,01 com três parcelas e conferir a prévia.
3. Abrir detalhes, pagar, estornar e editar uma nota sem parcelas pagas.
4. Importar o exemplo OFX, conciliar o débito de R$ 1.250,00 e o crédito de R$ 2.400,00; desfazer e conferir o estado anterior.
5. Cadastrar custo fixo, lançar uma competência e tentar lançar a mesma novamente.
6. Criar título a receber, confirmar e estornar o recebimento.
7. Baixar CSV e resumo; restaurar a demo e conferir os exemplos iniciais.
8. Conferir ausência de chamadas externas e erros no console. Documentos fiscais, uploads e bancos reais estão fora da demonstração.
