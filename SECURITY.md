# Segurança

## Importação legada

A callable `importarCaso` está aposentada para escrita nesta versão. Consulte [o contrato e a transição](docs/IMPORTACAO-LEGADA.md). O aplicativo usa `salvarCaso` para gravações validadas no servidor; nenhuma função remota é alterada apenas por esta mudança de código.

## Dados sensíveis

Os registros do PROTEJA podem conter dados pessoais e informações relacionadas à violência. Mantenha o Realtime Database em modo restrito, exija autenticação e conceda acesso somente às pessoas autorizadas pela organização. Não use regras que permitam leitura ou escrita pública, nem trate a chave de configuração do Firebase no navegador como controle de acesso.

O repositório não contém as regras atuais publicadas no Firebase. Há um exemplo em database.rules.example.json, destinado a homologação, com autorização por UID e permissão de escrita. Ele não é implantado automaticamente e não comprova o estado de segurança do ambiente real. Retirar o cadastro da interface não bloqueia criação de contas pela API; é indispensável impedir que contas não autorizadas acessem o banco. Consulte [a revisão técnica](docs/SECURITY-REVIEW.md) antes de liberar dados reais.

O arquivo database.rules.lockdown.json contém um bloqueio emergencial para publicação controlada no console Firebase, antes da liberação por UID. Incorporar mudanças de código no GitHub não publica essas regras. Detalhes de configurações operacionais e possíveis incidentes devem ser tratados por canal privado.

## Relato de vulnerabilidades

Não publique dados de casos, credenciais ou detalhes exploráveis em issues públicas. Use o recurso de relatório privado de vulnerabilidades do GitHub para este repositório, se estiver habilitado, ou entre em contato com o mantenedor por um canal privado antes de divulgar o problema.


## Cargos e homologação

A autorização atual, os testes fictícios e os limites operacionais estão em [docs/SECURITY-HARDENING.md](docs/SECURITY-HARDENING.md). Gravações passam por Functions com validação no servidor; as regras propostas negam escrita direta. Consulta recebe somente resumo em faixas. A implantação exige Blaze e publicação coordenada de regras, Functions e frontend, com autorização específica. Incorporar a PR não publica recursos.
