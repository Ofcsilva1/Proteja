# Verificação local e CI

Use Node 22 e `npm ci --ignore-scripts`, seguido de `npm run check` e `npm test`. Os lockfiles npm da raiz e de functions fixam as dependências. Esta versão padroniza instalação e CI em npm e remove o lock pnpm desatualizado.

Para integração de segurança, instale Java 21, execute `npm ci --prefix functions --ignore-scripts` e `npm run test:emulator`. O comando usa exclusivamente um projeto demo e Auth/RTDB/Functions locais, sem login ou credenciais reais. Consulte [contrato e limites](SECURITY-HARDENING.md).

A suíte de interface precisa de navegador: `npx --no-install playwright install chromium`. Alternativamente, `PROTEJA_BROWSER_PATH` pode apontar para um Edge/Chromium já instalado. Todos os requests dos testes de interface são interceptados e atendidos por fixtures; não há conexão a Firebase real.

`npm run check` verifica sintaxe do JavaScript próprio, excluindo dependências e fixtures. É verificação sintática, não lint de estilo ou typecheck TypeScript. O projeto é estático, sem etapa de build ou linter configurado. Não afirmar execução dessas etapas inexistentes.

O workflow Quality tem permissões de leitura, actions fixadas por revisão e apenas instalação/verificação/testes. Não contém deploy nem usa credenciais Firebase. Sua execução hospedada depende de publicação posterior autorizada; validação local não é prova de execução no GitHub Actions.
