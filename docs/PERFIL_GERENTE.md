# Perfil Gerente

**Atualização de 09/11/2026:** migration instalada no projeto `logistica-lab` após autorização explícita. Constraints, proprietário, search_path e privilégios foram conferidos nos catálogos. Nenhum funcionário existente foi promovido. A interface Gerente permanece local, sem push/deploy nesta tarefa; a seção de implantação abaixo registra a preparação original.

O papel persistido `manager` aparece como **Gerente**. O proprietário pode convidar um funcionário ou alterar seu vínculo em Gestão > Equipe e convites, selecionando as filiais autorizadas. Nenhum vínculo existente é promovido automaticamente.

O gerente utiliza Hoje, Coletas, Recebimento, Cargas, Pendências, clientes, veículos, documentos, portal e chat conforme os contratos existentes e as filiais liberadas. Clientes compartilhados podem ser consultados; sua alteração continua exclusiva do proprietário. O gerente não substitui o motorista/coletor nas confirmações exclusivas desses papéis.

Criar filiais, gerenciar funcionários e permissões e modificar vínculos protegidos continuam exclusivos do proprietário. A autorização é validada no banco, com vínculo ativo e isolamento empresarial; esconder controles na interface não substitui essas verificações.

## Implantação pendente

Nova migration: `supabase/migrations/20261109134416_logistics_manager_role.sql`. Ela amplia os CHECKs de papéis e os contratos privados de autorização, equipe e chat, preservando assinaturas, proprietários e controles existentes. Não altera migrations históricas nem promove usuários. A instalação é transacional, com `lock_timeout` de cinco segundos; alterações de constraints e funções exigem locks e devem ser homologadas antes de aplicação remota.

Aplicar somente depois das migrations anteriores, incluindo customer_profile e direct_receiving. Publicar a interface sem a migration não habilita o papel no banco. Nenhuma migration remota ou publicação foi realizada nesta tarefa.

## Validação local

- SQL real em PGlite descartável: convite e aceite, filiais, empresas, clientes compartilhados, operação, documentos, portal, chat, bloqueio de administração e revogação de acesso.
- Testes da interface: seleção do papel pelo proprietário e ausência de gestão de equipe para o gerente.
- Navegador em 1440 e 390 pixels, incluindo Gerente: dados HTTP sintéticos, sem Auth ou Storage reais.

A homologação com Supabase Auth, Storage privado e sessões independentes permanece necessária. PGlite não comprova concorrência MVCC entre conexões PostgreSQL independentes. O teste de Storage real permanece pendente; não houve bypass para fazê-lo passar.
