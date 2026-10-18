# Demonstração isolada da Fase 1

Gere o pacote estático com Node 20 ou superior:

```sh
node preview/build-preview.mjs /caminho/separado/para/preview
```

O gerador copia a interface corrigida, substitui o SDK/configuração Firebase apenas no pacote gerado e baixa as versões das bibliotecas já utilizadas pelo sistema. Requer internet durante a geração. A demonstração usa registros fictícios e transações em memória; recarregar restaura os exemplos. Nenhuma credencial real é necessária.

Uma política CSP bloqueia conexões de dados (`connect-src 'none'`). A preferência de tema mantém o armazenamento local já existente; prontuários, sessões e rascunhos não são persistidos. Google Fonts pode carregar a fonte de apresentação. O conteúdo não inclui regras Firebase, funções administrativas ou configurações de produção.

Teste cadastro neutro, duplicidade do prontuário `5`, edição dos exemplos, agenda, pendências, validação e recarregamento com alterações. Não informe dados pessoais reais. Exportações contêm apenas os dados fictícios que estiverem na demonstração.

O adapter não valida regras publicadas, autenticação real, autorização real ou concorrência entre usuários. A demonstração não substitui os testes automatizados da aplicação.

Para verificar o pacote gerado, configure `PROTEJA_PREVIEW_DIR` com seu caminho absoluto e execute `node --test preview/smoke-test.cjs`. O teste usa Playwright e `PROTEJA_BROWSER_PATH` opcional, simula a hospedagem HTTPS localmente e bloqueia serviços externos. `PROTEJA_QA_ASSETS` opcional indica a pasta para capturas.

Publique somente a pasta gerada em um projeto de prévia separado. Não use a raiz do repositório como pacote desta demonstração.
