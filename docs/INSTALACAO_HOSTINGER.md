# Instalação do pacote Logística na Hostinger

Domínio escolhido: **https://logistica.distrihub.com.br**.

Este pacote prepara a aplicação para instalação e homologação. Não representa aprovação para uso com dados reais. Não contém credenciais, usuários, arquivos de ambiente, documentos comerciais, node_modules ou migrations. Não executa alterações no banco automaticamente.

## Enviar o ZIP

1. No hPanel, use a opção de aplicação Node.js/Web App e upload de arquivos ZIP. Se essa opção não existir no plano, não use o Gerenciador de Arquivos como substituto: o backend precisa de um processo Node.js.
2. Selecione somente o domínio logistica.distrihub.com.br e uma aplicação/pasta independente. Não utilize a pasta, as variáveis, as credenciais ou a aplicação do DistriHub.
3. Envie o ZIP. O package.json e os servidores estão diretamente na raiz do arquivo.
4. Escolha Node.js 22 ou 24 e o tipo de aplicação Other/Outro, quando necessário.
5. Arquivo de entrada: **server.hostinger.mjs**. Se houver campo de comando de inicialização, use **npm run start:hostinger**. Instalação de dependências: **npm ci --omit=dev**. Não existe etapa de compilação do frontend: os arquivos já são HTML/CSS/JavaScript. Se o painel exigir build, **node --check server.hostinger.mjs** apenas valida a entrada. A raiz do projeto contém os arquivos; não há pasta dist.
6. A porta é lida de PORT, fornecida pela plataforma. A entrada de hospedagem configura o domínio permitido e a escuta em 0.0.0.0. Não fixe uma porta diferente no painel sem verificar a configuração da aplicação.
7. Ative/confira o HTTPS do subdomínio antes de testar login. A API exige Host logistica.distrihub.com.br e Origin https://logistica.distrihub.com.br. Não confia em cabeçalhos de encaminhamento para ampliar essa lista.

Referência oficial: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/.

## Configuração do banco separado

Sem configuração, a página de apresentação e a demonstração abrem, mas a operação autenticada fica bloqueada. Essa é a condição inicial esperada.

Para homologação autorizada, configure no painel as variáveis abaixo, sem enviar seus valores pelo chat ou incluí-los no ZIP:

- LOGISTICS_DATABASE_MODE: homologation.
- LOGISTICS_PROJECT_REF: cbbvmtinbgsmehthlhgn.
- LOGISTICS_SUPABASE_URL: https://cbbvmtinbgsmehthlhgn.supabase.co.
- LOGISTICS_PUBLISHABLE_KEY: chave publishable desse projeto independente, obtida no painel Supabase. Nunca usar service_role, chave secreta ou a chave do ERP.
- NODE_ENV: production, para o runtime hospedado.

O pacote não configura essas variáveis e não lê nem copia o arquivo de ambiente existente no computador. O projeto DistriHub kcxefjgchxhvcfppglvp é recusado pela configuração de homologação.

## Conferência após instalar

- `/`: apresentação do projeto.
- `/app/`: demonstração com dados fictícios em memória; seleção de perfil não é login.
- `/operacao/`: aplicação autenticada, condicionada à configuração do banco e contas válidas.
- `/api/status`: deve responder sem chaves ou tokens; configured=false é esperado até configurar o banco.
- Sem sessão, APIs operacionais continuam negadas. Cookies de sessão usam HttpOnly, SameSite=Strict e Secure na hospedagem.
- Não há usuário/senha padrão. Contas, vínculos e empresas precisam ser preparados separadamente no projeto de homologação. Não reaproveitar usuários ou dados do DistriHub.
- Sessões e limite de login estão em memória: executar inicialmente somente uma instância, sem múltiplos workers ou autoscaling. Reiniciar encerra sessões; homologar o comportamento antes de uso real.
- Confirmar domínio, HTTPS, gateway, Auth, RLS, permissões por empresa/filial, Storage privado e jornadas autenticadas antes de usar dados reais.

WhatsApp/Meta, GPS, cobrança de mensalidades e emissão fiscal não são ativados por este pacote. O ZIP não publica a aplicação, não altera DNS, não cria contas e não aplica migrations.
