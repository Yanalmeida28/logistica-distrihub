# Direção visual

Paleta clara para uma interface suave e legível. Aparência não constitui certificação de segurança nem altera as limitações operacionais documentadas.

| Uso | Cor |
|---|---|
| Fundo | `#f3f7fa` |
| Superfície | `#ffffff` |
| Texto | `#253f4d` |
| Texto secundário | `#566e7b` |
| Ação principal | `#2c657b` |
| Menu selecionado | `#d8e9e9` |
| Confirmações | fundo `#e8f3ed`, texto `#35634b` |
| Pendências | fundo `#fbf0df`, texto `#83591e` |

Menu organizado em Operação, Relacionamento, Gestão e Plataforma. No celular, controle nativo details/summary recolhe o menu, identifica o módulo atual e fecha após navegar. Ao voltar para desktop o menu permanece expandido. Navegação e formulários mantêm foco visível e botões com pelo menos 44 px de altura.

Cartões com bordas suaves e sombras discretas, campos com contorno visível, texto ampliado e espaçamento consistente. Mesma direção aplicada à apresentação e à base operacional local. Estados continuam acompanhados por texto, sem depender só das cores.

Validação local: Chrome em 1440 e 390 px, navegação por clique e tecla Espaço, recolhimento após escolha, formulário de despesas, apresentação e base operacional. Sem exceções JavaScript ou overflow horizontal do documento nos fluxos testados. Contraste medido no botão principal: ao menos 4,5:1. Isso não representa auditoria completa de acessibilidade.

Sem publicação ou alteração de banco. As regras, os dados e o estado de preparação do Supabase permanecem conforme BASE_OPERACIONAL.md.
