# Cargos e permissões do Proteja

## Matriz de acesso

| Cargo | Casos completos | Visão de consulta | Criar/editar | Importar |
|---|---:|---:|---:|---:|
| administrador | Sim | Sim | Sim | Sim |
| coordenador | Sim | Sim | Sim | Não |
| tecnico | Sim | Sim | Sim | Não |
| consulta | Não | Sim | Não | Não |

O perfil consulta recebe registros da coleção `consultaCasos`, que contém um código aleatório e somente: idade exata, data da última alimentação, data de entrada, Conselho Tutelar, sexo, identidade de gênero, raça/cor, escolaridade e origem do caso. Ele não recebe prontuário, nomes, CPF, relatos, categoria individual de violência, dados originais da planilha, agenda ou pendências.

Os cartões gerais e os totais por categoria de violência são calculados no servidor e retornados como contagens agregadas. O endpoint não retorna os registros usados nos cálculos nem a categoria associada a cada código de consulta.

## Cadastro do perfil

Depois de criar a conta em Firebase Authentication, use o UID como chave em `access/{uid}`. Mantenha `active: true` e acrescente um campo de texto `role` com um destes valores exatos:

```json
{
  "active": true,
  "role": "consulta"
}
```

As regras do cliente mantêm `access/{uid}` sem escrita, para impedir que a própria conta altere cargo ou estado. A administração provisiona esse registro pelo Console Firebase ou por ferramenta administrativa confiável.

## Preparar e ativar a visão

1. Faça a mudança em ambiente de homologação, com casos fictícios.
2. Implante as regras revisadas e as Cloud Functions `atualizarVisaoConsulta`, `prepararConsulta` e `obterIndicadoresConsulta` antes de disponibilizar a interface atualizada.
3. Entre com a conta administradora e use **Preparar visão de consulta** uma vez para criar as projeções dos casos existentes.
4. Cadastre um usuário de consulta e confira a tabela, os detalhes, os totais e os arquivos exportados. Confirme também que a conta não lê `/casos`, `/consultaIndex`, agenda nem tarefas.
5. Depois da preparação inicial, alterações e exclusões em `/casos` atualizam a projeção por gatilho do Realtime Database.
6. Só depois de homologar, publique a interface. A mudança neste repositório não altera sozinha o Firebase nem o site publicado.

## Importação

A importação segue restrita ao administrador. A função `importarCaso` valida o perfil no servidor e grava com uma chave idempotente. Não confie apenas em controles visuais da interface.

## Limites operacionais

`obterIndicadoresConsulta` lê os casos completos no servidor para gerar os totais. Isso impede que a conta consulta leia os registros individuais pelo SDK, mas o tempo e o custo da função crescem com a base. Se o volume aumentar, os agregados devem ser mantidos por processo confiável ou atualizados em lote, e comparados com o total calculado antes de trocar o método.

`database.rules.example.json` é um modelo versionado; sua implantação no Firebase precisa ser feita separadamente e somente após a validação dos caminhos e dos perfis. O código não publica regras nem funções.

