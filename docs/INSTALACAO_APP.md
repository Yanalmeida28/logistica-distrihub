# Instalar DistriHub Logística no dispositivo

Implementação local de PWA, ainda não publicada nesta etapa. Independente do ERP DistriHub; sem migrations, alterações de autenticação ou dados reais.

## Uso após publicar

- Abra https://logistica.distrihub.com.br/operacao/ e toque em **Instalar app**.
- Chrome/Edge compatíveis: o botão usa o convite nativo quando disponibilizado pelo navegador. Caso ainda não esteja disponível, apresenta instruções para o menu do navegador.
- iPhone/iPad: Safari → Compartilhar → Adicionar à Tela de Início. Se houver opção de abrir como app, mantenha-a ativada. Em iPads identificados como desktop, siga o mesmo procedimento manual.
- Mac/Safari: Adicionar ao Dock quando disponível. A disponibilidade varia conforme a versão do navegador/sistema.
- O aplicativo instalado abre a área operacional em janela própria, mantendo login e permissões. Pode ser necessário entrar novamente, especialmente no iOS. A instalação não cria conta nem configura Supabase.

## Arquitetura

Manifest próprio com ID e scope `/operacao/`, start URL `/operacao/?source=pwa`, nome da logística, display standalone, tema azul e ícones PNG 192/512 px (incluindo maskable) e Apple Touch Icon 180 px. Botão e ajuda estão na página estática de acesso, sem depender de sessão autenticada. A landing page fornece o atalho para essa área.

Worker servido em `/operacao/sw.js`, com o mesmo scope. Usa rede para navegação, sem Cache Storage, sem persistência de HTML autenticado, sem cache de API e sem fila offline de operações. Não intercepta POST, API, assets ou outras origens. Falha de rede na navegação apresenta página sem conexão, com orientação para conferir operações interrompidas antes de tentar novamente.

Não força atualização/recarregamento nem usa skipWaiting durante edição. Conteúdo e recursos são entregues pelo servidor com Cache-Control no-store; o registro solicita updateViaCache none. Não adiciona notificações push, sincronização em background, funcionamento operacional offline ou instalação em lojas.

Os recursos devem continuar no allowlist de `server.mjs`. O ZIP antigo não contém estes arquivos; atualizar o pacote caso volte a usar instalação manual. Nenhuma credencial foi incluída em manifest, worker, ícones ou instalador.

## Validação

145 testes aprovados, nenhuma falha, um teste com Storage real ignorado. Cinco testes específicos verificam manifest/ícones, convite nativo único e cancelamento, modo standalone, orientação iPhone e worker sem cache de API/operações. Smoke HTTP local confirma rotas, tipos MIME, cache-control, arquivos e botão; sintaxe JS/CSS e diff verificados.

Instalação física em Windows/Android/iPhone e registro do worker em HTTPS real permanecem para homologação após publicar. Não afirmar compatibilidade universal nem instalação concluída apenas porque o convite foi aceito.

Referências: https://web.dev/learn/pwa/installation e https://webkit.org/blog/13878/.
