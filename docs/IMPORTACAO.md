# Importar a planilha otimizada

> **Contrato Spark:** importação é exclusiva de administrador nas Rules. Caso, índice e quota quando aplicável são gravados atomicamente, sem Functions. Ver [preparo e limites](SECURITY-SPARK.md).

## Antes de começar

Use a versão otimizada com as abas **Casos**, **Histórico** e **Sem prontuário**. A aba Casos deve ter os cabeçalhos Prontuário e Entrada no PROTEJA. As abas Original, Consulta, Início, Listas e Conferência não viram novos casos. A versão antiga com Controle Geral não é aceita neste fluxo, para evitar duplicar cadastros e continuações.

Tenha autorização institucional para migrar os prontuários e uma cópia protegida da planilha. No Firebase, faça uma exportação JSON de segurança do banco antes de iniciar e guarde-a em local restrito. Não publique arquivos reais, exportações, nomes ou relatos em issues, PRs ou no repositório.

A conta deve existir no Authentication e ter `access/{uid}/active` e `canWrite` booleanos iguais a true. As regras restritas devem estar publicadas. A importação não modifica as permissões nem exige trocar o plano ou instalar funções no servidor.

## Passo a passo

1. Incorpore a alteração ao código e atualize a hospedagem com todos os arquivos, incluindo import-core.js, import-ui.js, import-worker.js e a pasta vendor. O site exige HTTPS; localhost serve para desenvolvimento. Não há compilação.
2. Entre no site com uma conta autorizada e clique em **Importar planilha**, junto às exportações.
3. Selecione a planilha otimizada `.xlsx`. O arquivo é lido localmente em um worker do navegador. Nada é gravado antes de confirmar.
4. Confira a prévia. Corrija prontuário, data de entrada e situação quando sinalizados. Não invente uma data ou número: confira a fonte com o técnico. Você também pode corrigir no Excel, salvar e selecionar novamente.
5. Marque a confirmação de conferência/backup e clique em **Confirmar importação**. Somente os registros prontos serão gravados em `casos`; os demais ficam pendentes.
6. Aguarde o resultado, baixe o relatório e confira alguns casos no site. Os registros confirmados aparecem pela assinatura normal do banco. Limpe filtros se não aparecerem.
7. Corrija as pendências e selecione a planilha novamente. Registros já existentes são ignorados; a importação não atualiza seus campos automaticamente.

## O que é preservado

- Prontuário e CPF são tratados como texto, usando a formatação salva no Excel para preservar zeros disponíveis. Zeros já perdidos no arquivo original não podem ser recuperados automaticamente.
- Datas Excel (inclusive calendário 1904), datas ISO e datas brasileiras com ano de quatro dígitos são convertidas para o formato do sistema. Datas incompletas, impossíveis ou ausentes exigem correção.
- As cinco situações conhecidas são convertidas para os valores usados pelo sistema. Situação ausente permanece ausente; valores desconhecidos exigem revisão.
- Tipo de violência, Sexual e Outros também alimentam campos próprios consultáveis/editáveis e filtros por tipo/subtipo sexual. Casos importados por versões anteriores leem essas colunas da referência original sem precisar reimportar ou gravar alterações automaticamente. Campos próprios, inclusive vazios após limpeza explícita, têm precedência sobre a referência antiga.
- Todos os cabeçalhos e valores das linhas importadas ficam em **Colunas originais da planilha**, nos detalhes do caso. Inclui campos como escolaridade, idade na admissão, tipo de violência e outras colunas sem campo próprio no formulário. São uma referência da migração, não novos campos editáveis.
- Históricos são vinculados pelo prontuário. Mês e relato alimentam o campo de atendimentos; os dados completos, com técnicos e referências de origem, ficam em **Histórico importado**.
- As colunas originais e o histórico podem ser selecionados nas exportações CSV/Excel/PDF. Conteúdo narrativo extenso pode ocupar várias páginas no PDF.
- Número, data e situação corrigidos na prévia alimentam o cadastro, preservando o conteúdo original na referência da planilha. Edições posteriores do cadastro não reescrevem essa referência histórica.
- Nome/CPF combinados só são separados quando há exatamente um CPF reconhecível. O texto original fica preservado. Não há dedução de parentesco, nomes ou dados ausentes.

## Pendências, duplicidades e interrupções

Linhas sem prontuário não geram identificadores inventados. Históricos sem cadastro correspondente são sinalizados no relatório, sem gravar vínculos presumidos. Prontuários repetidos dentro do arquivo ficam bloqueados até correção; não se escolhe silenciosamente uma linha.

A interface confere os casos para orientar a prévia. A garantia de unicidade está no índice protegido e na gravação atômica exigida pelas Rules, incluindo as identidades legadas previamente revisadas. Readiness precisa estar liberada administrativamente. A chave hash do cliente não é a garantia de segurança. Veja [contrato Spark](SECURITY-SPARK.md).

As gravações são individuais, não uma transação única de toda a planilha. **Parar após o registro atual** mantém o que foi confirmado e impede os próximos envios. Uma gravação já enviada pode concluir após solicitar a parada ou sair. Em falha, o restante não é enviado; retome selecionando o arquivo novamente. Não feche a aba durante o envio, especialmente com internet instável. O relatório discrimina resultados por aba/linha sem incluir nomes, CPF ou relatos.

## Limites e segurança

Aceita `.xlsx` de até 15 MB, com até 5.000 linhas por aba utilizada e 100 colunas. A leitura é encerrada após 45 segundos. Fórmulas/macros não são executadas: usam-se os resultados salvos no Excel. Erros de fórmula ou ausência de resultado salvo bloqueiam a linha. Abra, recalcule e salve o arquivo no Excel antes de tentar novamente.

Campos s?o validados pelo servi?o: prontuário até 100 caracteres e demais strings até 20.000. Conteúdo maior é sinalizado, nunca cortado. O modelo atual armazena as colunas originais e históricos como strings JSON, compatíveis com essas regras. Histórico maior exige ajustar o modelo de dados e as regras antes de migrar.

O arquivo inteiro não é enviado ao GitHub ou a um conversor externo. Ao confirmar, somente os registros preparados são enviados ao Firebase configurado, usando a sessão do profissional e as regras do banco. Clientes não podem alterar `access`. O controle visual não substitui regras publicadas e homologadas. A importação não certifica segurança, conformidade, backup ou disponibilidade operacional.

A versão permanece no Spark, dentro das quotas gratuitas de armazenamento, tráfego e conexões. Não usa Functions nem ativa Blaze. Anexos/imagens não são importados.

## Validação de desenvolvimento

`pnpm test` executa testes de conversão, 500 linhas fictícias, prévia, correção, duplicidades, permissões, confirmação, interrupção, retomada, limpeza ao sair e regressão do login. Firebase é simulado: os testes não gravam em produção nem comprovam as regras reais. Não há build.

O parser SheetJS Community Edition 0.20.3 é distribuído localmente em vendor com sua licença Apache 2.0; a origem oficial e o hash estão em vendor/README.md. Nenhuma planilha operacional é incluída nos testes/repositório.

## Referências técnicas

- [Leitura de arquivos SheetJS](https://docs.sheetjs.com/docs/api/parse-options/)
- [Distribuição oficial SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)
- [Transações Firebase](https://firebase.google.com/docs/database/web/read-and-write)
