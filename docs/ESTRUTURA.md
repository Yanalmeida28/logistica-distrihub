# Estrutura do app de teste

A preparação da base autenticada e persistente está separada em `/operacao/`, `backend/` e `supabase/`. Leia [BASE_OPERACIONAL.md](BASE_OPERACIONAL.md). As limitações em memória descritas abaixo continuam válidas para `/app/`; os módulos operacionais ainda não foram conectados ao banco.

## Organização

- index.html, styles.css, app.js: apresentação original e demonstração das etapas.
- app/index.html: estrutura de navegação do painel.
- app/styles.css: estilos exclusivos do app, com adaptação para celular.
- app/main.mjs: telas, filtros, formulários e ações demonstrativas em memória.
- app/domain.mjs: contratos e transições puras do protótipo.
- app/demo.mjs: geração de dados sintéticos.
- server.mjs: servidor local de arquivos explicitamente permitidos, somente loopback.
- tests/domain.test.mjs: testes das transições e integridade dos dados de exemplo.

## Telas

Visão geral; recebimento; lista de cargas; detalhe com histórico, referências e pendências; pendências abertas; atendimento e projeto/integrações com estado explicitamente não implementado.

O recebimento cria uma identificação interna sem exigir CT-e ou inventar coleta anterior. Referências documentais são metadados fictícios, sem upload, emissão ou validação fiscal. O acompanhamento sequencial e o bloqueio por pendência são regras de demonstração para discutir com a operação, não regras comerciais homologadas.

## Limites

Não há autenticação, autorização real, multiempresa segura, persistência, sincronização entre abas, transação de banco, backend, TMS, cron ou mensagens. Filtros e verificações do contexto no JavaScript são somente proteção de consistência do exemplo; não constituem segurança de produção. Qualquer pessoa com acesso ao navegador pode inspecionar/alterar os exemplos.

Todos os dados são fictícios e desaparecem ao recarregar. Não inserir dados pessoais, de clientes ou documentos reais. Nenhuma informação é enviada para servidor. Sem bibliotecas remotas, analytics ou rastreadores. Não há arquivos, credenciais ou componentes importados do DistriHub.

## Próxima decisão

Validar com a operação a origem dos eventos, identificação pré-documental, TMS e integrações, contatos autorizados, estados, correções, responsabilidades e cargas divididas/entregas parciais. Depois definir contratos persistentes e arquitetura backend com autenticação real e isolamento empresarial, sem reaproveitar estes filtros como autorização.

Tecnologia da apresentação (HTML/CSS/JS) não decide a arquitetura do produto operacional. Repositório: Yanalmeida28/logistica-distrihub. Nome comercial permanece provisório.

## Verificação

Executar `node --test tests/domain.test.mjs` e `node --check app/main.mjs`. Para navegar: `node server.mjs`, abrir http://127.0.0.1:4180/app/. A interface exige navegador moderno com módulos JavaScript e dialog. Não é necessário instalar dependências.


## Resultado da verificacao local

2026-11-06: oito testes de dominio aprovados; verificacao de sintaxe JavaScript aprovada. HTTP dos arquivos do app aprovado; acesso a .git e metodo POST rejeitados. Chrome headless: painel, recebimento sintetico, detalhe, avanco de etapa, busca e filtro por unidade aprovados, sem excecoes JavaScript. Layout conferido em 1440 e 390 px, sem overflow horizontal do documento. Capturas e perfil temporario ficam em .tmp, ignorado pelo Git. Esses testes nao validam seguranca ou operacao de um backend real.


## Equipe e coletas ? 2026-11-06

app/team.mjs acrescenta cadastro de funcionarios ficticios (administrativo ou coleta), ativacao/desativacao demonstrativa, atribuicao de coletas e area do coletor. O coletor confirma somente coletas atribuidas a ele no contexto do exemplo; a central passa a visualizar coletada na origem com autor e horario. Recebimento no armazem exige outra confirmacao. Isso continua sendo uma simulacao na mesma pagina: nao ha login, notificacao, sincronizacao entre dispositivos ou permissao no servidor. Os perfis e filtros JavaScript NAO devem ser tratados como seguranca real. Todos os registros se perdem ao recarregar.

Onze testes de dominio passaram, incluindo inativo, papel incorreto, outro coletor/unidade/empresa, repeticao e separacao entre coleta e recebimento. Regras do prototipo precisam ser validadas com a operacao antes de implementar backend.


## Cotacoes e modelo SaaS - 2026-11-06

app/quotes-domain.mjs define solicitacao do cliente, proposta manual do administrativo, resposta e validade. app/quotes.mjs apresenta os dois perfis ficticios; os exemplos compartilham somente memoria desta pagina. A cotacao guarda empresa, unidade, cliente, origem/destino, volumes, peso e valor declarado. Nao calcula tabela, cubagem, impostos ou seguros. O administrativo informa o frete total, condicoes, validade e prazo estimado em dias corridos. O cliente ficticio aceita ou recusa; aceite nao cria coleta, pagamento, contrato ou lancamento financeiro. Alteracoes e novas versoes de proposta ainda precisam de definicao operacional.

app/saas.mjs separa a receita da plataforma do frete: cada transportadora sera assinante do app, e seus clientes contratarao os fretes da transportadora. Decisao do proprietario: deixar preparado sem precos. Mensalidade, planos e provedor continuam nulos/nao configurados; nenhuma cobranca automatica, teste gratuito, comissao ou limite comercial foi assumido. A pagina SaaS e uma visao demonstrativa do dono da plataforma, sem acesso real de superadministrador.

Em producao, administrador da plataforma, administrador da transportadora, coletor e cliente exigirao identidades e permissoes distintas no servidor. Filtros de JavaScript nao oferecem essa seguranca. Nao compartilhar historicos, cota??es, cargas ou credenciais entre transportadoras. Credenciais e recursos do DistriHub continuam fora do projeto.

Validacao: 17 testes de dominio aprovados. Chrome local: solicitacao pelo cliente, ocultacao para outro cliente ficticio, proposta manual pelo administrativo, aceite unico, pagina SaaS sem valores/cobranca e regressao de equipe/coleta aprovados. Sem excecoes JavaScript. Homologacao com servidor, autenticacao, dispositivos distintos e cobrancas reais nao foi iniciada.


## Chat e administrativo financeiro - 2026-11-06

app/chat-domain.mjs e app/chat.mjs acrescentam conversas locais entre central e coletor, com autor, horario e referencia opcional de coleta atribuida. Reutilizam funcionarios ficticios de app/team.mjs. Perfis inativos e contextos diferentes sao recusados nas funcoes do exemplo. Nao ha envio entre dispositivos, notificacao push, criptografia de ponta a ponta, autenticacao real, leitura confirmada ou servico de chat.

app/finance-domain.mjs e app/finance.mjs acrescentam Administrativo, Faturamento e Despesas. Titulos sao registros manuais ficticios, sem emissao fiscal. Baixas parciais, saldo, vencimento, cancelamento justificado sem baixa e historico preservado sao simulados. Tentativas de excesso, repeticao com dados diferentes e cancelamento com baixa sao recusadas. Estorno, conciliacao bancaria, anexos, aprovacoes, fiscal e contabilidade completa nao estao implementados.

Graficos e resumo distinguem titulos de frete registrados, valores recebidos e despesas efetivamente baixadas no exemplo. Saldo de movimentacoes nao representa saldo bancario ou lucro contabil. Valor de cotacao nao gera faturamento automaticamente. Graficos usam o periodo informado e saldo a receber/pagar considera todo o contexto. Exportacao CSV contem somente resumo demonstrativo. Valores iniciais sao sinteticos, nao tarifas sugeridas ou desempenho real.

Decisao confirmada: faturamento dos fretes da transportadora separado da mensalidade SaaS do proprietario da plataforma, que continua sem precos/cobranca.

Validacao local: 27 testes de dominio aprovados e fluxos Chrome desktop/mobile conferidos (chat, texto escapado, faturamento manual, baixa parcial, excesso rejeitado, quitacao e despesa parcial). Sem excecoes JavaScript nos fluxos testados.

Este conjunto nao e uma gestao completa homologada para uso real: dados permanecem somente na memoria, permissao no JavaScript nao substitui autorizacao no backend e nenhuma operacao bancaria ou envio externo e executado. Contas, salarios, fornecedores e clientes reais nao devem ser inseridos. Autenticacao, isolamento, persistencia, sincronizacao, conciliacao e auditoria duravel exigem projeto e testes posteriores. Sem acesso ou mudancas no DistriHub.


## Ocorrencias padronizadas - 2026-11-06

O detalhe da carga permite apontar cliente ausente, endereco nao localizado, endereco localizado, recusa, avaria, divergencia de volumes, entrega parcial, documentacao pendente, nova tentativa combinada e outra ocorrencia. Registra detalhes ficticios, autor, horario e responsavel. Problemas abrem pendencia, com bloqueio de avanco explicitamente selecionado no exemplo. Endereco localizado e nova tentativa combinada sao informativos: nao criam ou resolvem pendencias e nao confirmam entrega automaticamente. Resolver uma pendencia requer acao separada e justificativa. Nao ha fotos/anexos, GPS, notificacao externa ou rastreamento real.

A aba Ocorrencias apresenta pendencias abertas e ate 30 eventos recentes no contexto da unidade. Historico completo de cada carga permanece em seu detalhe, somente na memoria. Campos de cliente ou endereco nao devem conter dados reais.

Validacao: 32 testes aprovados. Chrome local confirmou apontamento, pendencia, evento informativo e historico, sem marcar entrega automaticamente. Regressoes de equipe, cotacao, chat e financeiro passaram. Sem publicacao ou alteracao do DistriHub.


## Alocacao de ordens de coleta - 2026-11-06

A aba Alocacao e motoristas permite cadastrar OS de coleta ficticias, escolher motorista manualmente ou distribuir pendentes automaticamente. A selecao automatica utiliza distancia em linha reta, mesma unidade, motorista ativo e disponivel, capacidade demonstrativa de volumes e ausencia de outra OS ativa. Coordenadas devem ser ficticias e atualizadas ha no maximo 30 minutos; localizacao ausente, antiga ou futura impede escolha automatica. A escolha manual dispensa localizacao, preservando os demais criterios.

O motorista simulado aceita, inicia e confirma sua coleta. Liberacao antes do inicio exige justificativa e preserva historico. Vinculo opcional a carga e uma referencia: concluir OS nao entrega encomenda nem confirma recebimento no deposito. Motoristas tambem participam do chat demonstrativo.

A distribuicao em lote usa ordem de criacao e reserva sequencial na memoria, uma OS ativa por motorista. Nao e otimizacao global, GPS real, rota, ETA ou notificacao. Nao valida peso, cubagem, jornada ou compatibilidade do veiculo. Regras sao demonstrativas e precisam de validacao operacional. Autorizacao em JavaScript nao substitui backend; concorrencia real e sincronizacao entre dispositivos ainda nao existem.

Validacao: 41 testes de dominio aprovados. Chrome local confirmou atribuicao automatica e manual, aceite/inicio/coleta, liberacao, lote e layout mobile sem overflow; regressoes anteriores passaram sem excecoes JavaScript. Nenhum commit, push, publicacao ou alteracao do DistriHub.


## Custos e comprovantes - 2026-11-06

O portal do cliente e as notificações WhatsApp demonstrativas estão documentados em [PORTAL_CLIENTE.md](PORTAL_CLIENTE.md). O portal não compartilha os comprovantes internos descritos nesta seção.

Despesas incluem alimentacao, combustivel, pedagio e manutencao, alem das categorias existentes. Ao abrir Detalhes / baixa, o administrativo registra motorista ativo da mesma unidade, veiculo ficticio, referencia livre de viagem/OS, numero de documento, data, quilometragem, litros para combustivel e observacoes. Referencias de veiculo/OS sao texto, sem integridade referencial ou custo por km calculado. Detalhes nao mudam valor ou pagamentos; sem fechamento de viagem ou reembolso automatico.

Ate cinco comprovantes por despesa: PDF, PNG ou JPG, cada um ate 5 MB, apenas arquivos ficticios. Validacao de tamanho, MIME e assinatura inicial nao valida autenticidade nem substitui antivirus. Bytes sao copiados para memoria e permitem baixar copia; nenhum envio ou armazenamento persistente. Arquivos e dados somem ao recarregar. Anexo nao comprova pagamento, quitacao ou validade fiscal. Conta cancelada nao recebe detalhes/anexos. Historico preserva registro do anexo e alteracoes de detalhes.

Registro e anexos nesta etapa sao feitos na tela administrativa simulada; envio pelo motorista e aprovacao de reembolso ainda nao implementados. Para producao faltam autenticacao e autorizacao backend, Storage privado, isolamento, politicas de acesso, validacao/antivirus, auditoria duravel e retencao. Grafico continua separando despesas efetivamente pagas de saldo a pagar.

Validacao de dominio: 47 testes aprovados, incluindo contexto de empresa/unidade, motorista inativo, tipos e limites de arquivo, comprovante sem baixa e valores invalidos.

Chrome local confirmou detalhes de motorista/veiculo e anexo de PDF ficticio na memoria. Regressoes de alocacao, equipe, cotacao, chat, ocorrencias e financeiro passaram, com layouts desktop/mobile sem excecoes JavaScript. Sem commit, publicacao ou alteracao no DistriHub.
