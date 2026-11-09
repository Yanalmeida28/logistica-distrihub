# Recebimento direto e ficha única da carga

Implementação local sobre `5a637a2`, exclusivamente no projeto Logística. Não modifica o ERP DistriHub, não integra fiscal/financeiro/GPS/WhatsApp e não publica nada.

## Contrato

Recebimento oferece a entrada de uma coleta confirmada, pelo contrato existente de OS, ou uma chegada direta ao balcão/armazém. Chegada direta exige filial ativa autorizada, cliente ativo da empresa (compartilhado ou da mesma filial), destino informado, volumes inteiros de 1 a 100.000 e observação. NF e CT-e são referências opcionais, sem emissão ou validação fiscal. Campos internos, origem, ator, status e horários não são aceitos do navegador.

O UUID da carga é gerado no PostgreSQL. `origin=direct` implica OS ausente e etapa inicial `received`; `origin=collection` conserva a OS real. Chegada direta nunca gera coleta, atribuição ou embarque. Referências documentais podem ser acrescentadas/corrigidas posteriormente e não mudam a etapa física.

A ficha da carga é a mesma para ambas as origens: identificador completo, cliente, filial, origem, volumes, destino, etapa, pendências de complementação, referências, próxima confirmação física, histórico interno com ator/horário e documentos/portal dessa carga. Os eventos antigos da coleta continuam sendo a fonte do histórico daquela origem. Nenhum ator legado é deduzido: `created_by` das cargas antigas permanece NULL; entradas novas registram o receptor real.

## Banco e compatibilidade

Nova migration: `20261109052524_logistics_direct_receiving.sql`. As migrations históricas não foram alteradas.

- `log_cargos`: OS opcional, origem explícita, cliente/destino/volumes, receptor, versão e referências NF/CT-e. Backfill somente de campos comprovados pela OS; UUIDs, etapas e timestamps antigos preservados. Trigger preenche os campos ao receber uma OS pelo fluxo existente.
- `log_cargo_events`: eventos de chegada direta, documentação e etapas físicas diretas. As etapas físicas de cargas de coleta continuam passando pelo contrato `log_collections`, com histórico na OS, sem duplicar o evento físico na ficha.
- `log_cargo_commands`: chave única `(company_id, request_id)`, ator, ação, payload e resposta. Repetição idêntica retorna a resposta; reutilização com conteúdo/ator/ação diferente é recusada. Criação/evento/auditoria/resposta são atômicos. Unicidade e bloqueio da chave serializam retries concorrentes. Locks de empresa são compatíveis com revogação de equipe; para cargas de coleta a ordem de locks é OS antes da carga.
- Documentos, convites e grants: mantêm o vínculo antigo à OS ou recebem `cargo_id`, com constraint XOR e FK composta de empresa/filial. Grants antigos preservados; índices únicos parciais substituem a PK que exigia OS.
- View privada `logistics_private.freight_resources`: resolve OS e cargas diretas para os fluxos existentes. Nenhum SELECT é concedido ao frontend. Funções públicas existentes mantêm assinaturas e ACLs; novos corpos usam a abstração e os mesmos controles de autorização. Upload, download e Storage continuam privados, com hash/limites/compartilhamento explícito.
- RPC nova `log_cargos_workspace`: listagem (até 100 cargas), ficha, criação direta, referências e avanço físico. Autenticação verificada, proprietário/administrativo autorizado na filial, empresa ativa e cliente compatível. RLS das novas tabelas habilitada; sem escrita direta autenticada ou acesso anon/PUBLIC. A API Node usa a sessão existente, sem chave privilegiada.

O portal permanece uma projeção restrita: status físico, destino, volumes, marcos confirmados e apenas anexos liberados individualmente. Não expõe observações internas, ator, referências fiscais internas ou histórico de alterações documentais. Revogar o acesso à carga retira também o acesso aos documentos.

## Implantação futura — não executada

1. Preparar stack Supabase isolada com Auth, Storage e as migrations anteriores. Não usar o ERP ou dados comerciais reais.
2. Comparar contratos/ACLs das funções existentes de portal e documentos com o schema da homologação; não sobrepor customizações desconhecidas.
3. Fazer backup/snapshot estrutural e de dados da homologação antes do ensaio. Aplicar a nova migration em transação, usando o proprietário de migrações autorizado. O arquivo usa `lock_timeout=5s`: se não obtiver locks, aborta integralmente; não insistir durante operações concorrentes.
4. A alteração de colunas, constraints/PK/índices e backfill requer locks, inclusive exclusivos nas tabelas alteradas. Medir tempo e volume de dados na homologação; agendar janela antes de qualquer implantação autorizada futura. Nenhum índice é criado concorrentemente dentro da transação.
5. Validar os dois tipos de carga, grants anteriores, referências, Storage privado e clientes sintéticos de empresas/filiais diferentes. Aplicar schema antes da versão do backend/frontend que o exige.
6. Não fazer downgrade destrutivo: chegadas diretas não cabem no contrato antigo que exige OS. Se houver falha antes de COMMIT, rollback integral; depois de haver dados novos, corrigir para frente ou restaurar snapshot com procedimento aprovado. Nunca converter entradas diretas em OS fictícias.

## Testes e limites

- PostgreSQL descartável PGlite: aplicação da migration após criar carga legada; conservação de dados/histórico; chegada direta sem documentos; retries idênticos e payload divergente; isolamento por empresa/filial/cliente/papel; referências posteriores sem avanço físico; transições sequenciais; avanço de carga legada; portal, compartilhamento/revogação de documento e rollback; ACLs.
- HTTP Node: autenticação, whitelist, volumes inválidos, referências opcionais e identificador de recurso exclusivo (OS ou carga).
- Chrome real, 1440 e 390 px: recebimento, ficha de ambas as origens, criação direta, cliques duplicados, referências posteriores e retorno à lista. HTTP sintético: não comprova login/Storage reais.
- Regressões existentes de coleta, portal/documentos, equipe, chat, navegação e PWA.

Pendências obrigatórias de homologação: conexões PostgreSQL independentes disputando a mesma chave/transição; revogação concorrente; upload/finalização/download com Auth e Storage reais; revisão de desempenho/locks e dispositivos físicos. PGlite serializa a conexão: os testes sobrepostos comprovam deduplicação no harness, não concorrência MVCC entre conexões. O teste de compartilhamento usa metadados de documento marcados `ready` explicitamente como fixture; não inventa um validador de Storage nem afirma validar um upload real.

Nenhuma migration remota, push ou deploy foi executado.
