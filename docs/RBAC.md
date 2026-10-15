# Cargos e permissões do Proteja

## Comportamento do aplicativo

Contas precisam de `access/{uid}/active: true` e de um cargo reconhecido. Administrador, coordenador e técnico podem criar e editar casos; só o administrador pode abrir e confirmar o fluxo de importação. Consulta permite leitura e impede edição na interface. A autorização efetiva depende das regras publicadas. O campo legado `canWrite` não determina a permissão nesta versão; não use esse campo para revogar acesso. Desative `active` ou atribua o cargo adequado.

O perfil é provisionado pela administração do Firebase, após criar a conta no Authentication. Clientes não podem modificar seu perfil nas regras de exemplo. Antes de gravar, o aplicativo relê o perfil, além das verificações autoritativas do banco.

## Consulta filtrada ainda pendente

O aplicativo ainda carrega casos completos. Quem tem permissão para ler `/casos` recebe todos os campos, mesmo que não possa alterá-los. Não apresente esse cargo como acesso anonimizado. O modelo `database.rules.example.json` nega essa leitura a consulta e deve ser homologado antes de publicação; ele não é implantado pelo GitHub e pode diferir do ambiente ativo.

Permissões por cargo podem ser implementadas no Spark. Uma visão limitada precisa de dados separados e de um processo confiável de atualização; regras não removem seletivamente campos de uma leitura já autorizada no nó pai. A opção com Cloud Functions requer Blaze para implantação. A implementação da visão filtrada e a escolha dos atributos liberados permanecem etapas futuras.

## Gravação e importação

A importação grava diretamente no Realtime Database, sem chamar Cloud Functions. Novos registros usam `case_{sha256}` compartilhado pelo cadastro manual; casos legados `import_{hash}` permanecem onde estão. O modelo de regras reserva criação declarada como planilha ao administrador e permite atualização dos casos importados já existentes aos profissionais com escrita. Isso não constitui controle de volume ou prova criptográfica da origem de uma gravação manual.

Consulte [operação e recuperação](OPERACAO-E-RECUPERACAO.md) para limites de unicidade, auditoria, homologação, backup e entrega ao TI. Não é necessário implantar Functions nem ativar Blaze para aplicar as melhorias locais desta versão. Publicar regras exige validação separada e uma decisão explícita sobre o acesso dos perfis de consulta existentes.
