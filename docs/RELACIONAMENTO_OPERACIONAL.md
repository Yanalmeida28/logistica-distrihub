# Parte 5 — documentos privados, portal e chat

Preparação local em 7 de novembro de 2026. Nenhuma migration aplicada ao Supabase hospedado, conta criada, publicação, conexão Meta ou envio externo realizado. O DistriHub permanece intacto.

## O que foi preparado

### Portal do cliente

Proprietário ou administrativo autorizado escolhe uma OS/carga e convida o e-mail do contato. O convite dura sete dias e é aceito dentro do app pela conta com o mesmo e-mail confirmado. Não cria conta Auth nem envia e-mail automaticamente. Vínculos de funcionários não são transformados em clientes.

O contato recebe acesso somente à carga convidada, não a todas as cargas do mesmo cadastro de cliente. A projeção contém identificador, destino, volumes, etapa atual, marcos confirmados e documentos explicitamente liberados. Exclui observações operacionais, autores, endereço interno de coleta, equipe, pagamentos, despesas e chat. A central pode revogar convites e acessos por carga; a revogação também remove os compartilhamentos de documentos relacionados.

O portal usa a mesma sessão autenticada de `/operacao/`, sem seletor fictício de identidade. A lista mostra até 100 cargas recentes. O botão global Atualizar dados renova a consulta; não há notificação push no portal. Dados já exibidos no navegador não são apagados remotamente, mas novas consultas e downloads revalidam a autorização.

### Documentos privados

Arquivos PDF, PNG e JPEG de até 5 MiB, vinculados à OS e à mesma empresa/filial. O upload fica privado; cada contato precisa receber liberação individual. Um anexo não comprova pagamento, entrega ou validade fiscal.

Fluxo: preparar metadados → upload autenticado em bucket privado → finalizar após conferir metadados do objeto. Idempotência utiliza request_id, ator, carga, nome, tamanho, MIME e SHA-256. Em resultado incerto do upload, o backend compara o objeto existente antes de finalizar, sem reenviar cegamente. Preparo e finalização são auditados; Storage e PostgreSQL não formam uma transação única. Falhas podem deixar metadados pendentes ou objetos órfãos.

O bucket `logistics-private-documents` usa caminhos empresa/filial/documento. Não é público. Políticas permissivas específicas e guardas restritivas impedem que políticas genéricas de outros buckets abram esse acesso. Não se permite sobrescrever, mover ou excluir objetos pelo usuário. Revogação é lógica e bloqueia downloads futuros.

Downloads passam pelo backend e pelo SDK com JWT do próprio usuário, revalidando RLS. Não são geradas URLs públicas ou assinadas. A resposta é anexo, sem cache e com nosniff; tamanho e SHA-256 são conferidos. Arquivos já baixados não podem ser recolhidos.

Validação da assinatura inicial do arquivo não é antivírus nem prova de autenticidade. Quarentena com varredura antimalware, quotas, política de retenção e limpeza de uploads expirados/órfãos precisam ser definidas antes de documentos reais. A reserva de upload expira em 15 minutos. Não inserir arquivos reais nesta etapa.

### Chat interno

Conversas individuais central (proprietário/administrativo) ↔ motorista/coletor, na mesma filial autorizada. Somente os dois participantes ativos acessam a conversa. Outro administrativo não vê automaticamente a conversa dos colegas. Clientes não participam do chat interno. Funcionário não escolhe nem falsifica o remetente.

Mensagens de até 2.000 caracteres, persistidas com autor, horário e chave de deduplicação. Trocar conteúdo ou remetente reutilizando uma chave é recusado. Atualização por consulta a cada dez segundos com aba visível, preservando o campo em edição. Até 100 mensagens recentes; não há anexos, confirmação de leitura, edição/exclusão de mensagens, chat de grupo ou push.

## Estrutura

- `20261107154433_logistics_portal_chat_documents.sql`: convites e liberações do portal, metadados/liberações de documentos, mensagens, helpers privados e RPCs `log_portal`, `log_documents` e `log_chat`.
- `20261107154438_logistics_private_storage.sql`: bucket e políticas do Supabase Storage real; recusa instalação se o schema gerenciado estiver ausente ou se uma configuração de bucket existente divergir.
- `backend/collaboration.mjs`: upload/download, integridade e contratos de portal/chat; integrado à API autenticada.
- `operation/relations.mjs` e `operation/internal-chat.mjs`: interfaces integradas à área operacional.

As cinco tabelas novas possuem RLS e não concedem leitura/escrita direta aos usuários. RPCs públicos são SECURITY INVOKER, com implementação privada SECURITY DEFINER e search_path vazio. Auth e os vínculos atuais no banco são a fonte de autorização, sem confiança em papéis enviados pelo navegador ou em user_metadata. Nenhuma chave service_role é necessária no fluxo.

## Testes e limites de evidência

PGlite valida as migrations PostgreSQL próprias, regras de empresa/filial/contato/participante, projeção sem dados internos, revogação, ACL e deduplicação. A migration de Storage é excluída explicitamente do replay PGlite: não se cria um schema Storage substituto para fazê-la passar. Um teste comprova que sua instalação recusa a ausência do serviço gerenciado.

Testes de upload/download usam doubles do SDK; testes de renderização não substituem navegação real. A marcação de documento disponível no teste de autorização é uma fixture privilegiada, não um upload bem-sucedido. O teste de integração com Storage real fica explicitamente ignorado até existir uma stack de homologação real configurada.

Permanecem pendentes: JWT/Auth real com duas transportadoras, Storage real e metadados efetivos, RLS sobre objetos inclusive diante de políticas amplas, limites do bucket, revogação entre requisições, transferência de arquivos, concorrência entre conexões independentes e teste ponta a ponta em dois dispositivos.

Resultado local: 129 testes na suíte, sendo 128 aprovados, nenhum com falha e um explicitamente ignorado por exigir Storage real. Após a revisão de extensão/MIME dos arquivos, os 17 testes locais relacionados a documentos e autorização foram repetidos com sucesso; a integração Storage continuou ignorada. Sintaxe JavaScript e `git diff --check` aprovados.

## Próxima etapa

Instalar e homologar, após revisão, as migrations locais na ordem em `logistica-lab`, nunca no DistriHub. O projeto hospedado ainda tem somente as duas migrations iniciais registradas na documentação. Criar contas de teste verificadas de forma privada, validar equipe e coletas, depois portal/chat e por último Storage com arquivos sintéticos. Consultar advisors antes e após a instalação autorizada.

Financeiro, despesas persistentes, cobrança SaaS, emissão fiscal e WhatsApp oficial não fazem parte desta entrega. O usuário confirmou o escopo desta parte como documentos, portal e chat.
