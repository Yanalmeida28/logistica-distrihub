# Padrões do ERP adaptados à Logística

Publicacao autorizada pelo proprietario em 08/11/2026, exclusivamente no app de logistica. Entrega pelo GitHub conectado a Hostinger. Nenhuma migration, conexao Meta ou alteracao no banco faz parte desta entrega.

## Entrega

- Busca sem distinção de acentos e paginação de dez registros para filiais, clientes e veículos. Estado de busca/página preservado por empresa ao reconstruir a área operacional, eliminado ao sair.
- Busca, filial, etapa e paginação de dez ordens na lista de coletas, exclusivamente sobre os registros já autorizados pela API. O limite do servidor continua em 100 ordens recentes e 1.000 eventos; não é paginação de todo o histórico. Os cadastros seguem limitados a 500 registros por tipo. Paginação no servidor será necessária para ampliar esses limites.
- Confirmações flutuantes de cinco segundos para mutações e compartilhamento; erros persistem até a próxima ação. A confirmação vem após a resposta do backend, sem presumir coleta, entrega ou pagamento.
- Atualização sem reconstrução quando os dados não mudaram. Atualizações de coletas preservam formulário de criação, ações da mesma versão, filtros, foco e históricos abertos. Edição pendente bloqueia filtros, paginação e atualização que poderiam descartar o rascunho. Polling não consulta se o painel estiver oculto.
- PDF operacional da ordem de coleta, com empresa, filial, cliente, endereços e volumes. Usa jsPDF 4.2.1, mesma versão do ERP. Compartilhamento nativo quando suportado, download como alternativa; cancelamento não confirma envio. Não é CT-e, MDF-e, autorização fiscal ou comprovante de coleta. Não há envio automático de e-mail/WhatsApp.
- Indicadores e barras da visão geral refletem apenas filiais, clientes e veículos ativos retornados no workspace autorizado. Não exibem dados financeiros simulados como reais.
- Padrões de formulários e tabelas mantidos no app, respeitando as funções e os controles existentes da logística. Não foram copiadas permissões, tabelas ou funções comerciais do ERP.

## Verificações

Suíte completa: 136 testes aprovados, nenhuma falha, um teste de Storage real ignorado por exigir stack/Auth/arquivos reais. Testes específicos verificam busca/filtros/páginas, temporização e substituição da notificação, PDF real com múltiplas páginas, recusa de empresa diferente e atualização sem reconstrução quando o conteúdo permanece igual.

Chrome headless em servidor HTTP local com workspace sintético: renderização do menu e três indicadores, acesso à aba Coletas, manutenção do rascunho e bloqueio da atualização geral durante edição. O teste não utiliza sessão real nem dados do Supabase. Verificações de sintaxe JavaScript, CSS e diff sem erros.

## Pendências

- Homologar a jornada autenticada e o compartilhamento em celulares reais.
- Cotações em PDF e indicadores financeiros reais dependem de conectar os respectivos módulos demonstrativos ao backend. Não foram apresentados como concluídos.
- Atualizar o pacote ZIP antes de eventual instalação manual: o ZIP anterior não inclui estas mudanças. A implantação pelo GitHub deve instalar a dependência nova pelo package-lock.json.
- Cores e menu lateral estao incluidos na entrega autorizada. O codigo e o banco do ERP DistriHub nao foram alterados.
