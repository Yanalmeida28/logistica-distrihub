# Homologação Supabase independente

## Atualização de 09/11/2026 — pendências estruturais instaladas

Após autorização específica, foram instaladas exclusivamente no `logistica-lab` as migrations customer_profile, direct_receiving e manager_role. Agora há nove migrations registradas. Os identificadores remotos e a validação estão em [PENDENCIAS_OPERACIONAIS.md](PENDENCIAS_OPERACIONAIS.md). As indicações abaixo de migrations pendentes descrevem estados anteriores.

As 14 verificações estruturais passaram: contratos Auth, cadastro ampliado, carga direta, Gerente, RLS e seis RPCs públicos com proprietário postgres, SECURITY INVOKER e EXECUTE negado a anon. Os corpos anteriores das oito funções privadas substituídas corresponderam à baseline local por MD5 com normalização CRLF/LF. Nenhuma identidade foi promovida e nenhum dado de teste remoto foi criado nesta instalação.

A homologação com sessões reais, Storage e concorrência entre conexões continua pendente. O advisor trouxe nove informações de RLS sem policies em tabelas privadas dos RPCs e um aviso de proteção de senhas vazadas desativada; não foram criadas policies permissivas nem alterada a configuração Auth. Não houve publicação de código ou alteração no ERP.

## Estado confirmado em 7/11/2026 — módulos instalados

As quatro migrations locais de equipe, coletas, portal/chat/documentos e Storage privado foram aplicadas com sucesso exclusivamente em `logistica-lab` (`cbbvmtinbgsmehthlhgn`). O projeto tem seis migrations registradas e 18 tabelas próprias, todas com RLS e sem SELECT para anon. Os cinco novos RPCs públicos são invoker, pertencem a postgres e concedem EXECUTE a authenticated, sem EXECUTE para anon. As concessões por coluna dos cadastros iniciais foram preservadas.

O bucket `logistics-private-documents` foi criado privado, limitado a 5 MiB e PDF/PNG/JPEG. As sete políticas de Storage foram instaladas, incluindo guardas restritivas de acesso e bloqueio de sobrescrita/exclusão por usuários.

`npm run verify:homologation` executou com sucesso após a instalação: Auth e Data API acessíveis, cinco RPCs novos reconhecidos e negados para anon, dez tabelas novas sem leitura anônima. A inspeção adicional confirmou funções privadas com proprietário postgres e search_path vazio, nenhum EXECUTE para PUBLIC e nenhum USAGE do schema privado para anon. Nenhum dado foi criado por essas verificações.

O advisor de segurança retornou apenas sete avisos informativos de [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), correspondentes às tabelas sem acesso direto dos usuários, acessadas exclusivamente pelos RPCs autorizados. Não foram criadas políticas permissivas para remover esse aviso. O advisor de desempenho retornou somente [índices ainda não utilizados](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), esperado antes de uso; os índices foram preservados.

Ainda há **zero contas Auth e zero empresas**. Não foram criadas identidades, usuários, empresas de teste ou arquivos neste ajuste. A instalação e a inspeção dos metadados não comprovam login, transferências de arquivos ou jornadas entre usuários. Criar contas verificadas de teste de forma privada e executar a homologação autenticada continua sendo o próximo passo. O DistriHub não foi acessado ou modificado. As seções abaixo registram o histórico das etapas anteriores; as referências a migrations ainda não instaladas descrevem aquele momento.

**Parte 5 — local, 7/11/2026:** portal, chat e documentos preparados nas migrations `20261107154433_logistics_portal_chat_documents.sql` e `20261107154438_logistics_private_storage.sql`. Não instaladas remotamente. A segunda exige o Supabase Storage real e não é executada no PGlite. Detalhes e testes pendentes em [RELACIONAMENTO_OPERACIONAL.md](RELACIONAMENTO_OPERACIONAL.md).

**Fluxo operacional — 7/11/2026:** `20261107152635_logistics_collection_workflow.sql` prepara OS persistentes, atribuição manual, coleta, recebimento e acompanhamento de cargas. Testada somente em PostgreSQL descartável. Não aplicada neste projeto hospedado. Consulte [COLETAS_OPERACIONAIS.md](COLETAS_OPERACIONAIS.md).

**Atualização local de 7/11/2026:** a migration `20261107152042_logistics_team_access.sql` e a interface de equipe foram preparadas e testadas em PostgreSQL descartável, mas **não foram aplicadas neste projeto hospedado**. A criação de contas verificadas e a validação Auth ponta a ponta continuam pendentes. Ver [EQUIPE.md](EQUIPE.md).

## Projeto autorizado

- Nome: `logistica-lab`.
- Organização: Invictus gestão.
- Referência: `cbbvmtinbgsmehthlhgn`.
- Região: São Paulo (`sa-east-1`).
- [Painel](https://supabase.com/dashboard/project/cbbvmtinbgsmehthlhgn).
- Custo de criação informado pelo conector e confirmado pelo proprietário: US$ 0/mês. Isso não representa garantia de gratuidade para qualquer consumo futuro.

O projeto DistriHub `kcxefjgchxhvcfppglvp` não foi modificado nem utilizado como origem de dados. A opção na landing page continua adiada; não houve publicação do aplicativo.

## Instalado

1. `logistics_foundation`: oito tabelas, vínculos de usuário/empresa/filial, clientes, veículos, auditoria, RLS e ACL.
2. `logistics_fk_indexes`: cinco índices complementares para chaves estrangeiras, sem alterar regras comerciais ou permissões.

Antes da instalação, `public` estava vazio; os contratos reais de `auth.users`, `auth.uid()` e os papéis necessários foram verificados por metadados. Não foram usados mocks para instalar a migration no projeto hospedado. Não foram criados usuários, empresas comerciais ou dados de operação.

## Executar o aplicativo local conectado

```text
npm ci
npm run start:homologation
```

Abrir `http://127.0.0.1:4180/operacao/`.

O arquivo `.env.logistica-homologacao` foi preparado localmente e está ignorado pelo Git. Contém a referência, URL, modo e chave **pública** do novo projeto; não contém senha, service_role ou token Meta. Não imprimir seu conteúdo em relatórios. O servidor de arquivos não permite baixá-lo.

`npm start` continua sem carregar esse arquivo automaticamente. O modo padrão permanece bloqueado. O modo `homologation` aceita exclusivamente a referência autorizada acima e HTTPS; outros projetos, inclusive DistriHub, são recusados. A chave pública não contorna RLS.

O servidor Node continua local e não é uma hospedagem de produção. A landing page e a demonstração `/app/` não foram conectadas ao banco. Os módulos demonstrativos ainda não persistem coletas, cargas, despesas, chat ou WhatsApp nesta base.

## Primeira conta e limites

O fluxo de login exige uma conta existente no Auth do **novo projeto**. Não existe usuário ou senha padrão. Criar/confirmar a conta do proprietário pelo painel Auth do projeto e definir sua senha de forma privada, sem enviá-la pelo chat. Depois de entrar, o proprietário poderá criar sua empresa e filial inicial pelo fluxo autenticado. Convites, recuperação de senha pela aplicação e administração dos vínculos ainda precisam ser implementados.

Não desativar a confirmação de e-mail nem alterar JWT ou metadados para contornar autorização. A criação de empresa exige e-mail confirmado, identidade não anônima e uma empresa própria por usuário.

## Validação realizada

- 71 testes locais aprovados, incluindo isolamento por empresa/filial, ACL, rollback e configuração que bloqueia outros projetos. As duas migrations executaram no PostgreSQL embarcado descartável.
- No projeto hospedado: oito tabelas com RLS, nenhuma com SELECT para anon; verificador de segurança sem alertas.
- O verificador de desempenho deixou apenas avisos informativos de índices ainda não utilizados, esperados em um banco recém-criado. [Referência do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Os índices de FK ausentes foram corrigidos em migration complementar.
- `npm run verify:homologation` confirmou Auth acessível, Data API disponível e negação de leitura/EXECUTE para anon. O teste não criou contas ou dados e não validou login de usuário real.
- Chrome local confirmou tela de login em homologação, área de cadastros protegida sem sessão, arquivo de configuração inacessível por HTTP e layout no celular sem overflow ou exceções JavaScript.

Pendências: primeiro login real, criação de empresa com identidade verificada, testes completos com duas transportadoras e usuários reais do Auth, administração de permissões, integração dos módulos ao banco e armazenamento privado de documentos. Meta e envio de mensagens permanecem desativados.
