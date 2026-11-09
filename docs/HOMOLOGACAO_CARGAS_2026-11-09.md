# Homologação das jornadas de carga — 09/11/2026

Referência inicial: `4c2a05a5bd2e6c7d581af4196c052d3becd80f64`. Repositório `Yanalmeida28/logistica-distrihub`, checkout `transportadoras-lab`, branch local `main`. Alterações preexistentes em README, CADASTROS_E_GESTAO, HOMOLOGACAO_SUPABASE e verify-homologation foram preservadas fora deste commit.

## Ambiente confirmado antes das jornadas

- Projeto isolado autorizado: `logistica-lab`, ref `cbbvmtinbgsmehthlhgn`, São Paulo, `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.018` (metadados MCP).
- Configuração local válida para esse projeto e chave pública configurada; nenhum valor de chave foi impresso. GET real de `/auth/v1/settings`: HTTP 200, sem login ou criação de conta.
- Migrations remotas, verificadas somente em leitura: `20261106192252 logistics_foundation`, `20261106192656 logistics_fk_indexes`, `20261107161022 logistics_team_access`, `20261107161027 logistics_collection_workflow`, `20261107161033 logistics_portal_chat_documents`, `20261107161040 logistics_private_storage`.
- Ausentes remotamente: `20261109045522_logistics_customer_profile.sql` e `20261109052524_logistics_direct_receiving.sql`. Catálogo confirmou ausência de `log_cargos.origin`, da RPC `log_cargos_workspace(uuid,text,jsonb)` e de `log_customers.person_type`. A ausência da migration de recebimento é bloqueadora para a jornada A e ficha nova em serviços reais; o cadastro ampliado também segue pendente.
- RLS habilitada em `log_cargos`, `log_collection_orders`, `log_documents`, `log_portal_grants`. Bucket `logistics-private-documents`: privado, limite de 5 MB. Isso confirma configuração estrutural, não autoriza afirmar que upload/download foi homologado.
- Docker CLI não localizado no PATH, e Docker Desktop/binários não encontrados nos caminhos padrão verificados. Não foi iniciada uma stack Supabase local. PostgreSQL Client Tools também não localizadas no PATH/caminhos padrão consultados; não foi feito inventário extenso de instalações personalizadas.
- Disponível localmente: PGlite descartável, Node e Chrome. Os testes SQL aplicam migrations por harness; a migration de Storage gerenciado não é substituída por estruturas permissivas. Identidades no SQL são fixtures e `auth.uid()` de teste, não JWTs reais.

Nenhuma migration foi aplicada remotamente. Nenhuma linha comercial, credencial, sessão ou objeto de Storage real foi recuperado. O projeto ERP não foi acessado.

## Matriz de evidências

“Aprovado” refere-se estritamente à camada identificada. Não equivale a aprovação de produção.

| Cenário | Resultado | Evidência / limite |
|---|---|---|
| A: chegada direta sem NF/CT-e, UUID/ator/horário no servidor, sem OS ou embarque | Aprovado — SQL local | `tests/database/direct-receiving.test.mjs`: origem direct, OS NULL, status received, evento receive_direct, ator e horário; contagem de OS inalterada. |
| A: localizar em Hoje e lista; abrir ficha | Aprovado — UI simulada após correção | `tests/overview.test.mjs` e `tests/browser/task-navigation.mjs`, 1440/390 px; interface real e endpoints servidos pelo harness HTTP sintético. |
| A: referências posteriores e received → shipped → destination → out_for_delivery → delivered | Aprovado — SQL local e UI simulada | Teste SQL verifica transições, versão, referência sem mudança física e recusa de salto para entrega; Chrome percorre as quatro confirmações e mantém referências. |
| A: portal do contato autorizado | Aprovado — SQL local | Convite/aceite, projeção da carga entregue, somente documentos compartilhados; omite ator/notas/referências internas. Não testa login real. |
| B: criar OS, atribuir, aceitar/iniciar/coletar como motorista, receber como central | Aprovado — SQL local | Teste troca identidades do harness; etapas reais via RPC. Uma coleta confirmada não vira embarque. Carga legada permanece com UUID, OS, horário e histórico originais. |
| B: ficha até entrega e portal autorizado | Aprovado — SQL local | Teste ampliado percorre as quatro etapas finais, consulta como contato distinto e verifica exatamente um collect, receive e delivered. |
| B: cadastro/atribuição/aceite em sessões reais separadas, em desktop e celular | Bloqueado | Schema remoto desatualizado para a ficha nova; não foram criadas contas ou abertas sessões reais. A cobertura SQL com troca de identidade não substitui sessões/JWTs. A UI simulada cobre navegação, OS/detalhe, ficha das duas origens, portal e perfis, não a jornada B inteira com Auth real. |
| Empresas/clientes distintos, filial não autorizada, contato sem acesso | Aprovado — SQL local | `direct-receiving.test.mjs`, `collections.test.mjs`, `collaboration.test.mjs`: owner de outra empresa, admin de outra filial, motorista sem papel administrativo e contatos não vinculados recusados. |
| Histórico e retorno após recarregar | Aprovado — local/simulado | SQL recupera eventos com autor/horário; Chrome recarrega e localiza a carga direta entregue em Hoje e ficha, mantendo versão. O serviço HTTP simulado conserva a fixture; não testa reinício do Supabase. |
| Clique repetido, retry e rollback | Aprovado — local/simulado | Chrome envia duas submissões imediatas, apenas uma solicitação de criação. SQL retorna o mesmo ID para a mesma chave, rejeita payload diferente e reverte comando/criação inválidos. |
| Concorrência entre conexões PostgreSQL independentes | Bloqueado | PGlite serializa sua conexão; chamadas sobrepostas não comprovam MVCC entre conexões independentes. Sem stack local completa e sem aplicar schema remoto. |
| Documento privado autorizado/negado/revogado | Aprovado — contratos SQL locais | Metadata preparada com recurso correto; finalize sem Storage recusado; fixture explicitamente pronta permite testar grant, projeção e revogação. Não representa upload de arquivo real. |
| Upload/finalize/download, Auth e Storage reais | Bloqueado | Apesar de Auth responder e bucket existir, a migration do recurso direto não está instalada. Teste de Storage real permanece pulado; nenhum bypass criado. |
| Layout e navegação desktop/celular | Aprovado — Chrome simulado | 1440 e 390 px, perfis owner/admin/driver/collector/client/sem acesso, listas vazias e acesso negado; sem overflow horizontal ou exceções JavaScript. Celular é emulação, não dispositivo físico. |

## Defeitos reproduzidos e corrigidos

1. **Chegada direta ausente em Hoje.** O painel consultava somente OS e seus cargos vinculados. Passou a consultar também a lista autorizada de cargas, contabilizar chegadas diretas sem duplicar OS e oferecer acesso à ficha. Empresa e filial continuam filtradas; ausência/falha do endpoint deixa aviso de resumo parcial e não mantém uma lista direta possivelmente sem autorização. O recorte é explícito: até 100 OS e até 100 cargas recentes, não o histórico total ou um filtro de data.
2. **Envio de referência durante carregamento da ficha.** Reproduzido no Chrome: formulário aparecia antes de concluir a leitura de permissões/documentos. A atualização podia ocorrer enquanto a ficha anterior ainda estava em abertura e não renderizar a nova versão. Comandos agora ficam desabilitados durante esse carregamento, e o handler recusa submissão programática prematura. `tests/freight-loading.test.mjs` controla o carregamento pendente e comprova que nenhum comando é executado antes da conclusão.

Não foram alterados banco, migrations, autenticação, regras físicas de negócio ou integrações nesta correção.

## Execuções

- `npm test`: 173 testes, 172 aprovados, zero falhas e um teste de Storage real pulado por dependência explícita do ambiente. Inclui contratos HTTP, SQL descartável, segurança, navegação, PWA e regressões.
- `node --test tests/freight-loading.test.mjs tests/overview.test.mjs`: regressões dos dois defeitos aprovadas.
- `node tests/browser/task-navigation.mjs`: Chrome real com serviço sintético, aprovado em 1440/390 px após corrigir o carregamento. Nenhuma conexão Supabase/Meta feita pelo harness de navegador.
- `git diff --check`: sem erros.

## Piloto e próximos passos

**Não há aprovação para piloto com clientes reais.** Há condições para continuar os ensaios técnicos locais com dados fictícios. Para um piloto isolado: autorizar previamente a instalação das duas migrations faltantes em homologação, preparar contas sintéticas verificadas, executar as duas jornadas com central/motorista/contatos em sessões reais separadas, validar Storage privado e revogação com arquivo real e disputar a mesma chave em conexões PostgreSQL independentes. Revisar também os locks/backfill descritos em RECEBIMENTO_DIRETO.md.

Eventos já registrados no servidor que podem alimentar futuramente avisos: `collect` (coleta confirmada), `receive` (recebimento de coleta), `receive_direct` (chegada direta), `shipped`, `destination`, `out_for_delivery` e `delivered`. `references` informa somente complemento das referências, não emissão/validação fiscal. Disparos futuros devem considerar o evento persistido após COMMIT, destinatário autorizado, consentimento e deduplicação por empresa/origem/ID de evento. Não inferir embarque a partir de coleta ou entrada, nem entrega a partir de saída para entrega.

Sem Meta, mensagens reais, alteração em produção, migration remota, push ou deploy.
