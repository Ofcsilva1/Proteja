# Revisão de segurança

A auditoria isolada das regras anteriores confirmou confiança em origem declarada pelo cliente, autoria e datas falsificáveis e calendário validado apenas por formato. Não houve teste em produção.

Esta versão fecha escrita direta e centraliza gravações em serviço autenticado com cargo consultado no servidor. Consulte [contrato, riscos residuais, validação no Emulator e implantação coordenada](SECURITY-HARDENING.md).

Consulta não recebe casos brutos. A visão disponível contém somente a faixa do total de casos. Autorreclassificação e reativação pelo cliente permanecem negadas. Técnicos ainda leem a coleção inteira; segmentação por equipe depende de política adicional.

Metadados legados são preservados sem certificar autoria histórica. Operações privilegiadas via console/Admin SDK continuam fora das regras. Não há histórico imutável de todas as alterações.
