# Fluxo operacional de coletas e cargas

Implementação local de 7 de novembro de 2026. Não instalada no Supabase hospedado nem publicada. Não altera a demonstração em memória ou o DistriHub.

## Sequência preparada em /operacao/

1. Proprietário ou administrativo cria OS na filial autorizada, escolhendo cliente ativo dessa filial ou compartilhado na empresa, endereço, destino e volumes.
2. A central atribui manualmente motorista/coletor ativo e autorizado naquela filial, com veículo ativo, mesma filial e capacidade conhecida suficiente em volumes.
3. O responsável atribuído aceita, inicia e confirma a coleta no cliente. O proprietário não confirma em nome do funcionário.
4. Somente a central autorizada confirma recebimento físico. Nesse momento nasce a carga com status recebido; confirmar coleta não infere recebimento, embarque ou entrega.
5. A central registra, separadamente, embarque, chegada ao destino, saída para entrega e entrega. Cada avanço exige observação e a versão atual.

Coletas atribuídas ou aceitas podem ser liberadas pela central com justificativa, preservando histórico. Após início, liberação exige um fluxo de exceção futuro; não existe alteração livre de estado.

## Objetos novos

Migration `20261107152635_logistics_collection_workflow.sql`:

- `log_collection_orders`: OS, filial, cliente, volumes, responsável, veículo, status e versão.
- `log_cargos`: carga criada uma única vez ao receber a OS.
- `log_collection_events`: histórico durável com ator, horário, observação, versão e fotografia dos vínculos/status.
- `log_collection_commands`: deduplicação por empresa e request_id, ator, conteúdo e resposta persistida. Sem acesso direto dos usuários.
- `log_collections`: RPC público invoker; implementação privada definer com search_path vazio e autorização pelo banco.

Todas as tabelas possuem RLS. Usuários autenticados não escrevem diretamente nelas. Leituras diretas de OS/eventos/cargas também respeitam empresa, filial e atribuição. Clientes não recebem acesso a essas tabelas pelo portal nesta etapa. Não há service_role ou chave privilegiada no fluxo.

## Concorrência, integridade e recuperação

- Chave única de comando impede repetição da mesma confirmação. A mesma chave com outro ator ou conteúdo é recusada.
- A interface conserva a chave da ação na mesma tela para repetição após falha de rede. Não possui fila offline.
- Bloqueios de linha e versão esperada impedem atualização sobre estado antigo. Mudanças de equipe e operação coordenam bloqueios na empresa.
- Índices únicos parciais impedem duas OS ativas para o mesmo responsável ou veículo, inclusive em filiais diferentes da mesma empresa. A reserva permanece até o recebimento na central, evitando liberar capacidade enquanto a mercadoria ainda está em coleta/transporte; essa regra conservadora precisa de validação operacional antes do piloto.
- FKs compostas evitam vínculos entre empresas. Cliente compartilhado é aceito; cliente de outra filial é recusado.
- OS, carga, evento, auditoria e resposta idempotente são gravados na mesma transação. Falhas revertem integralmente a operação.
- Cada repetição revalida o acesso antes de devolver a resposta anterior. Revogação de vínculo retira leitura e operação sem renovar JWT.

## Interface e limites

O módulo é próprio da área operacional; não importa dados fictícios. Atualiza a lista a cada 15 segundos enquanto a aba está visível e sem formulário em edição. A atualização não substitui confirmação e pode ser feita manualmente. Mostra até 100 OS recentes e 1.000 eventos recentes; consultas paginadas e histórico completo dedicado permanecem pendentes.

Atribuição é manual. Não há GPS, alocação automática real, cálculo de rota, ETA, peso/cubagem, gestão de jornada ou disponibilidade externa. Capacidade em volumes não comprova capacidade física/legal do veículo. Um coletor pode ser atribuído se estiver vinculado à filial e ao veículo, sem validar habilitação ou condução legal.

Chegada ao destino é um marco registrado, sem transferir automaticamente a carga para outra filial. Transferências, ocorrências persistentes, avarias, entregas parciais, cancelamentos, prova de entrega, documentos privados, cotações integradas e portal do cliente continuam pendentes. Os botões de entrega registram confirmação manual da central, sem assinatura, foto ou GPS. Não há conexão WhatsApp/Meta ou envio de mensagens.

## Validação

Testes usam PostgreSQL embarcado descartável com identidades sintéticas. Cobrem fluxo até entrega, empresa/filial cruzada, motorista diferente, coletor, cliente compartilhado, capacidade, estado antigo, deduplicação, liberação, falha injetada e rollback. Testes HTTP usam doubles do SDK; testes de interface conferem renderização e acesso negado sem navegador real.

Tentativas simultâneas no harness são enfileiradas pela conexão PGlite; não comprovam corrida entre conexões PostgreSQL independentes. Esse teste, Auth/JWT real, gateway e navegação ponta a ponta permanecem obrigatórios antes de uso operacional.

## Próximo passo

Revisar e instalar, na ordem, as migrations locais de equipe e fluxo operacional somente no Supabase independente `logistica-lab`. Criar contas verificadas de teste de duas transportadoras e validar central/motorista em navegadores distintos, concorrência real, revogação e recuperação de falhas. Nenhuma migration foi aplicada remotamente nesta etapa.

Resultado: suíte geral com 106 testes aprovados, sem falhas ou testes ignorados. Após a revisão da reserva até o recebimento, os 15 testes do fluxo foram executados novamente com sucesso. Verificações de sintaxe e diff aprovadas.
