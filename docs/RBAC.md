# Cargos e permissões do Proteja

Consulte [a matriz de acesso e o contrato Spark](SECURITY-SPARK.md). Contas precisam de cargo reconhecido e active true em access/{uid}. Clientes não alteram cargos nem flags administrativas.

Administrador, coordenador e técnico leem casos completos e atividades. Administrador importa; técnicos e coordenadores têm 30 criações manuais por UID/hora, validadas nas Rules. Consulta lê somente um resumo agregado publicado manualmente pelo administrador, sem casos individuais.

As regras propostas aplicam autoria, timestamps, calendário, unicidade e quota no servidor, sem Functions. Arquivo protegido e índice legados exigem preparo revisado antes de liberar as flags. Nenhuma regra foi publicada em produção.
