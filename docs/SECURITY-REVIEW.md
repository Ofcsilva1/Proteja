# Revisão de segurança — visão de consulta

Esta revisão prepara uma separação de dados por cargo para homologação. Não certifica o ambiente Firebase nem representa implantação em produção.

## Alterações propostas

- Administrador, coordenador e técnico continuam lendo `/casos` completos.
- O perfil consulta não recebe leitura de `/casos`. Lê somente `/consultaCasos`, projeção gerada no servidor com código aleatório e os campos aprovados em `docs/RBAC.md`.
- `/consultaIndex` não tem permissão de leitura ou escrita para clientes.
- Regras negam escrita cliente em `/consultaCasos`; Cloud Functions usam Admin SDK para manter a projeção.
- Os cartões e os totais de violência são calculados por callable autenticada e devolvem somente contagens agregadas.
- A interface do perfil consulta renderiza e exporta apenas a projeção. Detalhes de casos, filtros de violência, agenda, pendências e importação ficam indisponíveis.
- A função de importação continua limitada ao administrador.

## Pontos de atenção

- O administrador precisa executar **Preparar visão de consulta** uma vez após implantar as funções para criar as projeções legadas. Sem esse passo, a tabela de consulta fica vazia.
- Implantar a interface antes das regras e das funções deixa a experiência incompleta. A sequência documentada em `docs/RBAC.md` deve ser seguida.
- A função de indicadores lê todos os casos do servidor a cada solicitação. Monitorar duração e custo; para bases maiores, manter os agregados de forma incremental.
- A projeção permite idade exata e datas completas, conforme decisão do responsável. Esses dados podem permitir reidentificação quando cruzados com contexto externo; a instituição deve limitar o acesso aos usuários de consulta autorizados.
- A função de gatilho tem entrega eventual. A tabela consultiva pode levar alguns segundos para refletir uma gravação recente.
- A projeção inclui campos em texto livre aprovados (`conselhoTutelar` e `origemCaso`) com tamanho limitado. Antes do uso, confirmar que a planilha não coloca nomes, telefone ou narrativa nessas colunas.
- As regras de exemplo precisam ser comparadas com as regras ativas. O deploy deste modelo não foi executado.

## Homologação obrigatória

Usar dados fictícios no Realtime Database Emulator e cobrir os quatro cargos, conta inativa, sessão sem cargo, leitura de cada caminho, tentativas de escrita, importação, geração inicial, atualização e exclusão de projeção, indicadores agregados e exportações. Não liberar dados reais até concluir a validação e revisar os registros de auditoria.

Este conjunto de mudanças não foi publicado no Firebase ou no GitHub Pages. Nenhum teste foi executado nesta alteração.

