# Endereços de destino por cliente

Atualização de publicação — 10/11/2026: migration instalada com sucesso no projeto exclusivo logistica-lab após autorização. A seção final descreve o estado da preparação local anterior. Publicação inclui contraste dos botões e bloqueio dos comandos enquanto a ficha carrega; não altera dados anteriores nem o ERP DistriHub.

Em Gestão → Clientes → Endereços de destino, cadastrar vários locais com nome e endereço completo. Cada local pertence à empresa, ao cliente e a uma filial responsável; pode ser editado ou inativado. Reutiliza o editor e a seleção dos endereços de coleta, mantendo cadastros separados.

Em Coletas → Nova ordem ou Recebimento → Registrar chegada direta, escolher Local de destino. O campo é preenchido e bloqueado enquanto um local salvo estiver selecionado. A alternativa Digitar endereço avulso permanece disponível. Trocar cliente ou filial limpa a seleção anterior. Apenas locais ativos do cliente e da filial escolhidos são oferecidos.

## Banco e segurança

Nova migration local: `20261110145933_logistics_customer_destination_addresses.sql`, posterior às migrations já existentes de endereços de coleta, busca e pendências. Não modifica migrations antigas nem registros existentes.

Cria `log_customer_destination_addresses`, índices, RLS, políticas, auditoria e `log_create_with_destination(uuid,text,jsonb)`. O wrapper é SECURITY INVOKER, com search_path vazio e sem EXECUTE para PUBLIC/anon. Resolve o destino com a sessão do usuário, conferindo empresa, filial, cliente e situação ativa; mantém lock compartilhado durante a criação. Delega aos contratos existentes de coleta ou chegada direta, inclusive quando ambos os endereços são salvos. Não fabrica coleta nem embarque.

O endereço efetivo fica copiado no campo destination da OS/carga. Edição ou inativação posterior não altera registros anteriores. Repetir a mesma criação mantém as guardas existentes de chave de repetição. Se o endereço mudar entre uma resposta incerta e o retry, o resultado não é presumido equivalente: a operação recusa a mudança, e a atendente deve conferir o registro antes de iniciar outro pedido.

## Validação e instalação

Suíte local: 198 testes, 197 aprovados, zero falhas e um ignorado (Storage real). SQL em PGlite valida destinos em coleta/chegada direta, ambos os endereços salvos, origem/etapa, idempotência, preservação do endereço, cliente incompatível, empresa/filial/papel e anon negados. HTTP valida o contrato e não aceita identidade forjada. Navegador usa dados e serviço HTTP fictícios; não substitui Auth/Storage reais.

Chrome aprovado em 1440 e 390 px, nos perfis proprietário, administrativo, gerente, motorista, coletor, cliente e sem acesso, além dos estados vazio e negado. Para os três perfis de central: cadastro de destino pelo cliente, seleção na OS e na chegada direta, preenchimento do endereço e regressão das jornadas existentes. Sem exceções JavaScript. O teste aguarda a liberação dos botões após gravar antes de navegar. `node --check` e `git diff --check` aprovados.

Migration ainda não aplicada remotamente. Código não publicado nesta tarefa. Antes de publicar, instalar e verificar a migration no projeto exclusivo da Logística, com autorização. DDL transacional e lock_timeout=5s; FKs e auditoria seguem o padrão existente. Não há mudanças no ERP DistriHub, portal, Meta ou permissões do cliente.
