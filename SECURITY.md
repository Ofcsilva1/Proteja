# Segurança

## Dados sensíveis

Os registros do PROTEJA podem conter dados pessoais e informações relacionadas à violência. Mantenha o Realtime Database em modo restrito, exija autenticação e conceda acesso somente às pessoas autorizadas pela organização. Não use regras que permitam leitura ou escrita pública, nem trate a chave de configuração do Firebase no navegador como controle de acesso.

O repositório não contém as regras atuais publicadas no Firebase. Há um exemplo em database.rules.example.json, destinado a homologação, com autorização por UID e permissão de escrita. Ele não é implantado automaticamente e não comprova o estado de segurança do ambiente real. Retirar o cadastro da interface não bloqueia criação de contas pela API; é indispensável impedir que contas não autorizadas acessem o banco. Consulte [a revisão técnica](docs/SECURITY-REVIEW.md) antes de liberar dados reais.

O arquivo database.rules.lockdown.json contém um bloqueio emergencial para publicação controlada no console Firebase, antes da liberação por UID. Incorporar mudanças de código no GitHub não publica essas regras. Detalhes de configurações operacionais e possíveis incidentes devem ser tratados por canal privado.

## Relato de vulnerabilidades

Não publique dados de casos, credenciais ou detalhes exploráveis em issues públicas. Use o recurso de relatório privado de vulnerabilidades do GitHub para este repositório, se estiver habilitado, ou entre em contato com o mantenedor por um canal privado antes de divulgar o problema.


## Cargos e homologação

A proposta de autorização por cargo está documentada em [docs/RBAC.md](docs/RBAC.md). O exemplo de regras usa `access/{uid}/active` e `access/{uid}/role`; o cadastro de permissões permanece sem escrita pelo cliente. A importação da planilha grava diretamente no Realtime Database em `casos/import_{sha256}` usando a sessão autenticada; as regras devem restringir esses caminhos ao administrador. Isso evita depender de Cloud Functions (e do plano Blaze) para importar. As funções de consulta continuam exigindo implantação separada; revise custos e teste no Emulator antes de implantá-las. Estes arquivos não alteram as regras já publicadas no Firebase.
