# Busca, ficha e pendências

## Instalação

Não houve aplicação remota. Após as migrations existentes, instalar a migration de endereços de coleta (20261109211718), a de busca/ficha (20261109213502) e depois a de pendências, nesta ordem. Não editar migrations antigas. Implantar o código somente após validar as migrations em homologação.

A busca usa paginação de 20 registros e ordenação `received_at DESC, id DESC`, sem limite de 100 cargas. Código, NF, CT-e e cliente são substrings literais. Empresa, filial e papel são verificados no banco com a sessão real. Paginação por deslocamento não promete uma fotografia imutável enquanto outros usuários incluem cargas.

A ficha lê eventos da OS e da carga, com origem e identificadores próprios. Não cria eventos ausentes nem presume embarque. Documentos continuam usando os contratos privados existentes; o portal não ganha campos ou permissões.

## Validação e ambiente

Checkout inicial eca127e, branch main. Alterações anteriores de endereços preservadas em commit próprio; README.md e docs/CADASTROS_E_GESTAO.md preexistentes permanecem fora destes commits.

logistica-lab possui nove migrations instaladas; endereços e as migrations desta entrega não estão instaladas. Docker CLI/Desktop não encontrados. Portanto jornadas novas com Auth, Storage e sessões reais estão bloqueadas. Testes SQL usam PostgreSQL WASM descartável (PGlite) com identidades fictícias; não equivalem a Auth nem a concorrência entre conexões reais.

## Pendências e divisão das telas

Aplicar `20261109214230_logistics_cargo_issues.sql` após a busca. Ela cria somente ocorrências, eventos e chaves de repetição do módulo de cargas, com RLS fechado nas tabelas e RPC autenticada, validação de empresa/filial/papel e identidade verificada. Não modifica funções comerciais existentes. A instalação faz locks curtos de catálogo e de referência para as FKs; `lock_timeout=5s` recusa espera prolongada. Validar previamente em homologação, especialmente em bancos com atividade.

- Hoje: mantém o recorte explícito de OS/cargas recentes e acrescenta as cinco pendências abertas mais antigas de uma fila que consulta todo o acervo autorizado, com atualização própria e ao reabrir a aba.
- Coletas: criação, atribuição e retirada. Recebimento: entrada física por coleta confirmada ou chegada direta. Avanços físicos passam pela ficha em Cargas.
- Cargas: busca paginada e ficha. Pendências: fila paginada própria, filtros por filial/situação e acesso direto à ficha.
- Documentação: uma entrada virtual por carga quando falta NF ou CT-e; completar referências retira essa entrada. O histórico é o evento real de atualização de referências. Anexar um arquivo não presume referência nem validade fiscal.
- Avaria/volumes: registro e resolução explícitos, com autor e horário do servidor, versão e chave de repetição. O responsável pode ser a central da filial ou o próprio autor; esta entrega não amplia a listagem de funcionários para atribuição arbitrária.
- Ocorrências não alteram volumes registrados nem etapa física. Históricos de ocorrências ficam na mesma ficha, em seção própria; eventos físicos e documentais da OS/carga permanecem em ordem cronológica no histórico principal.

## Evidências locais

| Cenário | Resultado e limite |
|---|---|
| Chegada direta sem NF/CT-e, referências posteriores, quatro avanços até entrega | Aprovado em SQL real no PGlite; UI em Chrome com HTTP simulado |
| OS, atribuição, aceite/coleta, recebimento e entrega | Aprovado em SQL no PGlite com troca de identidade sintética; não são sessões Auth reais |
| Carga anterior às 100 recentes, código/NF/CT-e/cliente, páginas estáveis | Aprovado em SQL com mais de 100 cargas fictícias |
| Eventos da OS na ficha, sem duplicar recebimento nem presumir embarque | Aprovado em SQL |
| Abrir/resolver ocorrência, mesma requisição repetida e rollback | Aprovado em SQL; clique repetido e resolução também no Chrome simulado |
| Outra empresa/filial, motorista, anônimo e tabelas cruas | Aprovado nas negativas SQL e no contrato HTTP autenticado simulado |
| Portal e documentos autorizados, negados e revogados | Projeção e permissões aprovadas em SQL; arquivo real/Storage bloqueado |
| Hoje/Pendências abrem a carga correta; NF preservada ao voltar | Aprovado no Chrome 1440 e 390 px com HTTP simulado |
| JWT real de central/motorista/cliente, Storage e concorrência MVCC entre conexões | Bloqueado por ambiente/migrations; não substituído por mocks permissivos |

Os testes não autorizam piloto ainda. Próximo passo: disponibilizar stack isolada com Auth/Storage e autorizar a instalação das migrations pendentes. Repetir as duas jornadas com contas fictícias em sessões separadas e testes de concorrência entre conexões. Nenhum acesso à Meta, migration remota, push ou deploy integra esta entrega.

## Uso pela atendente

Em Cargas, digitar a NF e Buscar. Abrir a ficha: conferir a etapa física e o último evento confirmado; o histórico identifica OS/Carga, autor e data. Coleta confirmada não significa embarque. Para resolver problema, acessar Pendências e Abrir ficha e tratar; completar referências documentais ou registrar a solução aplicada na ocorrência. Voltar à lista conserva os filtros, a busca e a página enquanto o workspace permanece aberto; recarregar a página inteira inicia nova consulta.

## Limites restantes

Suíte final `npm test`: 195 testes, 194 aprovados, zero falhas, um ignorado (Storage real). `node --check` nos módulos alterados e `git diff --check` aprovados. Chrome: 18 combinações de largura/perfil/estado (1440 e 390 px; proprietário, administrativo, gerente, motorista, coletor, cliente, sem acesso, vazio e negado), sem exceções JavaScript. Os fluxos novos de NF/retorno/ocorrência foram executados nos três perfis de central nas duas larguras. Dados e serviço HTTP exclusivamente simulados no navegador.

A busca por substring e a contagem total precisam de medição com volume representativo antes do piloto; nenhum índice invasivo foi criado nas tabelas antigas. Paginação estável por ordenação não oferece isolamento de snapshot entre pedidos HTTP. A fila documental representa referências faltantes, não uma revisão fiscal. A interface não cria automaticamente responsáveis nem usuários. Revogação de acesso continua sendo verificada no servidor a cada RPC.
