# Acesso e configuração inicial

- Login autentica uma conta existente; não cadastra transportadora automaticamente.
- Sem empresa acessível, aparece uma tela dedicada ao primeiro acesso, sem o menu operacional vazio.
- Funcionários e clientes consultam e aceitam os convites existentes para seu e-mail confirmado, pelos contratos atuais de equipe e portal.
- O proprietário abre explicitamente a configuração da transportadora. Nome da empresa e unidade principal (por exemplo, Matriz) continuam obrigatórios e são criados atomicamente pela RPC existente.
- Outras filiais são cadastradas posteriormente no módulo Filiais. Uma empresa já vinculada abre diretamente a operação.
- Cadastro público de contas e recuperação de senha não foram implementados nesta alteração. Contas continuam provisionadas pelo responsável pela homologação.

Nenhuma alteração de Auth, banco, RLS, permissões ou implantação faz parte desta entrega local. Testes automatizados não substituem validação do primeiro acesso com identidades de homologação.
