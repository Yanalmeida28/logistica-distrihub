# Logística Lab

Projeto de teste independente do DistriHub. Nome comercial provisório. Repositório: https://github.com/Yanalmeida28/logistica-distrihub. Não adicionar dados pessoais, documentos reais ou credenciais ao Git.

## Estado atual — 7 de novembro de 2026

- `/`: apresentação local do projeto.
- `/app/`: demonstração com dados fictícios em memória, perdidos ao recarregar. Seleção de perfis não é autenticação.
- `/operacao/`: login Supabase e cadastros persistentes de empresas, filiais, clientes e veículos.
- Banco independente: fundação e índices registrados como instalados em `logistica-lab`; estado remoto não revalidado nesta etapa.
- Aplicativo não publicado. Servidor preparado somente para uso local.

A demonstração inclui equipe, cotações manuais, ordens de coleta, alocação de motoristas, acompanhamento de cargas, ocorrências, portal, chat, faturamento, despesas e comprovantes fictícios. Esses módulos ainda não estão conectados ao banco.

A mensalidade da plataforma permanece separada do faturamento de fretes. Preços, planos e cobrança não foram definidos. WhatsApp, GPS, roteirização, emissão fiscal, TMS e pagamentos não estão integrados. Não há envios reais de mensagens.

## Executar localmente

Requer Node.js 22 ou superior:

```sh
npm ci
npm start
```

Abra http://127.0.0.1:4180/app/ para a demonstração. Sem configuração, `/operacao/` permanece bloqueada.

Para o projeto Supabase independente autorizado, use `npm run start:homologation` após conferir [HOMOLOGACAO_SUPABASE.md](docs/HOMOLOGACAO_SUPABASE.md). Não existe usuário ou senha padrão. Não envie senhas pelo chat nem reutilize credenciais do DistriHub.

`.env.logistica-homologacao` permanece local, ignorado pelo Git e não servido por HTTP. O backend aceita homologação exclusivamente no projeto independente autorizado, sem chave service_role ou bypass de RLS.

## Validar

```sh
npm test
```

No PowerShell com bloqueio de npm.ps1, use `npm.cmd test`. Na revisão de 7 de novembro de 2026, **71 testes passaram**, sem falhas ou testes ignorados. Incluem domínio demonstrativo, contrato HTTP com doubles do SDK e RLS/ACL em PostgreSQL embarcado descartável. Não equivalem à homologação completa de Supabase Auth, JWT, gateway ou uso simultâneo entre dispositivos.

`npm run verify:homologation` acessa o projeto remoto independente; não faz parte da suíte local e não foi executado nesta revisão.

## Próximas entregas

1. Validar login real, criação de empresa e isolamento com duas transportadoras no projeto independente.
2. Implementar convites, equipe, permissões por filial, recuperação de senha e edição/desativação dos cadastros.
3. Persistir OS de coleta → motorista → confirmação → recebimento na central → acompanhamento da carga, com transações e concorrência.
4. Integrar documentos privados, portal e chat; depois financeiro, despesas e WhatsApp oficial por transportadora.
5. Preparar hospedagem com HTTPS, sessões adequadas, monitoramento, backups e piloto controlado.

Registrar carga não substitui documentação fiscal nem autoriza transporte. Eventos, correções, cargas divididas, entregas parciais e responsáveis precisam ser validados com a operação.

## Documentação

- [Base operacional e segurança](docs/BASE_OPERACIONAL.md)
- [Projeto Supabase e homologação](docs/HOMOLOGACAO_SUPABASE.md)
- [Evolução da demonstração](docs/ESTRUTURA.md)
- [Portal e notificações demonstrativas](docs/PORTAL_CLIENTE.md)
- [Direção visual](docs/VISUAL.md)
- [Preservação no Git](docs/PRESERVACAO_GIT.md)

Registros históricos de testes correspondem às respectivas etapas. O estado consolidado é o descrito neste README. O DistriHub permanece separado e intacto.
