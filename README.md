# PROTEJA — Gestão de Casos

Aplicação web estática para cadastro e acompanhamento de prontuários. A interface usa Firebase Authentication e Firebase Realtime Database.

## Executar

Abra `index.html` por um servidor web local ou publique os arquivos estáticos em um host HTTPS. O site não exige compilação: Firebase, Bootstrap, ícones e bibliotecas de exportação são carregados por CDN. O package.json e o pnpm-lock.yaml são usados apenas nos testes de desenvolvimento.

Para autenticação e persistência dos casos funcionarem, o projeto Firebase configurado em `script.js` precisa estar ativo. As contas devem ser provisionadas pela administração no Firebase; não há cadastro público na interface. O login usa sessão apenas em memória: abrir/recarregar a página exige autenticar novamente, inclusive para eliminar sessões persistentes da versão antiga. A preferência de tema continua salva.

## Dados

Os registros continuam no caminho `casos/{id}` do Realtime Database e mantêm os nomes de campo já usados pelo sistema. A interface ignora nós que não contenham `numeroProntuario`, para tolerar outros dados legados no banco.

Configure regras do Realtime Database para exigir autenticação e limitar o acesso aos usuários autorizados. A chave de configuração Firebase no frontend identifica o projeto e não substitui regras de acesso. Como os registros podem conter dados pessoais sensíveis, habilite acesso mínimo necessário e evite publicar exportações em locais compartilhados.

## Recursos

- Barra lateral branca no modo claro e logo transparente no modo noturno. O botão de aparência está disponível no login e no menu; a preferência fica salva neste navegador, independentemente do acesso ao Firebase.

- Login e saída pelo Firebase Authentication, com sessão não persistente e inicialização explícita.
- Cadastro e edição dos oito grupos de informações existentes.
- Busca por prontuário, CRIAD, responsável, técnicos e atendimentos; filtros por mês de entrada e situação.
- Contadores, ordenação por data de entrada, paginação e visualização de detalhes.
- Exportação dos resultados filtrados para CSV, Excel e PDF. O botão **Colunas** permite selecionar qualquer campo do cadastro e as datas de criação/atualização. Inclui marcar todas, limpar e restaurar as 13 colunas padrão. A seleção aplicada vale para os três formatos até recarregar a página; cancelar ou pressionar Escape preserva a seleção anterior.
- O PDF usa títulos menores, margens compactas e larguras ajustadas por campo e conteúdo: prontuário, datas, cor e respostas curtas ocupam menos espaço. As colunas selecionadas são ajustadas para caber juntas sempre que suas larguras mínimas permitirem; seleções maiores continuam em páginas adicionais, repetindo o prontuário quando selecionado. Registros antigos sem um campo preenchido deixam essa célula vazia. A quantidade de linhas também pode exigir páginas adicionais.

## Validação

Há sete testes automatizados de login em tests/auth-session.test.cjs. Instale as dependências com `pnpm install --frozen-lockfile`, instale o navegador de teste com `pnpm exec playwright install chromium` e execute `pnpm test`. Opcionalmente, PROTEJA_BROWSER_PATH pode indicar um navegador Chromium/Edge já instalado.

Os testes simulam todos os serviços externos e verificam inicialização, limpeza de sessão antiga, login explícito, recarregamento, conexão lenta, erro de credenciais, saída e falha de carregamento. Eles não comprovam a segurança das regras publicadas no Firebase. Não há build do site.

## Segurança e apresentação comercial

Consulte os [critérios de segurança](docs/SECURITY-REVIEW.md) e o [caminho de comercialização](docs/COMMERCIAL-READINESS.md). As regras devem ser homologadas no console Firebase antes do uso com dados reais: incorporar este PR não modifica as regras do banco.

database.rules.lockdown.json fecha o acesso de todos os clientes sem excluir registros. database.rules.example.json propõe acesso por UID para homologação e retomada controlada. Nenhum desses arquivos é implantado automaticamente. Compare os dados legados, demais caminhos e UIDs antes de liberar o acesso.

