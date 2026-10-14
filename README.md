# PROTEJA — Gestão de Casos

Aplicação web estática para cadastro e acompanhamento de prontuários. A interface usa Firebase Authentication e Firebase Realtime Database.

## Executar

Abra `index.html` por um servidor web local ou publique os arquivos estáticos em um host HTTPS. O projeto não tem etapa de compilação nem gerenciador de pacotes: Firebase, Bootstrap, ícones e bibliotecas de exportação são carregados por CDN.

Para autenticação e persistência funcionarem, o projeto Firebase configurado em `script.js` precisa estar ativo. Cadastros criados pela tela de registro são contas Firebase Auth; controle quem pode criar usuários pelas configurações do Firebase Authentication.

## Dados

Os registros continuam no caminho `casos/{id}` do Realtime Database e mantêm os nomes de campo já usados pelo sistema. A interface ignora nós que não contenham `numeroProntuario`, para tolerar outros dados legados no banco.

Configure regras do Realtime Database para exigir autenticação e limitar o acesso aos usuários autorizados. A chave de configuração Firebase no frontend identifica o projeto e não substitui regras de acesso. Como os registros podem conter dados pessoais sensíveis, habilite acesso mínimo necessário e evite publicar exportações em locais compartilhados.

## Recursos

- Barra lateral branca no modo claro e logo transparente no modo noturno. O botão de aparência está disponível no login e no menu; a preferência fica salva neste navegador, independentemente do acesso ao Firebase.

- Login, cadastro e saída pelo Firebase Authentication.
- Cadastro e edição dos oito grupos de informações existentes.
- Busca por prontuário, CRIAD, responsável, técnicos e atendimentos; filtros por mês de entrada e situação.
- Contadores, ordenação por data de entrada, paginação e visualização de detalhes.
- Exportação dos resultados filtrados para CSV, Excel e PDF. O botão **Colunas** permite selecionar qualquer campo do cadastro e as datas de criação/atualização. Inclui marcar todas, limpar e restaurar as 13 colunas padrão. A seleção aplicada vale para os três formatos até recarregar a página; cancelar ou pressionar Escape preserva a seleção anterior.
- O PDF distribui relatórios com muitas colunas em páginas adicionais e repete o prontuário quando selecionado. Registros antigos sem um campo preenchido deixam essa célula vazia.

## Validação

Não há testes automatizados ou configuração de build neste repositório. A validação desta alteração usa verificação de sintaxe JavaScript e revisão dos identificadores/eventos entre HTML e script. O teste funcional completo depende das credenciais e regras configuradas no projeto Firebase.

