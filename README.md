# Financeiro Demo

Demonstração interativa de controle de notas e rotina financeira, com registros inteiramente fictícios. A interface usa HTML, CSS e JavaScript, sem dependências de execução ou serviços externos.

## Executar localmente

Requer Node.js 20 ou superior. Não é necessário instalar pacotes.

```sh
npm run check
npm test
npm start
```

Abra `http://127.0.0.1:4173` e escolha **Entrar na demonstração**. A porta pode ser alterada pela variável `PORT`.

## Explorar

- Dashboard, filtros de notas, criação e edição de notas parceladas.
- Pagamentos fictícios, estornos e cancelamento de notas sem pagamentos.
- Empresas independentes, inativação para consulta e categorias por empresa.
- Custos fixos com lançamento manual de competência e proteção contra duplicação.
- Contas a receber, confirmação de recebimentos e estornos.
- Exemplo OFX com débito e crédito conciliáveis por valor; a desconciliação restaura o estado anterior.
- Relatórios CSV e resumo textual da nota, gerados no navegador.
- Histórico local das ações e restauração dos exemplos.

Todos os valores são mantidos em centavos inteiros. As datas iniciais são relativas ao dia em que os exemplos são gerados. As parcelas mensais ajustam vencimentos ao último dia válido do mês.

## Estado e limites

Os dados ficam em `localStorage`, na chave `financeiro-demo:v1`. Cada navegador possui seu próprio estado. **Restaurar demonstração** altera somente essa chave. Sair volta para a apresentação e mantém os exemplos editados.

O ambiente é público e não possui autenticação real. Não use dados pessoais, financeiros ou documentos verdadeiros. Não há envio a bancos, captura fiscal, upload de arquivos reais, backup remoto, sincronização entre dispositivos ou exportação XLSX. O OFX é um exemplo fixo e sua importação é simulada; não aceita extratos enviados pelo visitante. Armazenamento bloqueado ou cheio produz erro visível e não confirma uma alteração não salva. Abas simultâneas no mesmo navegador devem ser evitadas: a última gravação substitui o estado anterior.

## Build e publicação

```sh
npm run build
```

O build copia uma lista explícita de cinco arquivos para `dist`. Não há banco ou backend no pacote publicado.

Para GitHub, crie um repositório novo e adicione somente os arquivos deste projeto. Para Vercel, importe esse repositório; `vercel.json` configura o build `npm run build`, saída `dist` e cabeçalhos de segurança. O framework é **Other**. Não configure segredos ou integrações de produção. A política de conteúdo impede conexões da aplicação com APIs externas.

