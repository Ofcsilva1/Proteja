# Agenda, atendimentos, pendências e retornos

## Agenda e atendimentos

No menu, abra **Agenda e atendimentos** e clique em **Adicionar atendimento**. Escolha um prontuário já salvo, informe o responsável e selecione a data prevista pelo calendário. Horário e observações são opcionais. Selecione o tipo e a situação e salve.

A área **Buscar atendimentos registrados** serve somente para consulta. “Buscar por prontuário” seleciona um caso pelo número/nome; “Ou digitar o nº do prontuário” busca o número exato (05 encontra 5). “Data agendada a partir de” e “Data agendada até” delimitam a busca pela data prevista e não cadastram datas. Para cadastrar, use o botão destacado **Adicionar atendimento**; a descrição fica em **Descrição / relato do atendimento**, dentro do formulário que esse botão abre.

Na aba Atendimentos de um prontuário já salvo, **Adicionar atendimento** abre esse formulário diretamente com o caso selecionado. Alterações ainda não salvas no prontuário exigem confirmação antes de sair. Os filtros das outras telas não são apagados por esse atalho.

A agenda é uma lista cronológica paginada, com filtros por prontuário, número exato, responsável, situação, período e intervalo de datas. A referência de hoje usa o horário da Bahia. O período Hoje e próximos 6 dias abrange sete datas de calendário, incluindo hoje. O intervalo de datas considera a data prevista do atendimento, inclusive para itens realizados.

As situações são Agendado, Realizado, Não compareceu e Cancelado. Para registrar um resultado, abra **Editar / registrar resultado**. Ao marcar Realizado, informe também a data real de realização; ela fica separada da data prevista. Datas passadas em itens agendados geram um aviso de conferência, sem presumir falta ou realização.

## Pendências e retornos

Abra **Pendências e retornos** e clique em **Adicionar pendência**. Escolha um prontuário, descreva a ação e informe o responsável. O prazo é opcional. Selecione o tipo (documento, retorno de encaminhamento, contato com responsável ou outra), prioridade e situação.

As situações são Aberta, Em andamento, Concluída e Cancelada. Uma pendência aberta/em andamento com prazo anterior a hoje aparece como atrasada. Marcar Concluída exige a data real da conclusão. Prioridade alta é uma escolha explícita da equipe; o sistema não deduz prioridade clínica de relatos ou tipos de violência.

Os filtros incluem Hoje, sete dias incluindo hoje, Atrasadas e Sem prazo. De/Até considera o prazo. Itens concluídos/cancelados permanecem consultáveis. Reabrir um item limpa a data de conclusão na nova versão; não altera sua criação nem o prazo. Para consultar a seleção completa, use **Limpar filtros**.

## Prontuário e histórico anterior

Na lista de casos, a coluna Atendimento mostra um resumo e **Ver agenda** abre a agenda daquele prontuário. Ao editar um caso, a aba Atendimentos também oferece atalhos para sua agenda e pendências. Salve um novo prontuário antes de adicionar itens vinculados.

Datas misturadas a relatos no campo anterior, históricos importados e textos de pendências/retornos são preservados. Eles continuam disponíveis no cadastro/detalhes e, selecionando o prontuário na nova tela, em **Histórico e anotações anteriores do prontuário**. Os textos não são transformados automaticamente em eventos, faltas, responsáveis ou tarefas. Consulte a fonte, confirme a data e registre um item estruturado quando necessário.

Selecionar um resultado ou mudar filtros não modifica registros. Uma edição de agenda/pendência não transfere o item para outro prontuário. Cancelar altera a situação e mantém o registro, sem excluí-lo.

## Exportação e apresentação

Em **Controle de Casos → Colunas**, selecione **Agenda e atendimentos registrados** e **Pendências e retornos registrados** para incluir os novos dados em CSV, Excel ou PDF. As exportações seguem os filtros/ordem da lista de casos e incluem os itens registrados desses prontuários. Os filtros da agenda/pendências são independentes dos filtros da lista de casos; não restringem essas colunas de exportação.

A coluna anterior de Atendimentos mantém o conteúdo histórico original e as 13 colunas padrão permanecem iguais. Relatos extensos podem exigir páginas adicionais no PDF. O aplicativo renderiza conteúdo como texto e mantém as proteções de exportação existentes.

Os cartões do controle de casos destacam em verde, brevemente, valores que mudaram após filtros. A preferência do navegador por movimento reduzido desativa essa animação.

## Permissões, falhas e edição simultânea

As novas telas usam as mesmas contas e permissões dos prontuários. Contas de consulta podem visualizar; criação/edição exige `access/{uid}/active` e `canWrite` verdadeiros. O site verifica a autorização antes de enviar e o Firebase continua responsável por aplicar suas regras publicadas.

Durante a gravação, o formulário fica bloqueado para evitar envio duplicado. Falhas preservam o rascunho para tentar novamente. Duas edições do mesmo item usam comparação com a versão completa que foi aberta: se outra pessoa salvou primeiro, a edição antiga é recusada, sem substituir a atualização. Feche, reabra e confira antes de salvar novamente.

Há confirmação ao descartar rascunhos ou navegar para outra tela com mudanças no prontuário ainda não salvas. Sair limpa os dados, filtros e formulários da sessão. Uma requisição já enviada pode concluir no servidor; não feche a página durante uma gravação. O aplicativo não promete desfazer uma gravação confirmada ao encerrar a sessão.

## Modelo técnico e implantação

Os arquivos novos são `workflow-core.js` e `workflow-ui.js`. Atualize todos os arquivos estáticos da alteração na hospedagem HTTPS. O site não exige compilação.

Cada item ocupa um campo independente do prontuário: `casos/{caseId}/agenda_{uuid}` ou `casos/{caseId}/pendencia_{uuid}`. O valor é uma string JSON versionada, de até 20.000 caracteres, compatível com a validação genérica de strings do modelo de regras existente. Os campos conhecidos têm limites adicionais na interface: responsável até 120, descrição até 240 e observação até 4.000 caracteres. Não há um único bloco compartilhado que precise substituir a agenda inteira.

Gravações usam transação somente no campo do item, preservando os demais campos, histórico, importação e outros itens do prontuário. UUIDs e comparação de versão evitam colisão e sobrescrita entre edições. Campos desconhecidos de um item compatível são preservados. Itens inválidos/versões incompatíveis geram aviso e não são apagados automaticamente.

Não há migração automática, exclusão, publicação de regras, alteração de permissões ou troca de plano. A compatibilidade descrita é com `database.rules.example.json`; compare as regras realmente publicadas no ambiente antes de homologar. Registros legados que não atendam aos campos obrigatórios/regras do caso podem impedir uma gravação e precisam ser conferidos, sem afrouxar o controle de acesso.

Datas são strings de calendário ISO, horários são locais e metadados de operação usam timestamps ISO. Os metadados de criação/atualização e UID são produzidos pelo cliente; ajudam a operação e concorrência, mas não substituem auditoria confiável do servidor. Profissionais com permissão de escrita continuam podendo editar os prontuários compartilhados da instituição, conforme as regras existentes. Não há isolamento adicional por técnico.

O aplicativo já recebe todos os casos pelo listener existente. As novas telas usam esses dados e paginam a apresentação; não reduzem o volume transferido do banco. Antes de expandir para grande volume, avaliar consulta e paginação no servidor, regras específicas e trilha de auditoria com uma migração aprovada separadamente.

## Validação

Execute `pnpm test` conforme o README. Os testes usam dados fictícios e Firebase simulado: validam datas, situações, prazos, metadados/revisões, comparação de versão, filtros, preservação do texto antigo, gravação, falha/retry, readonly/revogação, limpeza ao sair, proteção do rascunho e movimento reduzido. Eles não comprovam as regras reais do Firebase. A homologação operacional deve começar com prontuários fictícios e backup protegido.
