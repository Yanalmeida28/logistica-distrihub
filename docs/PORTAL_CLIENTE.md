# Portal do cliente e notificações WhatsApp

Estado: protótipo local, em memória, sem autenticação, banco, provider conectado ou publicação. Projeto independente do DistriHub.

## Como testar

1. Execute `node server.mjs`, abra `/app/` e entre em **Portal do cliente**.
2. Selecione um dos três contatos fictícios. O seletor de perfil serve para demonstrar telas e não representa login ou autorização real.
3. As cargas de exemplo possuem vínculos explícitos por ID de cliente, empresa e carga. O filtro de unidade restringe a exibição; nomes iguais nunca concedem acesso. Cargas recém-criadas não recebem vínculo automático.
4. Na visão Cliente, marque a preferência de WhatsApp e salve. Ela começa desativada. Não é necessário informar telefone.
5. Na tela Cargas, confirme uma etapa de uma carga vinculada ao contato, respeitando as pendências existentes. Volte ao portal: a etapa e a prévia de atualização aparecem. Nada é enviado.
6. Retire a preferência, confirme outro evento e volte ao histórico: a nova atualização aparece bloqueada, sem mensagem preparada. A revogação não apaga o histórico anterior.
7. Para documentos, selecione o terceiro contato e a Unidade A: a carga `LAB-0005` possui uma referência de triagem. Na visão Central, libere a referência. Na visão Cliente ela aparece; retirar o acesso a oculta imediatamente.

## Contrato demonstrativo

- Projeção do cliente contém rota, volumes, etapa atual, datas, resumo das ocorrências e referências liberadas. Não recebe texto livre das notas operacionais, autores, responsáveis internos, chat, contas ou anexos de despesas.
- Ocorrências usam categorias conhecidas ou um resumo genérico de atendimento. Não se presume entrega, resolução ou documentação regular apenas pela existência de um registro.
- Compartilhamento exige empresa, cliente e carga vinculados, documento existente e contexto administrativo. Cada referência é liberada explicitamente. Não existem arquivos documentais para baixar no portal nesta etapa, apenas referências textuais.
- Alterações de cargas passam pelo observador comum em `main.mjs`. Eventos novos de etapas confirmadas e ocorrências preparam registros demonstrativos para contatos vinculados. Vínculos documentais e atribuição de coleta, por si sós, não geram aviso de movimentação confirmada.
- Não há backfill dos eventos iniciais, de cargas importadas ou quando o contato autoriza notificações. Só eventos acrescentados após o estado anterior são avaliados. Não há reenvio após revogação/reativação.
- Chave de deduplicação combina empresa, carga, índice do evento e contato. Reescrita ou redução de histórico é recusada. Essa regra em memória não substitui IDs persistentes e transações no backend.
- Provider WhatsApp permanece desativado. Estados são `simulated_not_sent` ou `blocked_no_consent`; não existem estados de envio real, entrega ou leitura. Nenhum telefone, token ou mensagem sai da página. CSP mantém `connect-src 'none'`.
- Todos os perfis, vínculos, consentimentos e históricos são fictícios e desaparecem ao recarregar. Não inserir documentos ou informações reais.

## Evolução necessária para uso real

1. Implementar identidade autenticada, vínculos confiáveis cliente/contato/carga, escopos de empresa e unidade, autorização no backend e testes de acesso direto. O seletor de demonstração deve ser removido do fluxo real do cliente.
2. Persistir eventos e preferências auditáveis, com revogação, documentos em armazenamento privado e autorização a cada consulta/download. Definir quais ocorrências e documentos podem ser publicados ao cliente.
3. Construir integração própria com WhatsApp oficial para este produto: credenciais somente no backend e isoladas por transportadora, configuração de destinatários e consentimentos, mensagens/templates aprovados quando aplicável, fila transacional, limites, deduplicação, rechecagem de consentimento antes do envio e tratamento de resultado incerto.
4. Validar webhooks assinados, segregação de contas, estados de entrega/leitura, custos e retenção em ambiente isolado com dados sintéticos, antes de ativar envios.

Nenhum componente, credencial, banco ou recurso do WhatsApp do DistriHub foi reutilizado ou alterado. Não foi criada conexão com a Meta.

## Verificação desta etapa

55 testes de domínio aprovados, incluindo vínculos, contexto de empresa/unidade, projeção sem notas internas, liberação/revogação, consentimento, bloqueio, deduplicação e recusa de histórico reescrito. Chrome local validou fluxo integrado, documentos, consentimento, eventos automáticos simulados e filtros; layouts 1440/390 px sem overflow ou exceções JavaScript nos fluxos executados. Regressões de equipe, cotação, chat, financeiro, despesas, ocorrências e alocação passaram.
