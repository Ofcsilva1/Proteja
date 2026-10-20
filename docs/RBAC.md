# Cargos e permissões do Proteja

A autorização de gravações passou para o servidor. Consulte [contrato de acesso, limites, testes e implantação](SECURITY-HARDENING.md).

Contas exigem active igual a true e cargo reconhecido em access/{uid}. Clientes não escrevem perfis. Administrador, coordenador e técnico leem casos completos; consulta acessa exclusivamente resumo em faixas, sem receber casos individuais. Anônimos, contas sem cargo, desconhecidas ou inativas não têm acesso.

Todas as gravações diretas pelo SDK/REST são negadas nas regras propostas, inclusive para administrador. Cadastros, importações, edições e atividades passam por Functions com verificação de cargo e validação. Importação é exclusiva de administrador; criação manual por técnico/coordenador tem quota de 30 tentativas por hora.

As regras publicadas continuam não verificadas; incorporar uma PR não as implanta. A versão exige implantação coordenada e Blaze para Functions, ambos fora desta mudança.
