# Publicação de cargas e pendências — 10/11/2026

Publicação autorizada pelo proprietário após os commits locais 15461ea, 443c1e3 e 0341763. Escopo exclusivo do repositório logistica-distrihub e do projeto logistica-lab (cbbvmtinbgsmehthlhgn). Nenhuma alteração no ERP DistriHub.

## Preparação do banco

Instaladas nesta ordem, a partir dos arquivos versionados sem modificações:

1. logistics_customer_pickup_addresses
2. logistics_freight_search_sheet
3. logistics_cargo_issues

As três instalações responderam success=true. Não houve backfill, edição de cargas, criação de usuários ou atribuição de privilégios administrativos. Os catálogos confirmaram proprietário postgres, search_path vazio nas funções, wrappers públicos SECURITY INVOKER e negação de EXECUTE a anon. As quatro tabelas novas têm RLS ativo e negam leitura anônima; ocorrências, eventos e comandos não permitem leitura/escrita direta a authenticated. Endereços usam as políticas e os privilégios por coluna já testados.

Advisors: aviso de proteção contra senhas vazadas desativada no Auth; não alterada nesta publicação. Informações de RLS sem políticas nas tabelas fechadas são intencionais: acesso apenas por RPC autorizada, sem grants diretos. Não foram criadas políticas permissivas para silenciar o advisor.

## Limites da validação

A suíte local anterior aprovou 194 de 195 testes, sem falhas; Storage real permaneceu ignorado. Navegador local usou serviço simulado em 1440 e 390 px. A verificação remota consulta Auth e testa negações anônimas, sem cadastrar contas ou dados. Isso não equivale a homologar jornadas com JWT de proprietário/motorista/cliente, documentos reais ou concorrência entre conexões. Essas jornadas continuam pendentes.

README.md e docs/CADASTROS_E_GESTAO.md, modificados anteriormente, permanecem preservados fora deste commit. A entrega pelo GitHub aciona o fluxo existente da Hostinger; a confirmação da versão publicada deve comparar os arquivos servidos com os arquivos do commit enviado. Nenhuma conexão Meta ou envio de mensagem integra esta publicação.
