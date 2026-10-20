# Segurança do Proteja no plano Spark

Esta versão usa somente Firebase Authentication por e-mail/senha, Realtime Database e Security Rules. Os testes usam Auth e RTDB Emulator. Não há Functions no aplicativo, na configuração Firebase ou no CI; não existe ativação de faturamento, contratação de plano ou publicação nesta PR. A pasta histórica functions mantém somente a rota aposentada, não configurada para implantação.

## Autoridade de segurança

O cliente prepara requisições; as regras no servidor decidem se cada leitura e escrita é permitida. Alterar JavaScript, chamar REST ou trocar campos não remove as verificações. As regras são geradas por scripts/build-rules.mjs; o JSON versionado deve corresponder exatamente ao gerador e é testado no Emulator. O teste de interface não comprova segurança.

| Cargo ativo | Casos, atividades e arquivo privado | Cadastro manual | Importação explícita | Visão compartilhável |
|---|---|---|---|---|
| administrador | Sim | Sim | Sim | Lê e publica |
| coordenador / tecnico | Sim | Até 30 criações por hora UTC e UID | Não | Lê |
| consulta | Não | Não | Não | Somente lê publicação revisada |
| sem cargo, desconhecido, inativo ou anônimo | Não | Não | Não | Não |

O cliente lê somente seu próprio perfil. Ninguém, nem administrador pelo SDK cliente, pode alterar cargos, readiness ou arquivo protegido. Essas operações continuam administrativas, fora dos fluxos do aplicativo. As regras consultam /access/{uid}/active e role em cada operação; alterações combinadas de cargo e dados não concedem privilégios. Técnicos ainda leem todos os casos da instituição; isolamento por equipe/unidade não foi definido nem implementado.

## Autoria, timestamps e calendário

Novas gravações usam auditoria estruturada: schema, criacaoVerificada, criadoPor, criadoEmMs, atualizadoPor, atualizadoEmMs e revisao. As regras exigem UID autenticado, incremento unitário da revisão e timestamps numéricos iguais ao now do servidor. O SDK envia serverTimestamp(), mas a proteção está na comparação obrigatória das regras. O cliente não escolhe outra autoria, horário passado/futuro ou revisão arbitrária.

Criação não pode ser reescrita ou removida. Campos ISO antigos de auditoria ficam preservados como evidência legada, sem certificar sua autenticidade. Na primeira edição autorizada de um caso legado, a auditoria nova marca criacaoVerificada false, criadoPor desconhecido e criadoEmMs zero; registra somente o atualizador e horário atuais como verificados.

Datas novas de negócio são validadas no calendário, incluindo meses de 30/31 dias e anos bissextos, nas regras. Valores legados inválidos podem permanecer inalterados nas regras para evitar falsificação retroativa; a interface pode exigir sua correção ao editar. Nunca anunciar que todos os dados antigos foram saneados.

## Importação, unicidade e quota

Origem é obrigatória. Técnicos/coordenadores só criam manual. Campos dadosPlanilha, historicoPlanilha e origemImportacao só podem nascer em uma importação por administrador e não são alteráveis ou removíveis depois. Origem de um registro existente é preservada; origem ausente em caso antigo passa a legado. Não existe callable nem upload para um serviço pago.

Texto nos campos manuais não revela sua origem externa. Esta versão bloqueia a operação administrativa e seus campos para técnicos e limita a quantidade de criações; não consegue provar que alguém não copiou texto de uma planilha. Também não impede abuso distribuído entre várias contas autorizadas.

Toda criação exige um índice único em identidades/{identidade} apontando para o caso. As regras verificam a ligação nos dois sentidos na mesma atualização atômica. Números com zeros à esquerda compartilham identidade, e letras usam maiúsculas; as regras validam o prefixo numérico em vez de confiar em um hash calculado no navegador. Novos prontuários aceitam letras ASCII, números, hífen e sublinhado, até 100 caracteres. Identificadores legados continuam salvos com sua grafia original; os incompatíveis exigem revisão no preparo. Hash na chave é convenção do cliente, não a garantia de unicidade.

Técnicos/coordenadores também precisam consumir uma das 30 posições de cotasManuais/{uid}/{inicioDaHora}/{slot}, com slots 0 a 29. Ticket e caso nascem juntos; cada ticket aponta para exatamente um caso. O servidor exige janela horária atual, alinhada por módulo, e mesmo UID. Tickets não podem ser reutilizados, alterados ou excluídos pelo cliente. Um lote não pode compartilhar uma posição entre dois casos. Falhas não consomem posições; registros bem-sucedidos consomem. Administradores não usam essa quota.

O horário do navegador apenas ajuda a selecionar a janela; as regras usam o horário do servidor. Relógio incorreto ou virada de hora pode causar rejeição segura e exigir nova tentativa. Contadores e arquivos consomem armazenamento Spark. Retenção exige operação administrativa separada; nunca apagar tickets da janela atual para liberar capacidade.

## Preparo obrigatório dos legados

Novas criações ficam negadas enquanto securityPolicy/identityRegistryReady não for true. Uma edição sem auditoria v2 exige também securityPolicy/editableCases/{caseId} true e uma cópia em legadoProtegido/{caseId}. Essas flags não são liberadas pelo site. Isso evita apresentar um índice parcial como garantia de unicidade ou certificar metadados históricos.

scripts/prepare-legacy.mjs prepara um artefato offline para revisão, sem SDK, credenciais, rede ou escrita em banco:

```sh
node scripts/prepare-legacy.mjs copia-local-revisada.json preparo-novo.json
```

O comando não sobrescreve arquivos existentes. Detecta identidades equivalentes, índices inconsistentes e identificadores sem representação segura; não libera readiness se houver itens sem revisão. Propõe índice, cópia protegida e flags de casos revisáveis. Não substitui cópias protegidas existentes. O artefato contém dados privados se a entrada contiver; não versionar, compartilhar publicamente ou usar dados reais em testes. Nesta PR ele foi testado somente com objetos fictícios.

A aplicação desse artefato é uma operação privilegiada futura, exige revisão da instituição e autorização específica. O script não a executa. Arquivo protegido permanece somente leitura para usuários do sistema. Strings antigas de agenda e campos desconhecidos são evidência legada sem validação interna completa; a cópia protegida preserva seu conteúdo mesmo se a cópia de trabalho for alterada. Não há histórico inviolável de todas as versões, nem proteção contra um administrador com acesso direto ao console/Admin SDK.

## Agenda estruturada

Atividades novas e novas versões são objetos em atividades/{caseId}/{field}, com campos de negócio e auditoria validados separadamente. Strings JSON antigas no caso são somente a referência legada; não se aceita criar novas strings opacas para contornar regras. A interface combina as atividades estruturadas com a leitura legada, sem migrar ou apagar automaticamente a fonte antiga. Exclusão de atividades é negada.

## Consulta sem dados pessoais

Consulta não lê casos, atividades, índices ou arquivo privado. Lê somente compartilhavel/resumo: schema, faixa numérica, revisão e horário de publicação. Não há nomes, CPF, prontuários, UID de publicador, narrativas ou filtros nessa visão. Campos adicionais e texto livre são negados nas regras.

O administrador calcula a faixa a partir da coleção completa que já pode consultar e confirma a publicação manual. Faixa zero representa menos de 10; faixa um representa 10 a 19 e assim por diante. O resumo pode estar desatualizado e as regras não conferem automaticamente sua correspondência com todos os casos. A instituição revisa o conteúdo; faixas não oferecem garantia matemática de anonimização contra conhecimento externo. Sem publicação, consulta recebe uma indicação de indisponibilidade, sem tentar buscar dados brutos.

## Classificação e riscos restantes

| Controle | Classe Spark | Limite |
|---|---|---|
| Cargo ativo, autorreclassificação, autoria e horário atuais, calendário | Integralmente gratuito | Não certifica autoria humana, dados passados ou operações privilegiadas fora das regras |
| Importação exclusiva de administrador | Gratuito com limites | Não identifica a origem real de texto enviado como manual |
| Quota e unicidade | Gratuito com remodelagem | Exigem protocolo atômico, índice preparado, flags e retenção administrativa |
| Visão compartilhável | Gratuito com operação manual | Atualização/conferência não são automáticas |
| Agregação automática confiável e arquivo independente contra administradores | Infraestrutura adicional | Não implementados nem substituídos por controles visuais |

A leitura ampla por técnicos permanece explícita. Não existem isolamento multi-instituição, trilha externa imutável ou backup automático nesta PR. Respeitar limites de conexões, armazenamento e tráfego do Spark; não há upgrade automático programado.

## Validação e publicação

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:emulator
```

Node 22 e Java 21 no CI. O Emulator usa demo-proteja-security e portas de loopback 19099/19000, com configuração de CLI isolada e sem login Firebase. REST e SDK cliente real são testados com contas @example.invalid e registros fictícios. Não se inicia Functions nem se usa service account. O CI não tem deploy ou credenciais Firebase. O Browser plugin não estava disponível; a suíte de UI usa Playwright com Chromium/Edge.

Antes de qualquer publicação: obter e comparar regras realmente publicadas, revisar backup e preparo dos legados, aprovar flags e schema, testar em homologação com dados fictícios e coordenar frontend e regras. Publicar só a interface ou só regras pode interromper clientes antigos. Publicação e alterações administrativas em produção dependem de autorização separada. Nenhuma dessas ações foi executada nesta implementação.
