# Vários endereços de coleta por cliente

Implementação local no app Logística; o ERP DistriHub não foi alterado.

## Uso

Em Gestão > Clientes, abrir **Endereços de coleta** no cliente. Cadastrar nomes como Loja Centro, Depósito ou Galpão, indicando endereço completo e filial responsável. Cada cliente pode ter vários locais; os campos principais de seu cadastro permanecem independentes. Os nomes devem ser diferentes dentro do mesmo cliente/filial.

Em Coletas, escolher cliente e filial, depois selecionar o local. O endereço preenchido fica somente para leitura; para usar um ponto diferente naquela OS, selecionar **Digitar endereço avulso**. Trocar cliente/filial remove uma seleção anterior incompatível. Locais inativos não aparecem como opção de novas coletas.

O endereço da OS é uma cópia no momento de sua criação. Editar ou inativar o cadastro de um local não modifica coletas anteriores. Não há exclusão física pelo usuário nem mudança de empresa/cliente/filial de um endereço existente.

## Banco e segurança

Nova migration `20261109211718_logistics_customer_pickup_addresses.sql`:

- Tabela `log_customer_pickup_addresses`, com FKs compostas, label/endereço limitados, unicidade por empresa/filial/cliente/nome, criador e horário do banco; auditoria pelo trigger existente.
- RLS e grants por coluna. Proprietário, administrativo e gerente acessam somente as filiais autorizadas. Cliente compartilhado pode ter endereços distintos por filial; isso não permite alterar seu cadastro principal nem expor locais de outra filial. Motoristas, coletores, contatos do portal e anon não recebem acesso ao cadastro; a OS autorizada conserva sua própria cópia do endereço.
- RPC `log_collection_from_address(uuid,jsonb)`, SECURITY INVOKER, search_path vazio, EXECUTE apenas para authenticated. O banco resolve e bloqueia o local selecionado para leitura, validando empresa, cliente, filial e atividade. O endereço textual enviado pelo navegador é ignorado quando há local selecionado. A criação continua pela RPC comercial existente, com as validações, ator, histórico e deduplicação originais.

Nenhuma migration histórica ou função comercial existente foi reescrita. O contrato de criação com endereço avulso permanece disponível. Se o endereço mudar/inativar entre uma tentativa incerta e seu retry, o resultado não é presumido equivalente: conferir a OS antes de iniciar outro pedido. O código não gera outra chave automaticamente para contornar uma recusa.

## Implantação pendente

Não foi aplicada migration remota, não houve commit/push/deploy nesta tarefa. Aplicar a nova migration somente após autorização, no projeto de logística, antes de publicar a interface. A instalação é transacional, com lock_timeout de cinco segundos. Cria objetos novos e FKs para os cadastros existentes; planejar a janela de locks e revisar advisors depois. Não faz backfill, não copia dados comerciais nem cria vínculos administrativos.

O formulário de coleta conserva o endereço avulso se os locais salvos estiverem indisponíveis; não inventa locais ou permissões. A API continua utilizando a sessão do próprio usuário, sem service_role. Limite de consulta: 500 locais autorizados; o painel de clientes filtra pelo cliente, e a lista operacional consulta o recorte autorizado da empresa.

## Verificação

`tests/database/pickup-addresses.test.mjs` aplica SQL em PGlite descartável: múltiplos locais, cliente compartilhado, cliente de filial, bloqueios entre empresas/filiais/papéis, campos imutáveis, endereço inativo, snapshot histórico, retry e endereço avulso.

`tests/pickup-addresses.test.mjs` verifica seleção, remoção de dados antigos e escaping. Os testes HTTP verificam autenticação, whitelist, função correta e escopo das edições. A jornada de navegador usa Chrome, dados HTTP sintéticos e larguras de 1440/390 pixels; não comprova Auth ou sessões reais do Supabase.

Homologação pendente: instalar em ambiente autorizado, executar com Auth real, conferir cadastros/grants/RLS efetivos, concorrência entre conexões independentes e sessões separadas. PGlite não comprova essa concorrência e o teste de Storage real existente permanece separado.

Resultado local: `npm test` executou 192 testes, com 191 aprovados, zero falhas e um teste de Storage real explicitamente ignorado. Chrome em 1440/390 px passou para proprietário, administrativo, gerente, motorista, coletor, cliente, sem vínculo, lista vazia e acesso negado. Nos perfis de gestão, a jornada incluiu cadastrar um terceiro local, inativar outro, retornar à coleta e selecionar o endereço ativo. Os testes de navegador aguardam a atualização efetiva da lista, e não apenas a remoção temporária do formulário durante o carregamento. Sintaxe dos módulos e `git diff --check` passaram.
