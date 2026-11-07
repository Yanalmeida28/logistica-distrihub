# Equipe e permissões por filial

Implementação local de 7 de novembro de 2026. Ainda não instalada no Supabase hospedado e não publicada. O login real da etapa anterior continua pendente por ausência de contas verificadas de teste.

## Uso preparado

Após instalar a migration própria e entrar em `/operacao/`, o proprietário pode convidar administrativo, coletor ou motorista, selecionando uma ou mais filiais ativas. O funcionário precisa de conta Auth com o e-mail confirmado correspondente. Após entrar, recebe o convite na área operacional e pode aceitá-lo. O convite expira em sete dias; não cria contas Auth e não envia e-mail automaticamente.

O proprietário lista a equipe, altera função e filiais, desativa e reativa vínculos e revoga convites pendentes. Proprietários e clientes são vínculos protegidos, fora da edição de funcionários. Não há promoção ou transferência de propriedade nesse fluxo. Alterações não conferem acesso a módulos logísticos ainda demonstrativos.

## Segurança

- RPC público `log_team(uuid,text,jsonb)` SECURITY INVOKER; implementação privada SECURITY DEFINER com search_path vazio, validando auth.uid(), e-mail confirmado e vínculos atuais no banco.
- Apenas proprietário ativo da empresa ativa gerencia equipe. Administrativo, coletor e motorista não gerenciam acessos.
- Convite não concede acesso antes do aceite. Aceite requer destinatário correto, validade, empresa ativa, criador ainda proprietário e filiais ativas.
- Escrita direta nos vínculos e convites continua negada. Nova tabela `log_team_invites` tem RLS e nenhuma concessão direta para usuários. PUBLIC e anon não executam os RPCs.
- Trocas são serializadas com bloqueio por empresa. Aceite, vínculos de filiais e auditoria são transacionais. Falha na auditoria reverte as mudanças.
- Desativação retira o acesso consultado por RLS, sem precisar renovar JWT. Reativação exige filial ativa. Convites revogados ou expirados não podem ser aceitos novamente.
- E-mails da equipe só são listados ao proprietário da própria transportadora. Não existe pesquisa global de contas Auth.
- A API mantém autenticação real pelo SDK, cookie HttpOnly, checagem de Origin e cliente com JWT do usuário, sem service_role. Erros SQL não são devolvidos ao navegador.

## Arquivos

Migration `20261107152042_logistics_team_access.sql`; API `backend/api.mjs`; interface `operation/team.mjs`, integrada em `operation/main.mjs` e permitida explicitamente em `server.mjs`; testes de banco, API e renderização.

## Validação e limites

Testes locais usam PostgreSQL embarcado descartável e identidades sintéticas. Validam aceite, autorização, isolamento, filiais, ACL, revogação e rollback por falha injetada. Os testes HTTP usam doubles do SDK. A renderização é testada sem navegador real. Esses testes não comprovam JWT/Auth reais, concorrência entre conexões independentes, SMTP ou experiência de ponta a ponta no navegador.

Próxima etapa: revisar e instalar somente esta migration no projeto independente `logistica-lab`, criar contas verificadas de teste de forma privada e validar proprietários/funcionários de duas transportadoras. Não aplicar no DistriHub. Convites por e-mail, cadastro de conta pelo app e recuperação de senha permanecem pendentes.

Resultado local: 87 testes aprovados, sem falhas ou testes ignorados; inclui regress?es dos m?dulos existentes. Verifica??es de sintaxe JavaScript e diff tamb?m aprovadas.
