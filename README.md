# DUIMP Hub · MVP operacional

Evolução do `duimp-hub-operacional-v8.html`, preservado integralmente em `reference/`. Frontend local de apoio à análise de uma operação de importação, com fluxo documental, comparação auditável e apresentação offline.

## Executar

Requer **Node.js 20 ou superior**. Nenhuma instalação de dependência é necessária para executar o produto.

```powershell
node server.mjs
```

Abra **http://127.0.0.1:4173**. O servidor aceita somente conexões locais. Para outra porta: `$env:PORT=4174; node server.mjs`.

No Windows, se Node.js não estiver instalado, clique com o botão direito em `abrir-duimp-hub.ps1` e escolha **Executar com PowerShell**. Ele serve a mesma aplicação localmente e abre o navegador. Se a política do Windows bloquear scripts, abra o PowerShell na pasta e execute `powershell -ExecutionPolicy Bypass -File .\abrir-duimp-hub.ps1`.

Módulos ES precisam do servidor HTTP: não abra `index.html` por duplo clique. A fonte Inter e o PDF.js estão incluídos em `vendor/`, com licenças. Não há CDN, telemetria ou dependência de internet no fluxo de demonstração.

## Demonstrar em aproximadamente 2 minutos

1. Clique em **Modo apresentação** ou **Iniciar demo de 2 minutos**.
2. O contexto e os textos demonstrativos de Invoice/Packing List são processados localmente. A comparação fica suspensa por falta de declaração complementar.
3. Clique em **Resolver pendência documental** e informe a finalidade, por exemplo “Uso hospitalar”.
4. Abra **Revisar documento**. Corrija os campos se necessário e marque a confirmação humana.
5. Clique em **Aprovar e simular envio**. O protocolo DEMO é gerado localmente e a projeção é reanalisada.
6. Mostre os quatro cenários, os fatores do motor, cada parcela do subtotal, o antes/depois e o agente de dúvidas.

Não há envio à ANVISA, MAPA, Siscomex ou terminal. Operações DEMO são identificadas em contexto, documentos, histórico e exportações. Para dados reais informados pelo usuário, o protocolo simulado **não remove** uma pendência real.

## Estrutura

```text
index.html                 estrutura de interface evoluída do v8
server.mjs                 servidor estático local, sem dependências
src/main.js                coordenação dos fluxos e eventos
src/components/            contexto, documentos, resultados, custo, histórico/painel
src/services/              estado e persistência local
src/engine/                extração, escala, pontuação, guardrails e custos
src/data/demo.js            cenário e documentos DEMO
src/data/tariffs/           catálogo tarifário versionado, com fontes e vigência
src/documents/             leitura TXT/PDF e checklist/rascunho
src/chat/                  base local v8, contexto ao vivo e contratos de providers
src/integrations/logcomex/  adapter MCP isolado
src/styles/                identidade v8 e refinamentos responsivos
src/utils/                 formatação e identificadores
vendor/                    PDF.js e Inter para uso offline
reference/                 v8 original, sem alterações
tests/                     testes de domínio e Playwright
docs/                      escopo tarifário, testes, configuração e entrega
```

## O que é real, calculado ou demonstrativo

- **REAL**: dado fornecido pelo usuário ou extraído do arquivo. Não comprova autenticidade, classificação fiscal ou aprovação por autoridade.
- **MOTOR**: extração heurística, pontuação e cálculo local. A mesma lista de fatores gera a pontuação e a auditoria.
- **SIMULAÇÃO / DEMO**: checklist de demonstração, documentos do cenário, rascunho e protocolo. Nenhum envio oficial.
- **FONTE EXTERNA**: retorno efetivo do MCP ou referência identificada do catálogo tarifário. Uma tabela local não é apresentada como consulta ao vivo.

## Custos

Leia [docs/TARIFFS.md](docs/TARIFFS.md). O catálogo inicial usa itens publicados do **Tecon Santos 2026**, para **house FCL, sem mudança de regime, 1 BL por contêiner, descarga no próprio terminal**. Compara permanências distintas no mesmo terminal, não precifica uma transferência para outro recinto nem o regime legal de “descarga direta”.

Exige terminal, escala/tamanhos, CIF em reais, datas/dias, características e serviços previstos. CIF individual pode ser informado; o rateio igual exige confirmação explícita. Casos fora do escopo ou sem dados suficientes mostram estimativa indisponível. Tarifas, mínimos, períodos, adicionais e fonte ficam no catálogo, sem fatores de custo arbitrários por TEU.

## Histórico e privacidade

As operações são salvas em `localStorage`, usando a chave do v8, sem corte silencioso em 50 registros. O chat usa somente `sessionStorage`. Os PDFs originais não são persistidos; ficam os campos extraídos, estado documental, fontes, fatores e log. Nenhuma credencial é armazenada no frontend.

Há fallback em memória e exportação de backup se o armazenamento estiver bloqueado, cheio ou inválido. Conteúdo inválido não é sobrescrito. Mudar host/porta/origem cria outro armazenamento do navegador; dados do HTML antigo em `file://` não são importados automaticamente para HTTP.

## LLM


O agente de dúvidas funciona com **base local**, sem LLM ativo. `LocalKnowledgeProvider`, `LLMProvider` e `OperationContextProvider` separam as responsabilidades. Integração futura com modelo exige implementação de serviço seguro no host/backend; o MVP não inclui uma integração generativa fictícia.

## Testes

```powershell
node --test tests/unit.test.js
```

Para os testes de navegador, instale a dependência de desenvolvimento (`npm install`) e tenha Chrome instalado, ou execute `npx playwright install chromium` e configure `BROWSER_CHANNEL=chromium`.

```powershell
node tests/e2e.mjs
```

O runner sobe seu próprio servidor local em porta separada, executa os casos Playwright e encerra o processo. Os resultados e screenshots ficam em `test-results/` (ignorado no Git). Veja [docs/TESTING.md](docs/TESTING.md) para a execução verificada e os limites de teste.

## Limites importantes

- Regras heurísticas, sem decisão regulatória, consulta oficial, SLA ou probabilidade de risco.
- Checklist genérico é demonstrativo; a declaração complementar não é universalmente exigida.
- Leitura local de texto/PDF, sem OCR, validação de assinatura ou autenticidade. Limites: 15 MB, 40 páginas e 200 mil caracteres por PDF.
- Catálogo de um terminal/modalidade. Combinações ambíguas de adicionais, hot stuffing, tarifas futuras não verificadas e serviços especiais exigem conferência comercial.
- Sem backend multiusuário, autenticação própria, sincronização ou integração produtiva com sistemas governamentais.

O profissional permanece responsável por conferir dados, requisitos, contratos e autorizações antes de executar uma operação.
