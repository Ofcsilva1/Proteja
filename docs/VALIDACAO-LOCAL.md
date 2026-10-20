# Verificação local e CI

Use Node 22 e npm ci --ignore-scripts, npm run check e npm test. O lockfile npm fixa dependências de desenvolvimento. Para navegador, instalar Chromium do Playwright ou definir PROTEJA_BROWSER_PATH para Edge/Chromium local.

Com Java 21, npm run test:emulator executa somente Authentication e Realtime Database no projeto fictício demo-proteja-security. Não exige login, projeto real, billing ou credenciais administrativas. O SDK real do cliente e chamadas REST exercitam as regras com dados sintéticos. Não há Functions no CI. Veja [contrato e limitações](SECURITY-SPARK.md).

A suíte visual intercepta requests externos. O gerador de regras é conferido contra o JSON versionado, e a suíte do Emulator confere as regras efetivamente carregadas no namespace de teste. O check de sintaxe não é lint ou compilação. Nenhum workflow publica recursos Firebase.
