# Controle financeiro — demonstração

Versão demonstrativa com as telas completas de controle de notas, parcelas, recorrências, custos fixos, bancos, contas a receber, conciliação, documentos fiscais e relatórios. Todos os registros são fictícios. Os formulários, menus, modais, filtros e estilos da interface foram preservados.

## Executar

Requer Node.js 20 ou superior. Não há dependências para instalar: o pacote de exportação de planilhas está incluído em `public/assets/vendor`, com a licença correspondente.

```sh
npm run check
npm test
npm run build
npm start
```

Abra `http://127.0.0.1:4173/login.html`. Perfis demonstrativos: `admin`, `financeiro`, `compras` e `consulta`. A senha de demonstração é `demo`; ela não é persistida. O seletor de perfil no aviso superior permite explorar os menus de cada perfil. Esse acesso representa uma simulação, sem autenticação de produção.

## Explorar as telas

Selecione uma empresa para operar. A visão consolidada permanece disponível para notas, dashboard, histórico e relatórios. Cada empresa possui notas, categorias, custos, contas bancárias, títulos e documentos próprios. Empresa inativa mantém consulta e bloqueia escrita.

Notas e recorrências usam os formulários completos. Parcelas preservam centavos, versões de edição e proteção de pagamentos. Pagamentos, estornos, juros/multa, cancelamentos, exclusões e correções de séries afetam somente os exemplos. Custos fixos projetam as próximas competências; o encerramento preserva pagamentos e remove previsões futuras.

A conciliação inclui duas contas fictícias, OFX demonstrativos, débitos conciliáveis com uma ou várias parcelas, crédito de cliente e transferência entre contas. Contas a receber permitem registro parcial, conciliação de crédito, vínculo com recebimento manual, criação a partir do crédito, classificação e reversões.

Os botões **OFX fictício**, **XML fictício** e **Anexo fictício** selecionam arquivos gerados localmente nos campos originais. Depois, use o botão original do formulário. Não são aceitos arquivos reais. Os exemplos de OFX e NFC-e já começam disponíveis; reimportá-los mostra o tratamento de duplicatas.

A consulta de NFS-e é explicitamente simulada e usa apenas documentos fictícios locais. O XML demonstrativo não tem validade fiscal e não representa um documento fiscal autorizado. Links de consulta externa informam essa limitação, sem abrir serviços reais. A vinculação fiscal não marca pagamentos.

Os relatórios usam **XLSX verdadeiro**, mantendo colunas, título, filtros, legenda de estados, totais gerais e por categoria; o relatório de cartões inclui emissão, parcela/quantidade, ordenação e subtotais quando solicitado. O relatório de recebíveis mantém CSV. O anexo demonstrativo é um PDF válido, produzido no navegador. Nenhum arquivo recebe extensão de outro formato.

## Dados e limites

O estado fica somente em `localStorage`, na chave `financeiro-demonstracao:v2:estado`. Os filtros auxiliares usam o mesmo prefixo exclusivo. **Restaurar demonstração** reinicia somente os exemplos e os filtros deste projeto; sair mantém as alterações locais. Datas iniciais são relativas ao dia da restauração. Visitantes em navegadores diferentes não compartilham alterações.

Não insira informações reais. Não há banco remoto, captura fiscal, certificado digital, conexão bancária, upload para servidor, backup administrativo ou envio de dados a terceiros. O processamento de arquivos é limitado aos exemplos fornecidos. Storage bloqueado, cheio ou inválido produz mensagem explícita. Abas simultâneas compartilham o armazenamento: para evitar sobrescrita, use uma aba por vez.

A política de conteúdo bloqueia conexões externas e scripts fora do projeto. Estilos inline permanecem permitidos porque os modais, gráficos e ajustes de posição da interface original os utilizam. Scripts inline e manipuladores inline continuam bloqueados.

## GitHub e Vercel

O build copia apenas a lista permitida de `scripts/files.json` para `dist`. Não há backend, banco, dados reais ou material operacional no projeto. Para GitHub, publique somente esta pasta. Na Vercel, use framework **Other**, comando `npm run build` e diretório de saída `dist`, conforme `vercel.json`. Nenhuma variável secreta é necessária.

O projeto não declara concessão de licença de redistribuição do código da aplicação. A licença do ExcelJS encontra-se junto ao pacote incluído.
