# Integrações e modos de operação

## LogcomexMcpAdapter

Arquivo: `src/integrations/logcomex/adapter.js`.

Estados: conectado; autenticação necessária; indisponível; erro; modo demonstração. O modo DEMO retorna antes de acessar qualquer transporte externo.

A ponte compatível com o v8 usa a capability `window.claude.use('mcp')` somente dentro desse módulo. O servidor referenciado pelo projeto original é `https://platform.logcomex.ai/mcp`. Não existe um login do cliente MCP neste frontend: conexão e autenticação pertencem ao ambiente que hospeda essa capability.

O contrato preservado tenta `listTools('Logcomex.ai')`, `list_agents`, `chat_with_agent` e, quando necessário, `get_task_status`. IDs de agente vêm da descoberta: nenhum ID contratado é inventado ou usado como fallback. Múltiplos agentes exigem seleção no host/adapter. Chamadas têm timeout e resultado vazio, erro ou tarefa incompleta não são exibidos como retorno real.

Um host alternativo pode instanciar:

```js
const adapter = new LogcomexMcpAdapter({
  getTransport: async () => hostAuthenticatedMcpTransport,
  timeout: 8000
});
```

O transporte precisa oferecer as duas funções `listTools` e `callTool` no contrato acima. Para usar outro contrato, adapte este módulo. Credenciais devem ficar no host autenticado ou em um backend. Não adicione token ao HTML, ao JavaScript distribuído ou ao localStorage.

Somente NCM e descrição resumida são usados na consulta de panorama acionada pelo usuário. O retorno é texto escapado, com a origem e data de consulta. Ele não é convertido automaticamente em tarifa, regra administrativa ou pontuação.

**Verificação:** estados e formatos de resposta cobertos por mocks no navegador e testes de domínio. Não foi executada consulta produtiva autenticada à Logcomex; o contrato do fornecedor pode exigir ajustes no ambiente real.

## Agente de dúvidas

`OperationContextProvider` entrega cópias profundas do contexto ao vivo. `LocalKnowledgeProvider` consulta a base preservada e refinada do v8. O agente guarda a conversa apenas na sessão da aba e não recebe função para atualizar a operação.

`LLMProvider` define um contrato opcional de chamada a um serviço seguro. Não há LLM ativo ou credenciais no MVP. O comportamento testado e entregue é o provider local, inclusive offline. O adapter generativo não deve ser ativado sem implementar autenticação no servidor, tratamento de dados e fallback para base local.
