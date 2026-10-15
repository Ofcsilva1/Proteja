# Homologação de segurança do PROTEJA

Este documento descreve controles e critérios de liberação. Não certifica a segurança do projeto Firebase nem divulga detalhes de sua configuração operacional. O ambiente deve ser validado pelo responsável antes de usar dados reais.

## Controles no aplicativo

- Sessão apenas em memória, com novo login ao abrir/recarregar e encerramento de sessão herdada antes do acesso.
- Formulário desabilitado durante a inicialização, progresso e erros visíveis, bloqueio de requisições duplicadas.
- Limpeza de registros, formulário e filtros ao sair, interrupção da assinatura e descarte de callbacks atrasados.
- Cadastro de contas feito pela administração, sem autosserviço na interface.
- Dados renderizados como texto e exportações com proteção contra HTML/fórmulas.

Retirar o cadastro da interface não impede criação de contas pela API do Firebase. O banco deve negar casos a qualquer UID não autorizado. Desmarcar uma coluna de exportação também não é controle de acesso: quem recebeu o registro completo pode obter seus campos.

## Regras e implantação controlada

database.rules.lockdown.json bloqueia todos os clientes, inclusive usuários legítimos, sem excluir registros. Console/Admin SDK continuam sujeitos às permissões administrativas. Use somente como intervenção controlada, sem implantação automática.

database.rules.example.json é uma proposta para homologação de uma única instituição: exige access/{uid}/active igual a true e cargo administrador, coordenador ou tecnico. O campo legado canWrite não determina o acesso. Consulta não recebe leitura do nó bruto neste exemplo, embora a interface ainda suporte consulta completa se as regras ativas permitirem. Clientes não podem modificar a lista de acesso nem excluir casos. Técnicos podem atualizar casos importados existentes; a criação declarada como planilha é reservada ao administrador. A proposta não fornece isolamento entre instituições nem restrições por campo. Veja [limites da versão](OPERACAO-E-RECUPERACAO.md).

Antes de publicar qualquer modelo:

1. Comparar as regras atuais, preservar evidências e conferir os demais caminhos.
2. Validar uma lista limpa de UIDs no Authentication e provisionar autorizações administrativamente.
3. Testar visitante, conta não autorizada, leitor, editor, revogação e tentativa de elevar a própria permissão.
4. Conferir os dados legados: campos obrigatórios, datas, tipos, comprimentos e extras podem exigir ajuste do modelo.
5. Testar no Emulator ou Rules Playground antes da retomada controlada.

Os modelos não foram executados no Emulator nesta revisão nem publicados no Firebase. Incorporar o PR não altera as regras do banco.

## Controles necessários para dados reais

Homologar permissões por função/unidade/campo, auditoria confiável com data do servidor, backup e restauração, retenção, gestão de contas, MFA quando aplicável, limites de tentativas, App Check, domínios, restrições de chave, HTTPS e cabeçalhos. Não registrar conteúdo dos prontuários em logs técnicos.

Inventariar as dependências CDN e verificar vulnerabilidades/integração antes de atualizações. A configuração Firebase no navegador identifica o projeto e não é uma chave administrativa; deve ter restrições apropriadas e não ser reutilizada para outras APIs.

A instituição deve definir finalidade, base legal, acesso, retenção, responsabilidades e resposta a incidentes, considerando os dados de crianças/adolescentes e relatos sensíveis. O guia da ANPD é uma referência, não uma declaração de conformidade.

## Validação desta alteração

Os sete testes automatizados de login passaram com todas as requisições externas simuladas: inicialização, sessão herdada, login explícito, recarregamento, conexão lenta sem duplicação, erro de senha, limpeza ao sair, callbacks atrasados e falha de carregamento.

Os testes de exportação com registros fictícios passaram. O PDF com grade de 15 colunas foi renderizado e inspecionado; CSV/XLS/PDF foram lidos para verificar cabeçalhos, valores, seleção, filtros e proteções. A sintaxe JavaScript e JSON dos modelos passou. Esses testes não demonstram a segurança das regras do ambiente real.

## Referências

- [Persistência de sessão no Firebase](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [Regras do Realtime Database](https://firebase.google.com/docs/database/security)
- [Condições das regras](https://firebase.google.com/docs/database/security/rules-conditions)
- [Chaves e restrições do Firebase](https://firebase.google.com/docs/projects/api-keys)
- [Guia de segurança da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf)
