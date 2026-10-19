# Verificação local e CI

Use Node 22 e `npm ci --ignore-scripts`, seguido de `npm run check` e `npm test`. O `package-lock.json` fixa a árvore npm para essa sequência. O lock pnpm anterior foi preservado para usuários dessa ferramenta; a configuração do CI usa npm.

A suíte de interface precisa de navegador: `npx --no-install playwright install chromium`. Alternativamente, `PROTEJA_BROWSER_PATH` pode apontar para um Edge/Chromium já instalado. Todos os requests dos testes de interface são interceptados e atendidos por fixtures; não há conexão a Firebase real.

`npm run check` verifica sintaxe do JavaScript próprio, excluindo dependências e fixtures. É verificação sintática, não lint de estilo ou typecheck TypeScript. O projeto é estático, sem etapa de build ou linter configurado. Não afirmar execução dessas etapas inexistentes.

O workflow Quality tem permissões de leitura, actions fixadas por revisão e apenas instalação/verificação/testes. Não contém deploy nem usa credenciais Firebase. Sua execução hospedada depende de publicação posterior autorizada; validação local não é prova de execução no GitHub Actions.
