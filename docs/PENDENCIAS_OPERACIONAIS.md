# Pendências operacionais — logística

## Verificação atual: 09/11/2026

Consulta inicial somente de leitura ao projeto `logistica-lab` (`cbbvmtinbgsmehthlhgn`) confirmou seis migrations registradas. Após autorização explícita do usuário, as três pendentes foram instaladas, totalizando nove. O ERP DistriHub não foi acessado.

| Pendência | Situação | Próximo passo |
|---|---|---|
| Cadastro completo de clientes | Instalado; colunas conferidas | Homologar cadastro com sessão real |
| Recebimento direto e ficha única | Instalado; RPC, colunas, trigger e RLS conferidos | Homologar as duas jornadas autenticadas |
| Perfil Gerente | Banco instalado; interface e contratos SQL testados localmente | Homologar sessões e publicar código mediante orientação |
| Auth e Storage reais | Estruturas existentes, sem jornada autenticada homologada nesta tarefa | Usar contas sintéticas verificadas e sessões separadas, sem compartilhar senhas no chat |
| Concorrência real | Idempotência e rollback testados no PostgreSQL embarcado | Disputar a mesma chave em conexões PostgreSQL independentes no ambiente isolado |

## Checagem reproduzível

`tools/homologation-contract.sql` consulta somente metadados. Não recupera linhas comerciais, corpos de funções ou segredos e não altera o banco. Executar com uma conexão autorizada ao projeto de logística, nunca no ERP. O teste `tests/database/homologation-contract.test.mjs` comprova execução em transação read-only, detecção do schema anterior, reconhecimento das migrations novas e recusa de EXECUTE anônimo indevido.

A checagem é estrutural e parcial: `confirmed` não comprova login, autorização por filial, transferência de arquivo, concorrência ou equivalência integral das definições. `operational_rls` bloqueado no schema anterior inclui ausência das duas tabelas novas; não significa que as tabelas existentes estejam sem RLS. O schema Storage presente não comprova as políticas ou o funcionamento do serviço.

## Ordem de conclusão

**Etapas 1 a 3 concluídas nesta tarefa.** Os oito corpos privados anteriores corresponderam à baseline local (MD5 após remover CR); a pré-validação não encontrou vínculos de carga incompatíveis ou papéis desconhecidos. Instalações concluídas sem erro:

| Arquivo local | Versão registrada pelo conector |
|---|---|
| `20261109045522_logistics_customer_profile.sql` | `20261109135701` |
| `20261109052524_logistics_direct_receiving.sql` | `20261109135713` |
| `20261109134416_logistics_manager_role.sql` | `20261109135724` |

O conector registra seu próprio timestamp; não renomear migrations históricas nem reaplicar esses arquivos para tentar igualar números. As 14 verificações de catálogo passaram após a instalação. Novas tabelas de eventos/comandos pertencem a postgres, possuem RLS e negam SELECT direto a anon e authenticated. Sete policies de Storage e o validador privado foram preservados. A configuração Auth de proteção a senhas vazadas continua desativada e merece revisão; os nove avisos informativos de RLS sem policies correspondem às tabelas fechadas aos usuários e acessadas pelos RPCs.

`npm test`: 183 testes, 182 aprovados, zero falhas, um teste de Storage real explicitamente ignorado. A nova checagem foi testada em transação read-only e contra grant anônimo indevido. Não foram criadas contas, arquivos ou operações fictícias no serviço remoto e não houve publicação de código.

`npm run verify:homologation` também passou no serviço real após a instalação: Auth respondeu, bootstrap e seis RPCs negaram execução anônima e doze tabelas negaram leitura anônima. A primeira tentativa foi bloqueada pela rede do sandbox; a execução autorizada fora do sandbox passou. Isso não substitui login autenticado nem upload real. Sintaxe do verificador e `git diff --check` passaram.

1. Obter autorização específica para instalar as três migrations no projeto que atende o app publicado. Preservar as migrations antigas e os dados existentes.
2. Revisar integridade dos vínculos legados de carga, janela de locks e proteção de recuperação antes da instalação. A migration de recebimento faz backfill exclusivamente a partir da OS vinculada; não inventa cliente, origem ou etapa física.
3. Instalar cada migration transacionalmente, na ordem indicada; interromper em qualquer falha. Não usar reaplicação forçada ou reparo de histórico para esconder erro.
4. Repetir a checagem de catálogos e os advisors. Confirmar as policies, ACLs, proprietários e triggers efetivos, não apenas nomes de migrations.
5. Homologar jornadas direta e de coleta com proprietário, gerente, motorista/coletor e contato de cliente em sessões reais separadas. Verificar duas empresas e filiais restritas.
6. Testar PDF sintético com upload, finalize, download autorizado, negação e revogação. Não substituir Storage real por tabelas falsas ou marcar metadados prontos para simular sucesso.
7. Testar concorrência e recuperação de falha. Só então avaliar piloto; publicação do frontend é uma etapa separada.

Não há aprovação para piloto ou produção com base apenas nos testes locais. WhatsApp/Meta e envios reais permanecem fora desta tarefa.
