# Validação da demonstração

- 10 testes automatizados aprovados, incluindo centavos, parcelas, mês curto, pagamento e estorno, conciliação, isolamento por empresa, restauração e falha de armazenamento.
- Fluxos conferidos em navegador nos tamanhos de desktop e celular: 11 telas, cadastro e edição, pagamento e estorno, conciliação de débito e crédito, custos fixos e recebíveis.
- Persistência após recarregar, restauração e separação dos dados por empresa verificadas.
- Nenhuma requisição externa observada nos fluxos testados. A política de conteúdo bloqueia conexões de dados.
- Fonte e build revisados por lista de arquivos; sem bancos, anexos reais, credenciais ou configurações operacionais.

Os testes do núcleo podem ser repetidos com `npm test`. O pacote de hospedagem é criado com `npm run build`.

O ambiente é demonstrativo: dados locais, entrada sem senha e conciliação com exemplo fixo. As limitações estão descritas no README.
