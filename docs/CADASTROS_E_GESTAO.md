# Clientes, Administrativo e Configurações

Implementação local no app de logística. Nenhuma alteração no ERP DistriHub.

## Clientes

Proprietário e administrativo consultam os registros permitidos pelas políticas existentes. Cadastro organizado por identificação, contato e endereço; consulta com busca, filtro de filial, situação e paginação. Nome é obrigatório; demais dados são opcionais. CPF/CNPJ é informativo, sem validação fiscal externa.

O proprietário pode cadastrar clientes compartilhados; o administrativo cria e edita clientes nas filiais autorizadas, sem alterar clientes compartilhados. A edição não permite transferir filial ou empresa. Inativação preserva registros e cargas existentes. O servidor aceita somente campos explícitos; utiliza a sessão do usuário e RLS, sem chave de serviço.

Dados pessoais e observações ficam sujeitos à política de leitura já existente, inclusive contatos de cliente explicitamente vinculados. Não registrar segredos ou notas internas sensíveis nesse cadastro.

## Administrativo

Disponível para proprietário e administrativo. Contagens de filiais, clientes e veículos autorizados carregados (limite de 500 por cadastro) e atalhos de operação. Gestão de equipe permanece exclusiva do proprietário. Faturamento, despesas e mensalidade SaaS não são simulados como dados reais.

## Configurações

Conta conectada, empresa e perfil atuais, ambiente, orientações de instalação e atalhos permitidos. Troca de senha, edição cadastral da transportadora e ativação de integrações não estão implementadas nessa tela. Não há entrada de tokens ou alteração de permissões pelo navegador.

## Instalação pendente

Antes de usar o cadastro completo no ambiente publicado, revisar e aplicar, mediante autorização, `20261109045522_logistics_customer_profile.sql` exclusivamente no projeto de logística. A migration acrescenta colunas nullable com limites e grants de coluna; não modifica RLS, funções, filiais, identidades ou migrations anteriores. Não cria índices nem realiza backfill. `ALTER TABLE` exige lock exclusivo curto; agendar fora de operações concorrentes. Fazer backup e validar em homologação antes de qualquer aplicação externa.

Sem essa migration, somente a aba de clientes informa indisponibilidade; o workspace e os outros módulos continuam usando o contrato básico existente. Nenhuma migration externa ou publicação foi realizada durante este desenvolvimento.

Validação automatizada: payloads, escaping, navegação por perfil, HTTP com sessão/escopo de atualização e PostgreSQL descartável com RLS/ACL e dados sintéticos. Auth/Storage reais e revisão visual em dispositivos seguem dependentes da homologação.

## Compatibilidade na publicação

Enquanto a migration estiver pendente, um erro conhecido de coluna ausente conserva o cadastro básico existente (nome e filial). Falhas de permissão não usam esse fallback. O banco publicado não foi alterado nesta entrega.
