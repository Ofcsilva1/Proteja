# Preparação para implantação e entrega ao TI

O contrato atual de gravação, consulta, custos, limites e reversão está em [SECURITY-HARDENING.md](SECURITY-HARDENING.md). O cliente chama Functions; regras negam escrita direta. Autoria e horários novos vêm do servidor. Operações já enviadas podem concluir após logout, mas respostas atrasadas não reabrem a interface.

Novos casos usam chave canônica compartilhada e checagem transacional também dos legados. Metadados e snapshots anteriores são preservados, sem migração automática. Técnicos e coordenadores têm quota de criação manual; consulta recebe somente resumo em faixas. Publicação exige Functions, regras e frontend coordenados, com plano Blaze e autorização específica.

## Backup e restauração

O backup automático nativo do Realtime Database requer Blaze. Esta PR não habilita cobranças, serviços ou agendamento. Antes do uso real, o TI deve configurar cópias completas do banco e das regras, manter o código versionado e definir recuperação de contas e acessos. Exportações filtradas CSV/Excel/PDF não são backup completo.

Definir frequência, retenção, armazenamento restrito, responsável principal e substituto, perda máxima de dados aceitável e prazo de recuperação. Verificar o resultado das cópias e executar uma restauração em ambiente isolado antes da entrega. Registrar data do teste, responsável, resultado e contagens de casos, agenda e pendências. Nunca restaurar sobre produção para experimentar.

## Entrega ao TI

- Contas e propriedade dos projetos, repositório, infraestrutura e faturamento sob responsabilidade acordada com a instituição.
- Procedimento para criar, revogar e revisar acessos; proibição de compartilhar credenciais.
- Rotina para conferir falhas, utilização, custos, backups e recuperação; responsável e canal de incidentes.
- Responsável por correções do código e atualização de dependências, distinto da simples operação diária quando necessário.
- Homologação com dois técnicos editando o mesmo caso e com criação concorrente do mesmo número.
- Revisão de privacidade da visão de consulta, inclusive risco de identificação pela combinação de idade, datas e outros atributos.

O site ainda lê o nó de casos completo e filtra no navegador. A paginação é visual. Medir transferência, latência e volume esperado no piloto antes de prometer capacidade ou disponibilidade. Projetar consultas e indicadores separados caso o crescimento exija.

Referências: [regras do Realtime Database](https://firebase.google.com/docs/database/security/core-syntax), [backup automático](https://firebase.google.com/docs/database/backups).
