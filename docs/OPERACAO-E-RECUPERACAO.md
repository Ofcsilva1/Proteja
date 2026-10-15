# Preparação para implantação e entrega ao TI

## O que esta versão faz

O cadastro principal salva com transação: se algum campo da ficha mudou desde que ela foi aberta, a gravação é cancelada e o rascunho permanece no formulário. Campos de agenda, pendências, dados importados e criação são preservados. Durante o envio, o formulário fica bloqueado contra novas alterações e envios duplicados. Sair da sessão invalida transações ainda pendentes.

Novos cadastros manuais e novas importações usam a mesma chave `case_{sha256}` calculada a partir do prontuário normalizado. Espaços externos, caixa e zeros à esquerda em números não criam identidades distintas; o valor original do prontuário continua salvo e exportado. A transação cria somente quando a chave está vazia. Casos existentes com chaves antigas não são movidos: antes de criar, o site também confere os registros legados. Não execute versões antigas do site em paralelo durante a homologação. O número de um caso existente fica somente para leitura na ficha; correções exigem revisão administrativa com conferência de vínculos e duplicidades.

Esta proteção garante a disputa pela mesma chave nos fluxos desta versão. Não é uma restrição global de unicidade contra clientes modificados, escrita pelo Admin SDK ou outros sistemas que escolham chaves arbitrárias. Uma garantia autoritativa para todos os escritores exige índice único e migração controlada ou um serviço de gravação. Não há migração automática nem remoção de duplicados legados.

`criadoPor` e `atualizadoPor` são metadados operacionais gravados pelo cliente. Datas ISO continuam compatíveis com as regras atuais. Esses campos não constituem trilha de auditoria inviolável: auditoria histórica confiável e horário validado no servidor continuam pendentes.

## Consulta e regras

O cargo `consulta` continua sendo somente leitura no aplicativo, com acesso ao registro completo se as regras publicadas permitirem. Esta versão não oferece mascaramento ou projeção de campos. As regras de exemplo do repositório são mais restritas: não concedem leitura de `/casos` a consulta enquanto não houver visão separada. A aprovação da PR não publica regras e não muda cargos ou faturamento.

O exemplo permite que técnicos e coordenadores atualizem casos importados existentes, mas reserva a criação de chaves legadas `import_{hash}` e de registros declarados com `origemCadastro: planilha` ao administrador. Identificador e origem, quando existentes, não são alteráveis pelo cliente. Como técnicos podem criar cadastros manuais, marcar a origem como manual não prova que não houve automação externa. O modelo não oferece um limite de quantidade por usuário nem certifica importação em lote por uma barreira de servidor.

Antes de publicar regras, testar visitantes, contas sem perfil, contas inativas, todos os cargos, criação manual, importação pelo administrador, edição de caso legado importado, identificação imutável, dados inválidos e bloqueio de exclusão. Testes locais de decisões e navegador não substituem o Emulator ou o console com contas de homologação. Não publicar o exemplo sem decidir explicitamente como tratar as contas de consulta existentes.

## Backup e restauração

O backup automático nativo do Realtime Database requer Blaze. Esta PR não habilita cobranças, serviços ou agendamento. Antes do uso real, o TI deve configurar cópias completas do banco e das regras, manter o código versionado e definir recuperação de contas e acessos. Exportações filtradas CSV/Excel/PDF não são backup completo.

Definir frequência, retenção, armazenamento restrito, responsável principal e substituto, perda máxima de dados aceitável e prazo de recuperação. Verificar o resultado das cópias e executar uma restauração em ambiente isolado antes da entrega. Registrar data do teste, responsável, resultado e contagens de casos, agenda e pendências. Nunca restaurar sobre produção para experimentar.

## Entrega ao TI

- Contas e propriedade dos projetos, repositório, infraestrutura e faturamento sob responsabilidade acordada com a instituição.
- Procedimento para criar, revogar e revisar acessos; proibição de compartilhar credenciais.
- Rotina para conferir falhas, utilização, custos, backups e recuperação; responsável e canal de incidentes.
- Responsável por correções do código e atualização de dependências, distinto da simples operação diária quando necessário.
- Homologação com dois técnicos editando o mesmo caso e com criação concorrente do mesmo número.
- Revisão de privacidade da visão de consulta, inclusive risco de identificação pela combinação de idade, datas e outros atributos.

O site ainda lê o nó de casos completo e filtra no navegador. A paginação é visual. Medir transferência, latência e volume esperado no piloto antes de prometer capacidade ou disponibilidade. Projetar consultas e indicadores separados caso o crescimento exija.

Referências: [regras do Realtime Database](https://firebase.google.com/docs/database/security/core-syntax), [backup automático](https://firebase.google.com/docs/database/backups).
