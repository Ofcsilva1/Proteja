# Revisão de segurança

A auditoria das regras anteriores confirmou confiança indevida em origem declarada, autoria e datas livres, além de calendário validado apenas por formato.

A correção atual é [compatível com Spark](SECURITY-SPARK.md): valida gravações com Security Rules, sem Functions. Autoria e timestamps são vinculados a UID e now; importações exigem administrador; criação exige índice atômico e técnicos consomem quota em slots protegidos. Consulta não recebe dados privados.

A validação usa REST e SDK real contra Auth/RTDB Emulator. Testes visuais não demonstram segurança. A cópia protegida conserva legados; não há certificação retroativa de autoria nem arquivo inviolável contra administradores privilegiados. Regras publicadas ainda não foram verificadas.
