# Visão geral operacional

Publicacao autorizada exclusivamente no app de Logistica em 08/11/2026, via GitHub e Hostinger. Sem alteracoes no ERP, no Supabase ou nas regras de autorizacao.

O resumo consulta o RPC de coletas já existente por meio da API autenticada, preservando o recorte autorizado por empresa, filial e responsável. Não há nova função de banco ou rota de dados.

Mostra aguardando atribuição, coletas em andamento (atribuídas/aceitas/iniciadas), aguardando recebimento, recebidas na unidade, cargas em trânsito (embarcadas/no destino/em entrega) e entregas confirmadas. O status da carga prevalece sobre o status da ordem quando os vínculos de empresa, filial e ordem coincidem. IDs duplicados não aumentam as contagens.

Inclui filtro local por filial autorizada, distribuição das etapas, até cinco pendências/próximas coletas e atalho para o módulo de coletas. Para clientes, apresenta acesso ao portal e não consulta o resumo interno.

O conjunto é limitado às até 100 ordens recentes devolvidas pelo servidor. Não se trata de total histórico, produtividade diária, SLA, atraso presumido ou indicador financeiro. As três métricas de cadastros já existentes permanecem disponíveis abaixo.

Atualiza manualmente ou a cada 30 segundos quando a Visão geral e o navegador estão visíveis. Atualiza apenas o conteúdo do resumo, preservando a seleção de filial e os outros módulos. Falha de rede mantém o último resumo acompanhado de aviso; respostas 401/403 removem os dados do resumo. Desconexão do componente impede aplicar respostas antigas.

Validação local: testes de contagem, vínculos cruzados, duplicação, perfil de cliente sem consultas internas, escape de conteúdo, revogação e falha temporária; regressões de navegação/coletas aprovadas. Sintaxe JavaScript, CSS e diff verificados. Jornada autenticada com dados reais não foi executada nesta etapa.
