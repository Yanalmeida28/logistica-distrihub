# Preservação local do desenvolvimento

Data: 7 de novembro de 2026.

Esta entrega preserva a implementação existente em um commit local. Não constitui publicação, aprovação de produção ou homologação completa. Não inclui push, deploy, alterações no Supabase ou integração Meta.

## Conteúdo permitido

Apresentação, demonstração, backend local, área operacional, migrations próprias, testes sintéticos, verificador de homologação, dependências fixadas e documentação.

## Conteúdo excluído

Arquivos .env e variantes, dependências instaladas, temporários, logs, metadados locais da CLI, chaves privadas, dumps e backups. A configuração de homologação existente permanece local e ignorada. Não incluir usuários reais, senhas, tokens ou documentos comerciais.

## Verificação antes do commit

Revisar a lista explícita dos arquivos e possíveis segredos sem reproduzir valores. Exemplos sintéticos dos testes não são credenciais operacionais. Executar `npm.cmd test` e `git diff --cached --check`. Conferir que nenhum arquivo privado entrou no índice.

## Pendências

A demonstração continua em memória. A base operacional possui login e cadastros iniciais. Os módulos logísticos ainda precisam de persistência e integração. Testes locais não substituem Auth real, isolamento entre empresas/filiais e concorrência no ambiente isolado.

Próxima etapa: validar a fundação autenticada no projeto Supabase independente e implementar gerenciamento seguro da equipe. Publicação e cobrança permanecem pendentes. O DistriHub permanece separado.
