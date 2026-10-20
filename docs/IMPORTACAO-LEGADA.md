# Rota legada importarCaso

A aplicação Spark não chama Functions. firebase.json e o CI não configuram nem publicam Functions. O código histórico da rota aposentada é mantido separado e só recebe teste de regressão em VM. Sua existência local não indica que esteja publicada ou consumindo recursos.

Não remover, publicar ou reativar endpoints remotos nesta PR. Inventariar consumidores em uma futura revisão autorizada. A importação atual usa uma atualização atômica no RTDB com Rules autoritativas; consulte [o contrato Spark](SECURITY-SPARK.md).
