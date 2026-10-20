# PROTEJA — Gestão de Casos

> **Segurança no Spark:** Auth e Realtime Database com Rules autoritativas, sem Functions ou faturamento. Novas criações e edições legadas têm preparo administrativo obrigatório. Veja [contrato e limites](docs/SECURITY-SPARK.md). Esta PR não publica recursos.

Aplicação web estática para cadastro e acompanhamento de prontuários. A interface usa Firebase Authentication e Realtime Database; autorização e validação ocorrem nas Security Rules.

## Executar

Abra `index.html` por um servidor web local ou publique os arquivos estáticos em um host HTTPS. A interface não exige compilação: Firebase, Bootstrap, ícones e bibliotecas de exportação são carregados por CDN. Não há backend próprio nesta versão. Use npm ci e o lockfile versionado para testes.

Para autenticação e persistência dos casos funcionarem, o projeto Firebase configurado em `script.js` precisa estar ativo. As contas devem ser provisionadas pela administração no Firebase; não há cadastro público na interface. O login usa sessão apenas em memória: abrir/recarregar a página exige autenticar novamente, inclusive para eliminar sessões persistentes da versão antiga. A preferência de tema continua salva.

## Atualização e recuperação do acesso

A versão 20261020.spark1 usa gravações protegidas por Rules e resumo publicado manualmente para consulta. Interface, regras e preparo dos legados precisam de homologação coordenada antes de publicação. Incorporar a PR não publica recursos.

O HTML carrega script.js e o módulo de permissões atualizado com `?v=20261020.spark1`. Os módulos sem alterações preservam seus identificadores anteriores. A hospedagem precisa servir o HTML atualizado; isso não elimina todos os caches de rede. “Recarregar acesso” acrescenta uma referência nova à URL da página, sem apagar preferências ou dados.

O acesso depende também dos serviços externos de autenticação. A preparação da sessão tem limite de 15 segundos e mantém o login bloqueado se falhar; uma conclusão tardia não libera o sistema. Mensagens de falha não presumem que a internet do usuário caiu. Nenhuma senha ou prontuário é enviado ao diagnóstico.

## Dados do sistema

Os registros continuam no caminho `casos/{id}` do Realtime Database e mantêm os nomes de campo já usados pelo sistema. A interface ignora nós que não contenham `numeroProntuario`, para tolerar outros dados legados no banco.

Configure regras do Realtime Database para exigir autenticação e limitar o acesso aos usuários autorizados. A chave de configuração Firebase no frontend identifica o projeto e não substitui regras de acesso. Como os registros podem conter dados pessoais sensíveis, habilite acesso mínimo necessário e evite publicar exportações em locais compartilhados.

## Recursos

- Barra lateral branca no modo claro e logo transparente no modo noturno. O botão de aparência está disponível no login e no menu; a preferência fica salva neste navegador, independentemente do acesso ao Firebase.

- Login e saída pelo Firebase Authentication, com sessão não persistente e inicialização explícita.
- Cadastro e edição dos oito grupos de informações existentes.
- [Agenda e atendimentos e Pendências e retornos](docs/AGENDA-E-PENDENCIAS.md): duas telas no menu, registros individuais vinculados ao prontuário, calendários para datas, responsáveis, situações, prazos, filtros e edição com proteção contra conflitos. Textos anteriores são preservados para conferência, sem conversão automática. As novas informações podem ser selecionadas nas exportações. Inclua workflow-core.js e workflow-ui.js na hospedagem.
- Busca por prontuário, CRIAD, responsável, técnicos e atendimentos; filtros por mês de entrada e situação.
- Filtro de ano de entrada ao lado do mês, com Todos os anos e os anos presentes nos cadastros (mais recentes primeiro). Mês e ano podem ser combinados e valem também nas exportações. A lista de anos se atualiza com os dados do banco, sem depender dos filtros; preserva a seleção enquanto o ano existir. Datas ausentes/inválidas não entram em um período específico. Ao sair, seleção e opções são limpas.
- Prontuário usa correspondência exata: 05 encontra 5, e 01 encontra 1 sem incluir 101 ou 2201. Na busca geral, entradas somente numéricas também procuram o prontuário exato; nomes e demais textos continuam com busca parcial. Os identificadores salvos e exportados não são alterados.
- Ordenação por data de entrada (mais recentes/mais antigos) ou número do prontuário (menor/maior, com ordem numérica natural). Datas ausentes ou inválidas ficam no final. A ordem vale para a lista paginada e exportações; mudar filtros ou ordem volta à primeira página. Ao sair, a ordem retorna aos mais recentes.
- Contadores, ordenação por data de entrada, paginação e visualização de detalhes.
- Resumo dos casos filtrados com prontuários, casos ativos, encerrados (com e sem proteção), suspensos e não pertencentes à competência do PROTEJA. Todos os cartões acompanham conjuntamente busca, período, situação e violência, contando cada prontuário uma vez mesmo com várias violências. Registros sem situação entram somente no total. A situação Não é competência não foi renomeada para Não adesão.
- Valores alterados nos cartões recebem um destaque verde breve; a preferência por movimento reduzido desativa a animação. Navegar com alterações não salvas no prontuário solicita confirmação antes de descartá-las.
- Campos Tipo de violência, Sexual e Outros na aba Violência, com múltiplas opções e valores personalizados preservados. As categorias seguem as colunas da planilha otimizada. Há filtros por tipo (física, psicológica, sexual etc.), subtipo sexual (abuso, importunação, exploração ou valor personalizado) e sem tipo informado. O botão Limpar filtros remove todas as seleções/buscas, restaura mais recentes e volta à primeira página.
- Casos já importados usam essas três colunas de dadosPlanilha como referência quando os campos próprios ainda não existem; não é necessário reimportar. Consultar/filtrar não grava migração no banco. Ao editar e salvar, os campos próprios são persistidos, mantendo a referência original da planilha. Uma limpeza explícita de campo é respeitada e não restaura automaticamente o valor antigo. As três colunas podem ser selecionadas nas exportações.
- [Importação da planilha otimizada](docs/IMPORTACAO.md) pelo botão **Importar planilha**, com prévia, correção de pendências, históricos vinculados, preservação das colunas originais, confirmação, relatório e retomada sem substituir casos existentes. Exige HTTPS e usuário autorizado para escrita. Inclua a pasta vendor ao atualizar a hospedagem.
- Exportação dos resultados filtrados para CSV, Excel e PDF. O botão **Colunas** permite selecionar qualquer campo do cadastro e as datas de criação/atualização. Inclui marcar todas, limpar e restaurar as 13 colunas padrão. A seleção aplicada vale para os três formatos até recarregar a página; cancelar ou pressionar Escape preserva a seleção anterior.
- O PDF usa títulos menores, margens compactas e larguras ajustadas por campo e conteúdo: prontuário, datas, cor e respostas curtas ocupam menos espaço. As colunas selecionadas são ajustadas para caber juntas sempre que suas larguras mínimas permitirem; seleções maiores continuam em páginas adicionais, repetindo o prontuário quando selecionado. Registros antigos sem um campo preenchido deixam essa célula vazia. A quantidade de linhas também pode exigir páginas adicionais.

## Validação

Há testes automatizados de login, importação, filtros, violência, agenda e pendências no diretório tests. Instale as dependências com `pnpm install --frozen-lockfile`, instale o navegador de teste com `pnpm exec playwright install chromium` e execute `pnpm test`. Opcionalmente, PROTEJA_BROWSER_PATH pode indicar um navegador Chromium/Edge já instalado.

Os testes simulam todos os serviços externos e verificam inicialização, limpeza de sessão antiga, login explícito, recarregamento, conexão lenta, erro de credenciais, saída e falha de carregamento. Eles não comprovam a segurança das regras publicadas no Firebase. Não há build do site.

## Segurança e apresentação comercial

A versão 20261015.3 protege a edição da ficha contra alterações concorrentes, preserva o rascunho em conflitos e usa uma chave compartilhada entre novos cadastros manuais e importações para evitar repetição do mesmo prontuário nos fluxos desta versão. Identificadores legados são preservados. A ficha não renumera casos existentes; correções são administrativas. Consulte [operação, limitações, backup e entrega ao TI](docs/OPERACAO-E-RECUPERACAO.md). Consulta filtrada, auditoria histórica confiável, capacidade sob carga e backup automático ainda precisam de implantação e homologação próprias.

Consulte os [critérios de segurança](docs/SECURITY-REVIEW.md) e o [caminho de comercialização](docs/COMMERCIAL-READINESS.md). As regras devem ser homologadas no console Firebase antes do uso com dados reais: incorporar este PR não modifica as regras do banco.

database.rules.lockdown.json fecha o acesso de todos os clientes sem excluir registros. database.rules.example.json propõe acesso por UID para homologação e retomada controlada. Nenhum desses arquivos é implantado automaticamente. Compare os dados legados, demais caminhos e UIDs antes de liberar o acesso.
