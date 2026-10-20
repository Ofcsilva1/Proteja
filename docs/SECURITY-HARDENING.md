# Autorização no servidor e implantação coordenada

Esta versão muda o contrato de gravação do Proteja. A PR não publica Functions, regras, frontend, permissões ou faturamento. As regras do repositório continuam sendo uma proposta até homologação e publicação autorizada.

## Contrato de acesso

| Perfil ativo | Casos completos | Gravação pelo serviço | Importação | Resumo compartilhável |
|---|---|---|---|---|
| administrador | Sim | Sim | Sim | Sim |
| coordenador / tecnico | Sim | Sim, cadastro manual limitado | Não | Sim |
| consulta | Não | Não | Não | Sim |
| sem cargo, desconhecido, inativo ou anônimo | Não | Não | Não | Não |

Clientes autenticados leem somente seu próprio `/access/{uid}`. Nenhum cliente, incluindo administrador, escreve cargos, casos ou contadores diretamente. A administração de perfis continua sendo uma operação privilegiada fora destas callables. Não há migração automática nem mudança de cargos.

`salvarCaso` e `salvarAtividade` verificam Firebase Auth e relêem `/access/{uid}` no servidor em cada chamada. O Admin SDK contorna Security Rules; por isso as Functions também validam cargo, dados e operação. A origem, autoria e timestamps de novos casos são definidos no servidor. Novos cadastros não aceitam esses campos no payload. Atualizações preservam criação, origem e campos não editáveis já armazenados. Valores legados de autoria são preservados como históricos, sem afirmar que sejam autênticos; não são reescritos por esta mudança.

## Gravações e importação

- `salvarCaso({operation:'create',data})`: cadastro manual; aceita somente campos da ficha.
- `salvarCaso({operation:'import',data})`: somente administrador ativo; permite também colunas originais e histórico da planilha. Origem é sempre definida como `planilha` pelo serviço.
- `salvarCaso({operation:'update',caseKey,expected,data})`: compara os valores anteriores dos campos enviados e preserva snapshots, atividades e metadados de criação. Prontuário não pode ser renumerado por essa rota.
- `salvarAtividade({caseKey,field,expected,value})`: valida agenda/pendência, calendário, tipo, situação e conflito. Descarta autoria, timestamps e revisão enviados pelo cliente, gerando-os a partir do estado armazenado e da identidade autenticada.
- `importarCaso` permanece aposentada e retorna erro explícito. Não reativar consumidores antigos automaticamente.

Novos registros usam a mesma identidade canônica para ficha e planilha, normalizando espaços, caixa, Unicode e zeros numéricos à esquerda. Uma transação no nó `casos` confere também os identificadores legados, impedindo nova duplicação por estas callables. Não move nem deduplica registros existentes. A transação mantém o cache ativo durante leitura e commit, para suportar instâncias novas das Functions e edições legadas.

Técnicos e coordenadores têm limite de **30 tentativas de criação manual por hora UTC**, por UID, compartilhado entre sessões e protegido no servidor. Tentativas válidas que terminam em duplicidade/conflito também podem consumir quota. Administrador/importação não usam essa quota. O valor está em `createService(..., {manualLimit:30})`; revisar com a operação antes da implantação. Não há alteração remota de limite nesta PR.

Nenhum sistema consegue deduzir que texto digitado em campos permitidos veio de uma planilha externa. Esta mudança bloqueia o importador administrativo e os campos de importação para técnicos, nega gravações diretas e limita automação da criação manual. Não equivale a impedir toda automação ou abuso distribuído por várias contas autorizadas.

Datas de negócio devem existir no calendário. Datas de auditoria são geradas pelo servidor em formato ISO. Campos desconhecidos são rejeitados nas novas solicitações; campos legados existentes são preservados. O serviço não oferece exclusão.

Uma operação já autenticada e recebida pelo serviço pode concluir após sair da interface. O logout limpa a tela e ignora respostas atrasadas; não é cancelamento de uma transação remota. Revogação bloqueia novas chamadas, inclusive com o token anterior, mas não apaga informações já recebidas pelo navegador nem garante interrupção de chamadas em andamento.

## Consulta sem casos individuais

`consultarResumo({})` retorna exclusivamente `{schema:1,casesRange:'...'}`. Para menos de dez casos, retorna `Menos de 10`; acima disso, faixas de dez como `10 a 19`. Não aceita filtros, identificadores ou campos escolhidos pelo cliente. Não retorna nomes, CPF, prontuários, datas, narrativas, categorias ou contagens pequenas exatas.

A interface de `consulta` chama somente esse serviço e não assina `/casos`. Exportação e navegação para fichas não aparecem para esse perfil. Esta é uma visão compartilhável mínima; indicadores adicionais exigem análise de privacidade. Faixas reduzem detalhamento, mas não são uma garantia matemática de anonimização contra conhecimento externo ou observações repetidas.

## Custos e limites operacionais

Implantar Cloud Functions requer plano Blaze e aprovação da instituição. A PR não ativa esse plano. Criações/edições fazem transação na coleção de casos para preservar unicidade legada; isso aumenta leitura, contenção e custo conforme o volume. O resumo também lê essa coleção no servidor. Medir em homologação antes de uso real; um índice de identidade e agregações mantidas no servidor são evoluções para escala, com migração separada.

Técnicos/coordenadores continuam lendo todos os casos da instituição. Não há política de divisão por equipe ou unidade definida nesta PR; não anunciar isolamento por caso/tenant. Os metadados protegidos melhoram autoria corrente, mas não constituem histórico imutável de todos os eventos nem auditam alterações administrativas via Admin SDK/console.

## Testes sem produção

Node 22, Java 21 e portas locais livres são necessários.

```sh
npm ci --ignore-scripts
npm ci --prefix functions --ignore-scripts
npm run check
npm test
npm run test:emulator
```

Para os testes de navegador, instalar Chromium do Playwright ou definir `PROTEJA_BROWSER_PATH` para um navegador local. O Browser plugin não estava disponível; a validação local usa a suíte Playwright existente e Edge.

`test:emulator` usa projeto `demo-proteja-security`, configuração da CLI isolada e Auth/RTDB/Functions em `127.0.0.1`. Remove credenciais de serviço e token da CLI do ambiente do processo. As chamadas de teste recusam URLs fora de loopback. Contas e registros são fictícios, tokens não são escritos no relatório, e o banco é limpo ao final. Downloads de dependências/emuladores podem acessar distribuidores públicos. Não é necessário login, projeto Firebase real ou chave privada. Resultados em `test-results/security-emulator.json` não são versionados. O workflow de CI executa a mesma suíte sem credenciais de produção.

## Sequência de implantação — exige autorização separada

1. Ler e arquivar regras publicadas, inventariar Functions e consumidores implantados, validar acesso administrativo e backup/recuperação. Comparar as regras reais com a proposta; essa leitura não foi realizada nesta implementação.
2. Homologar em projeto separado com dados sintéticos, conferir custos/Blaze, quota manual, registros legados e o conteúdo compartilhável escolhido. Revisar as contas de serviço/IAM existentes.
3. Planejar uma janela sem gravações e invalidar clientes antigos. Publicar somente de forma coordenada as Functions, as regras que negam escrita direta e o frontend novo. Publicar só a interface deixa escritores diretos ativos; publicar só as regras interrompe gravações dos clientes antigos.
4. Repetir controles negativos e fluxos legítimos no ambiente autorizado. Confirmar que consulta não recebe dados brutos e que clientes antigos falham de forma segura.
5. Se houver falha, interromper gravações e corrigir ou reverter o conjunto aprovado de frontend/Functions mantendo o bloqueio de escrita direta. Restaurar regras permissivas reabre as falhas; eventual reversão de regras precisa de decisão explícita. Não restaurar dados para experimentar.

Não há comando de deploy, alteração de regras publicadas, modificação de IAM nem migração no CI ou na execução dos testes.
