# Contratos da demonstração

O gateway original `window.Api` permanece em uso. Um transporte local atende suas chamadas `fetch`, JSON e FormData. Downloads por links e botões originais passam pelo mesmo estado isolado. Caminhos desconhecidos produzem erro explícito; nenhuma operação ausente recebe um sucesso vazio.

| Família | Leituras | Operações e cobertura |
|---|---|---|
| `/api/auth` | `status`, `usuarios` | `login`, `logout`, criação/edição de usuário fictício; `user/authenticated`, perfil e estado ativo |
| `/api/empresas` | listagem | criar/editar/inativar/ativar; dados por empresa; inativa somente consulta |
| `/api/categorias` | catálogo por empresa | criar, renomear, inativar; catálogo histórico preservado |
| `/api/notas` | listagem filtrada, `documentos-fornecedor`, `:id` com nota/parcelas/resumo/histórico | criar/editar por FormData e `parcelas_json`, excluir, cancelar; centavos, soma, duplicatas, versões e parcelas pagas |
| `/api/notas/recorrentes` e `/recorrencias/:id` | série, notas e prévia `/remocao` | criar/editar por `ocorrencias_json`, `/remover` com snapshot e seleção; proteção de pagamentos e manutenção de nota ativa |
| `/api/parcelas/:id` | parcelas vêm nos detalhes | `/pagar`, `/estornar`, `/encargos`; motivo, data, versão e bloqueio por conciliação |
| `/api/dashboard` | indicadores, resumo, cards, vencimentos e `/projecao-mensal` | agregações por centavos, mês e situação; consulta consolidada ou por empresa |
| `/api/pagar-hoje` | data, total, quantidade, parcelas | filtro de forma; pagamentos pelo endpoint de parcelas |
| `/api/custos-fixos` | custos e competências ativas | criação com projeção mensal; `:id/encerrar` remove previsões futuras sem apagar pagamentos |
| `/api/extratos` | `/arquivos`, movimentos paginados, `:id/candidatos` | `/ofx` limitado ao exemplo, `:id/conciliar`, `/conciliar-varios`, `/criar-pagamento`, `/ignorar`, `/desconciliar`; mesma soma, empresa, pendência e data |
| `/api/recebiveis` | `/resumo`, `/movimentos`, `/movimentos/:id/debitos-transferencia` | `/bancos`, `/clientes`, `/titulos`, `/recebimentos`, `/recebimentos/vincular`, `/recebimentos/:id/desfazer`, `/criar-do-credito`, `/classificar-credito`, `/transferencias`, `/movimentos/:id/desfazer` |
| `/api/documentos-fiscais` | documentos, status explícito de simulação, `:id/xml` | `/sincronizar` usa somente fixtures locais, `:id/vincular`, `:id/ignorar`; não confirma pagamento |
| `/api/nfce-am` | documentos e `:id/xml` | importação somente do XML fictício oferecido; duplicatas não criam contas |
| `/api/historico` | filtros e itens paginados | usuário, categoria, ação, texto e datas; registro das operações locais |
| `/api/relatorios` | `/cartoes`, sete relatórios `.xlsx` | geral, período, fornecedor, dia, mensal, fluxo de caixa e cartão; filtros e ordenação originais, arquivo XLSX válido |
| `/api/recebiveis/relatorio.csv` | relatório de bancos, títulos, recebimentos, créditos e transferências | CSV com proteção de células contra fórmulas |
| `/demo/documento-ficticio.pdf` | PDF sintético válido | gerado no navegador, sem documentos reais |
| `/api/backup/*` | indisponível, com explicação específica | backup de servidor não existe nesta demonstração; restauração local é oferecida no aviso |

O comportamento das integrações de OFX/XML/certificado está explicitamente limitado aos exemplos. Os campos e botões originais permanecem visíveis. Os testes não consideram esse limite equivalente à importação ou captura real.
