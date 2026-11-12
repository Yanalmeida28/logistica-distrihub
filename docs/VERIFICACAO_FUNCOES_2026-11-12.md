# Verificação das funções — 12/11/2026

Versão de partida publicada: `de10532215b54cdcb79493b6aa1fdea5254fc2e1`.

## Resultado por módulo

| Área | Funções verificadas | Evidência e alcance |
|---|---|---|
| Hoje | Resumo, prioridades, atalhos para ordem/carga e atualização | Navegador real com HTTP simulado e testes de composição do resumo |
| Coletas | Criação, endereço de coleta/destino salvo, consulta, busca, filtros, ficha, PDF e etapas sequenciais | Testes HTTP, PostgreSQL descartável e navegador; compartilhamento nativo depende do dispositivo |
| Alocação e motoristas | Elegibilidade por filial, atribuição/liberação, capacidade, versão, uma coleta ativa por responsável/veículo | PostgreSQL descartável; apresentação da tarefa no navegador |
| Recebimento | Receber coleta confirmada; entrada direta sem OS; vincular documentos posteriormente | PostgreSQL, payload HTTP e formulário no navegador |
| Cargas | Lista, busca, ficha, NF/CT-e como referência, avanço explícito e histórico | Testes de domínio/HTTP e jornada no navegador com respostas simuladas |
| Ocorrências e pendências | Lista, abrir carga, registrar divergência/avaria, resolver e completar referências | Navegador com HTTP simulado; permissões de busca/ocorrências validadas por testes HTTP |
| Cotações | Solicitação pela central, proposta com validade, registro manual da resposta comunicada pelo cliente | Jornada de formulário no navegador e persistência/versões/histórico no PostgreSQL descartável |
| Financeiro | Quatro indicadores, títulos autorizados, separação de receita/despesa, exclusão de cancelados | Cálculos e isolamento no PostgreSQL; painel no navegador |
| Faturamento | Criar título, baixa parcial/total, rejeitar excesso/data futura, impedir repetição após quitação, recuperar resposta ambígua | PostgreSQL e navegador real. Recuperação reutiliza a mesma chave sem duplicar o recebimento |
| Despesas | Criar título, categorias, baixa, cancelamento sem pagamento, histórico, referência textual de comprovante | PostgreSQL; criação/cancelamento/histórico no navegador |
| Gestão | Cadastros, clientes, endereços, filiais, veículos, equipe, convites, perfis, revogação e navegação reservada | Testes HTTP e PostgreSQL; cadastro de endereços e navegação administrativa no navegador |
| Portal e documentos | Vínculo explícito a cargas, convites, projeção limitada ao cliente, revogação, validação de arquivos e acesso privado | HTTP e PostgreSQL descartável; portal renderizado por perfil no navegador. Upload/download real no Supabase Storage não homologado |
| Chat | Contatos da filial, mensagens, histórico, isolamento entre conversas, repetição e escaping | Contratos HTTP, PostgreSQL descartável e testes de interface; navegação para chat no navegador |
| Conta e instalação | Tela de login, layout, recusa sem sessão, proteção de origem/host, manifest e instalação por plataforma | Testes locais e consulta HTTP ao domínio. Login com senha real, entrega de e-mails e instalação física não realizados |

## Correção encontrada

Nos módulos comerciais, editar um formulário bloqueava silenciosamente atualização, filtros e paginação e não havia um botão para desistir da edição. Agora a tela mostra a edição em andamento e permite **Descartar edição**. Troca de filial, paginação e atualização informam a necessidade de salvar/descartar; a seleção da filial permanece coerente com os registros exibidos. Uma resposta de lista antiga não substitui uma seleção mais recente nem apaga um formulário editado durante a consulta. Um envio durante carregamento pede que o usuário aguarde.

Essa correção não permite descartar uma confirmação financeira ambígua: a recuperação do mesmo comando continua obrigatória.

## Execuções

- Suíte completa: 201 testes, 200 aprovados, zero falhas e um teste de Storage real ignorado. Log local: `.tmp/audit-each-function-tests.log`.
- Três testes direcionados repetidos depois da ampliação das asserções financeiras: aprovados. Cobrem centavos fracionários/zero, data futura, quitação total, repetição e tentativa de baixa em título cancelado.
- Chrome com DOM real e serviço HTTP simulado: computador (1440 px) e celular (390 px), todos os perfis, estados vazio/negado e jornadas comerciais. Login/apresentação também em 1366, 1280, 360 e 320 px. Log: `.tmp/audit-each-function-browser.log`.
- No domínio publicado, POST sem sessão para commercial, collections, freight, team, portal, documents, chat, customers, cargo-issues, cargos e records: todos retornaram 401. `/api/status`: configurado em homologação. Não houve autenticação com conta real, criação de contas nem alteração de dados comerciais em produção.

## Limites e recursos não implementados

Os testes simulados e em PostgreSQL descartável não certificam cada jornada autenticada em produção. Storage real, impressão/compartilhamento físico, instalação do PWA e uso simultâneo em dispositivos continuam dependentes de homologação própria. GPS/roteirização automática, WhatsApp, emissão fiscal, conexão bancária, cobrança da mensalidade SaaS e aceite online de cotação pelo cliente não estão implementados. Comprovante financeiro é referência textual; não é anexo de arquivo. Esses recursos não são classificados como aprovados ou ativos por esta revisão.
