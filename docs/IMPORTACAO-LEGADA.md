# Aposentadoria da callable importarCaso

A callable legada não aceita mais gravações nesta versão do código. Ela mantém a verificação de autenticação e perfil administrador ativo, depois retorna `failed-precondition`, orientando o uso da importação de planilhas do aplicativo atualizado.

O fluxo atual em `script.js` usa `caseKey` de `case-save.js`, conferência dos registros legados e transações de criação. A callable antiga usava outro namespace e outra normalização, permitindo casos equivalentes em caminhos diferentes. Sua aposentadoria elimina esse segundo escritor sem migrar, remover ou sobrescrever registros existentes.

O endpoint foi preservado para entregar um erro explícito a consumidores antigos. Não há evidência suficiente para afirmar que não existam integrações externas. Antes de qualquer publicação autorizada, inventariar funções implantadas e consumidores, comunicar a incompatibilidade e validar a importação atual em homologação. Não remover funções remotas automaticamente.

**Limite operacional:** editar este código ou publicar o frontend não altera uma função já implantada. A situação remota continua desconhecida e nenhuma publicação foi realizada como parte da implementação local.

Validação: `node --test tests/functions-retirement.test.cjs`, com SDK substituído por fixtures em VM, cobre anônimo, perfis inativos/sem cargo administrativo, identidades equivalentes e payloads antigos/atuais. O teste assegura ausência de acesso ao caminho de casos e zero transações nessa rota. Não equivale a integração Firebase real.
