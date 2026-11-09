# Área autenticada por tarefa

Atualização posterior: o recebimento direto e a ficha única estão descritos em [RECEBIMENTO_DIRETO.md](RECEBIMENTO_DIRETO.md). Cargas agora tem consulta própria para ambas as origens; os trechos abaixo sobre ausência de recebimento direto registram o estado da etapa anterior.

Base do checkout: `bb2860a6a3d751c05562d83e017b44974ccddd2b`, preservando e adaptando a reorganização administrativa local que já existia. Nenhum AGENTS.md aplicável foi encontrado no repositório nem nos diretórios ancestrais verificados.

## Navegação

- Proprietário/administrativo: Hoje, Coletas, Recebimento, Cargas, Pendências, Gestão, Portal e documentos, Chat da central.
- Motorista/coletor: Minhas coletas primeiro, chat, convites e conta.
- Cliente: Minhas cargas primeiro, pelo portal existente; convites e conta.
- Sem perfil ativo: aviso de acesso indisponível e convites, sem consulta interna de ordens.
- Gestão reúne os cadastros existentes de clientes, filiais, veículos, equipe/convites e configurações. Gestão de equipe e criação de filiais continuam exclusivas do proprietário; nenhuma permissão foi ampliada.

## Etapas e registros

Uma única instância da tela de coletas atende Coletas, Recebimento, Cargas e Pendências. Trocar de tarefa filtra o resultado já autorizado, sem nova consulta por tarefa, sem duplicar formulários nem executar mutações.

- Coletas: pendentes, atribuídas, aceitas e em coleta.
- Recebimento: coletas confirmadas no cliente, aguardando entrada na central. Apenas a confirmação existente da OS; recebimento direto não foi implementado.
- Cargas: recebidas, embarcadas, na unidade de destino, em entrega ou entregues, conforme os eventos existentes.
- Pendências: coletas aguardando atribuição e coletas confirmadas aguardando recebimento. Não infere atrasos, ausência de documentos nem pendências financeiras.
- Hoje: prioridades no recorte das até 100 ordens recentes, com até cinco itens prioritários. Não é filtro por data de criação. Cada item abre a OS correspondente, com retorno à lista. Registro fora do recorte ou sem acesso mostra aviso, sem inventar busca privilegiada.

Busca, filial e página da lista são preservadas ao abrir e voltar de um registro. Formulários em edição impedem troca destrutiva entre tarefas/registros. Falhas 401/403 removem os dados da lista e exibem orientação; não são tratadas como lista vazia.

## Verificação

- `npm test`: testes de contratos, navegação, filtros, deep links e regressões PostgreSQL existentes, em base descartável. O teste de Storage real continua condicionado a uma stack isolada.
- `node tests/browser/task-navigation.mjs`: Chrome real em 1440 e 390 px, HTTP sintético isolado, cobrindo proprietário, administrativo, motorista, coletor, cliente, sem perfil, lista vazia e acesso negado. Hoje → Recebimento → registro → lista; Coletas → busca → registro → retorno com busca preservada; Cargas, Pendências, Gestão/clientes, portal/documentos e chat. Sem overflow horizontal ou exceções JavaScript nos cenários testados.
- `git diff --check` e validação de sintaxe dos módulos alterados.

O teste de navegador não autentica usuários reais nem comprova autorização no Supabase. Não foram enviados formulários de confirmação, convites ou mensagens. Nenhuma alteração em banco, backend, autenticação, migrations ou regras comerciais integra esta tarefa; sem push ou deploy.
