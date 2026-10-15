# Cargos e permissões do Proteja

## Matriz proposta

| Cargo | Ler casos | Criar/editar casos | Importar planilha |
|---|---:|---:|---:|
| administrador | Sim | Sim | Sim |
| coordenador | Sim | Sim | Não |
| tecnico | Sim | Sim | Não |
| consulta | Sim | Não | Não |

Coordenador recebe a mesma permissão de criar e editar casos que técnico nesta primeira versão; a importação fica reservada ao administrador. A lista de casos continua compartilhada entre os cargos autorizados, conforme a operação descrita pela equipe.

## Cadastro do perfil

Depois de criar a conta em Firebase Authentication, use o UID da conta como chave em `access/{uid}`. Mantenha `active: true` e acrescente um campo texto `role` com um dos valores exatos acima. Exemplo estrutural:

```json
{
  "active": true,
  "role": "tecnico"
}
```

O aplicativo não oferece auto cadastro de cargos. As regras do exemplo mantêm `access/{uid}` sem escrita pelo cliente, para impedir que uma pessoa altere o próprio cargo. A concessão do perfil é feita pela administração do projeto Firebase.

## Ordem de homologação e ativação

1. Faça backup das regras atuais e registre, em canal privado, os UIDs autorizados e os cargos aprovados. Não copie casos reais para o ambiente de testes.
2. Atribua os campos `role` aos usuários ativos em uma janela de manutenção, mantendo os campos atuais até validar a migração. Contas sem perfil reconhecido ficam sem acesso.
3. Inicie Authentication, Realtime Database e Functions Emulator com o projeto de demonstração `demo-proteja`. Use apenas contas e registros fictícios.
4. Teste leitura para os quatro cargos; criação/edição para administrador, coordenador e técnico; bloqueio de escrita para consulta; bloqueio da chamada de importação para todos exceto administrador; validação de dados inválidos; e conta inativa/sem cargo.
5. O projeto usa GitHub Pages para a interface. O backend callable e as regras precisam ser implantados separadamente no Firebase antes de publicar o frontend que os chama.
6. A função Cloud Functions exige plano Blaze e vinculação de faturamento. Não faça upgrade sem revisar custos, alertas e limites. O código não faz upgrade nem implanta serviços.
7. Só depois da aprovação e dos testes, implante a função, em seguida as regras e, por último, mescle/publique a interface. Mantenha o backup disponível para reversão.

## Limite atual da importação

A interface só mostra o fluxo de importação ao administrador, mas isso não é uma barreira de segurança suficiente. Por isso, o site envia cada registro à função `importarCaso`, que confere no servidor se a conta ativa tem cargo `administrador`, valida o registro e grava com chave idempotente. Não implante o frontend sem implantar e testar a função.

## Ambiente atual

Este documento descreve uma proposta no repositório. Alterar estes arquivos ou mesclar uma branch não altera as regras, perfis, dados ou faturamento do Firebase. As regras ativas devem ser conferidas separadamente no Console Firebase.
