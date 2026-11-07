# Base operacional local

**Atualização:** a criação do projeto independente foi autorizada e a fundação já foi instalada em `logistica-lab`. O modo de homologação foi habilitado exclusivamente para esse projeto; consulte [HOMOLOGACAO_SUPABASE.md](HOMOLOGACAO_SUPABASE.md). As instruções de stack local abaixo continuam sendo uma alternativa; os relatos de ausência de projeto externo descrevem a etapa anterior.

## Estado e escopo

Primeira etapa para transformar o protótipo em aplicativo persistente. Preparação local, sem projeto externo, deploy, credenciais reais ou integração Meta. Nenhum arquivo ou recurso do DistriHub foi alterado.

- `/app/`: demonstração anterior em memória, sem login. Não usar dados reais.
- `/operacao/`: nova área para Supabase Auth e cadastros persistentes. Sem configuração fica bloqueada, sem fallback para perfis fictícios.
- `backend/`: API no servidor Node local, ouvindo apenas em `127.0.0.1:4180`. A URL Supabase só pode ser HTTP em `127.0.0.1` ou `localhost`; qualquer projeto remoto, inclusive DistriHub, é recusado.
- `supabase/migrations/20261106190046_logistics_foundation.sql`: primeira migration deste projeto, criada com a CLI oficial. Só foi executada em PostgreSQL embarcado descartável para testes.

## Objetos e permissões

| Tabela | Finalidade | Escrita pelo usuário autenticado |
|---|---|---|
| `log_companies` | Transportadoras | Somente bootstrap autenticado de empresa própria |
| `log_branches` | Filiais | Proprietário cria e altera nome/ativo |
| `log_memberships` | Vínculos Auth, empresa e papel | Nenhuma escrita direta |
| `log_member_branches` | Filiais autorizadas de cada vínculo | Nenhuma escrita direta |
| `log_customers` | Clientes de filial ou compartilhados | Proprietário/admin autorizado; compartilhado somente proprietário |
| `log_customer_contacts` | Contatos explicitamente ligados a clientes | Nenhuma escrita direta |
| `log_vehicles` | Veículos por filial | Proprietário/admin autorizado |
| `log_audit` | Autor, objeto, ação e horário | Somente triggers e bootstrap; usuário não altera/exclui |

Todas as oito tabelas têm RLS. Sem acesso para `anon` ou `PUBLIC`. FKs compostas impedem relacionar filiais e cadastros de empresas diferentes. Identidade e filial de um cadastro não podem ser alteradas pelas concessões de UPDATE.

Os helpers `SECURITY DEFINER` ficam em schema privado com `search_path` vazio e autorização por `auth.uid()` e vínculos atuais no banco. Só há USAGE e EXECUTE nas funções necessárias, sem concessão geral ao schema. Não se confia em papéis enviados pelo navegador nem em `user_metadata`. Desativar vínculo ou empresa retira o acesso consultado por RLS sem depender da renovação do JWT.

O RPC público `log_create_company` é `SECURITY INVOKER`; chama um bootstrap privado restrito a identidade não anônima com e-mail confirmado. A criação de empresa, proprietário, filial e auditoria é atômica. Uma empresa própria por usuário. Isso ainda não significa assinatura paga, aprovação comercial ou direito de uso em produção.

Criação de funcionários, convites, concessões de filial e vínculos de contatos ainda precisam de um serviço administrativo auditado. Não há endpoint que aceite criar/editar papéis livremente. Não conceder permissões diretas às tabelas protegidas para contornar essa pendência.

## Sessão e API

- SDK oficial `@supabase/supabase-js`, fixado no lockfile.
- Login via `signInWithPassword`; requisições autenticadas consultam `getUser` no Auth.
- Tokens ficam exclusivamente na instância do cliente no processo Node. O navegador recebe identificador aleatório em cookie HttpOnly/SameSite=Strict com escopo `/api`.
- Sessão limitada ao menor prazo entre uma hora e a expiração original do token. Reiniciar o servidor encerra as sessões locais; não há renovação silenciosa implementada.
- Este servidor é local HTTP. Não é um servidor de produção: HTTPS, cookies Secure, armazenamento compartilhado de sessões e monitoramento serão necessários para hospedagem.
- POST exige Origin exata; Host é limitado ao endereço local. Sem CORS, sem logs de corpos/senhas/tokens, sem chave `service_role`, com limite de corpo, timeout e limite básico de tentativas de login.
- Operações de dados usam o cliente autenticado daquele usuário; RLS é aplicada pelo PostgreSQL, sem bypass administrativo.
- Listagem inicial de cadastros é limitada a 500 registros por tipo. Paginação operacional, edição/desativação pela interface e recuperação de senha/convites ainda não foram implementadas.

## Preparar execução futura

Pré-requisitos: Node 22+, dependências instaladas com `npm ci`, CLI Supabase e Docker funcionando. A CLI 3.0.0 foi instalada neste projeto. Docker não foi encontrado no PATH nesta execução; a stack completa de Supabase Auth/PostgREST não foi iniciada.

Somente quando for autorizado iniciar a stack local:

1. Consultar `npx --no-install supabase init --help` e inicializar a configuração dentro deste checkout, com `--workdir .`, preservando esta migration.
2. Conferir portas, isolamento, projeto local e a configuração gerada antes de iniciar. Usar exclusivamente o banco novo desta aplicação; não importar o schema nem dados do DistriHub.
3. Consultar `npx --no-install supabase start --help` e iniciar a stack local. Esta etapa pode aplicar migrations ao banco local; não foi realizada neste trabalho.
4. Obter a URL e a chave pública do ambiente local com a CLI/Studio. Não usar chave secret/service_role nem publicar a saída completa do status, que pode conter chaves privilegiadas.
5. Configurar no processo Node `LOGISTICS_DATABASE_MODE=local`, `LOGISTICS_SUPABASE_URL` com a URL local e `LOGISTICS_PUBLISHABLE_KEY` com a chave pública local. A configuração também aceita o JWT legado **anon** da stack local; recusa JWT de service_role.
6. Não colocar chaves em arquivos públicos. Caso use `.env.local` privado, ele está ignorado pelo Git; iniciar com `node --env-file=.env.local server.mjs`. O aplicativo não carrega arquivos de ambiente automaticamente e não foi criado `.env` neste trabalho.
7. Criar identidades sintéticas no Auth local, confirmar seus e-mails pelo fluxo local e entrar em `/operacao/`. Não existe usuário/senha padrão. O proprietário cria sua empresa e primeira filial pelo fluxo autenticado.
8. Repetir os testes com identidades reais do Auth local para duas empresas e diferentes papéis. Os vínculos adicionais precisam de provisionamento local controlado até existir o fluxo de convites; não editar JWT ou metadados para simular autorização.

Não fornecer senhas ou tokens pelo chat. Configuração, criação de projeto externo, ativação de produção e conexão Meta permanecem fora desta etapa.

## Validação executada e limites

- `npm test`: testes do protótipo, contrato HTTP e políticas PostgreSQL.
- Testes SQL executam a migration em PGlite, um PostgreSQL embarcado descartável, com roles e fixture mínima do contrato `auth.uid()`/`auth.users`. Validam RLS/ACL reais do PostgreSQL, FKs, isolamento, funções, rollback e bloqueio de escalonamento. **Não validam assinatura de JWT, Supabase Auth, gateway ou SMTP reais.**
- Testes HTTP de sucesso/autorização usam doubles do SDK, sem rede externa; verificam o contrato de sessão e o tratamento dos retornos. Não são homologação do provedor.
- Validação do Auth real, PostgREST, schema Auth efetivo, advisors Supabase, sessões entre navegadores e stack completa permanece pendente.
- As alterações só preparam cadastros. Cotações, OS, cargas, eventos, financeiro, despesas, documentos privados, chat e notificações ainda usam os módulos demonstrativos, sem migração automática de seus dados.

Resultado desta execução: **70 testes aprovados** (55 do protótipo, 6 de contrato/configuração HTTP e 9 da suíte PostgreSQL, incluindo o teste agrupador). Chrome local confirmou as regressões do protótipo e a nova tela bloqueada sem configuração, nos tamanhos desktop/mobile, sem exceções JavaScript nos fluxos executados. Instalação npm reportou zero vulnerabilidades na verificação executada. Nenhuma stack Supabase real foi iniciada, migration aplicada fora do banco embarcado de teste, conexão externa de banco ou publicação realizada.

## Sequência restante

1. Executar e homologar esta fundação em Supabase local próprio.
2. Implementar convites e gerenciamento de usuários/filiais, cadastro completo de clientes e contatos.
3. Persistir e integrar cotação → OS → carga → entrega, com eventos imutáveis, idempotência e transações.
4. Storage privado, comprovantes, permissões de download, aprovações e fechamento de custos por viagem.
5. Portal e chat sincronizados, depois WhatsApp oficial por transportadora, com fila/consentimento e webhooks.
6. Financeiro integrado e assinatura SaaS separados, seguidos de piloto isolado com concorrência, indisponibilidade e recuperação de backups.

## Referências verificadas

[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções e privilégios](https://supabase.com/docs/guides/database/functions), [login com senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [validação de usuário](https://supabase.com/docs/reference/javascript/auth-getuser) e [changelog](https://supabase.com/changelog).
