# Busca, ficha e pendências

## Instalação

Não houve aplicação remota. Após as migrations existentes, instalar a migration de endereços de coleta (20261109211718), a de busca/ficha (20261109213502) e depois a de pendências, nesta ordem. Não editar migrations antigas. Implantar o código somente após validar as migrations em homologação.

A busca usa paginação de 20 registros e ordenação `received_at DESC, id DESC`, sem limite de 100 cargas. Código, NF, CT-e e cliente são substrings literais. Empresa, filial e papel são verificados no banco com a sessão real. Paginação por deslocamento não promete uma fotografia imutável enquanto outros usuários incluem cargas.

A ficha lê eventos da OS e da carga, com origem e identificadores próprios. Não cria eventos ausentes nem presume embarque. Documentos continuam usando os contratos privados existentes; o portal não ganha campos ou permissões.

## Validação e ambiente

Checkout inicial eca127e, branch main. Alterações anteriores de endereços preservadas em commit próprio; README.md e docs/CADASTROS_E_GESTAO.md preexistentes permanecem fora destes commits.

logistica-lab possui nove migrations instaladas; endereços e as migrations desta entrega não estão instaladas. Docker CLI/Desktop não encontrados. Portanto jornadas novas com Auth, Storage e sessões reais estão bloqueadas. Testes SQL usam PostgreSQL WASM descartável (PGlite) com identidades fictícias; não equivalem a Auth nem a concorrência entre conexões reais.
