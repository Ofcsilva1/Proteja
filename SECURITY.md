# Segurança

## Importação legada

A aplicação não chama Functions. A rota histórica importarCaso permanece aposentada e fora da configuração de implantação; ver [transição](docs/IMPORTACAO-LEGADA.md).

## Dados sensíveis

Os registros do PROTEJA podem conter dados pessoais e informações relacionadas à violência. Mantenha o Realtime Database em modo restrito, exija autenticação e conceda acesso somente às pessoas autorizadas pela organização. Não use regras que permitam leitura ou escrita pública, nem trate a chave de configuração do Firebase no navegador como controle de acesso.

O repositório não contém as regras atuais publicadas no Firebase. Há um exemplo em database.rules.example.json, destinado a homologação, com autorização por UID e permissão de escrita. Ele não é implantado automaticamente e não comprova o estado de segurança do ambiente real. Retirar o cadastro da interface não bloqueia criação de contas pela API; é indispensável impedir que contas não autorizadas acessem o banco. Consulte [a revisão técnica](docs/SECURITY-REVIEW.md) antes de liberar dados reais.

O arquivo database.rules.lockdown.json contém um bloqueio emergencial para publicação controlada no console Firebase, antes da liberação por UID. Incorporar mudanças de código no GitHub não publica essas regras. Detalhes de configurações operacionais e possíveis incidentes devem ser tratados por canal privado.

## Relato de vulnerabilidades

Não publique dados de casos, credenciais ou detalhes exploráveis em issues públicas. Use o recurso de relatório privado de vulnerabilidades do GitHub para este repositório, se estiver habilitado, ou entre em contato com o mantenedor por um canal privado antes de divulgar o problema.


## Cargos e homologação

O contrato atual é [compatível com Spark](docs/SECURITY-SPARK.md). Auth e Rules validam cargo, autoria, timestamps, calendário, importação, índice e quota. Consulta lê somente resumo revisado. Não habilitar faturamento ou publicar Functions. Publicação de regras e preparo administrativo exigem autorização separada.
