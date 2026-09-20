import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{
  if(!process.env.PLAYWRIGHT_PACKAGE)throw new Error('Instale as dependências de desenvolvimento: npm install.');
  playwright=require(process.env.PLAYWRIGHT_PACKAGE);
}
const port=process.env.TEST_PORT||'4175',url=`http://127.0.0.1:${port}`;
const output=path.join(root,'test-results');await mkdir(output,{recursive:true});
const server=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:port},cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
const channel=process.env.BROWSER_CHANNEL||'chrome';
const results=[];let browser;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<50;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await pause(100);}throw new Error('Servidor de testes não iniciou.');}
async function stateOf(page){return page.evaluate(async()=>JSON.parse(JSON.stringify((await import('/src/services/state.js')).state)));}
async function choice(page,text){await page.locator('.choices button:not([disabled])').getByText(text,{exact:true}).click();}
async function answer(page,text){await page.locator('#free-input').fill(text);await page.locator('#free-input').press('Enter');}
async function demo(page,n=3){if(n===3)await page.getByRole('button',{name:'Modo apresentação',exact:true}).click();else await page.getByRole('button',{name:'Demo simples',exact:true}).click();await page.waitForFunction(async()=>!!(await import('/src/services/state.js')).state.result);}
async function finishDemo(page){await page.getByRole('button',{name:'Resolver pendência documental',exact:true}).click();await answer(page,'Uso hospitalar');await page.getByRole('button',{name:'Revisar documento',exact:true}).click();await page.locator('#review-confirm').check();await page.locator('#approve-document').click();}
async function resultsTab(page){await page.locator('[data-view="results"]').click();}
async function askHelp(page,q){const before=await page.locator('.faq-msg.agent').count();await page.locator('#faq-input').fill(q);await page.locator('#faq-input').press('Enter');await page.waitForFunction(n=>document.querySelectorAll('.faq-msg.agent').length>n&&!document.querySelector('#faq-thinking'),before);return page.locator('.faq-msg.agent').last().innerText();}
function textFile(name,text){return {name,mimeType:'text/plain',buffer:Buffer.from(text)};}
function invoicePdf(){
  const lines=['Commercial Invoice: INV-TEST-001','Importador: Importadora Teste Ltda.','Mercadoria: Pecas automotivas','NCM: 87089990'];
  const stream='BT /F1 12 Tf 50 760 Td '+lines.map((line,i)=>(i?'0 -22 Td ':'')+'('+line.replace(/[()\\]/g,'\\$&')+') Tj').join('\n')+' ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let data='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(data);data+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return {name:'commercial_invoice_test.pdf',mimeType:'application/pdf',buffer:Buffer.from(data)};
}
async function test(name,fn,{setup,viewport={width:1440,height:1000}}={}){
  const context=await browser.newContext({viewport});const errors=[],external=[];const page=await context.newPage();page.setDefaultTimeout(7000);
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==url){external.push(route.request().url());return route.abort();}return route.continue();});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const start=Date.now();
  try{if(setup)await setup(context);await page.goto(url);await fn({page,context,errors,external});assert.deepEqual(errors,[],'Erros de console/página');assert.deepEqual(external,[],'Requisições externas inesperadas');results.push({name,status:'passed',ms:Date.now()-start});console.log('PASS '+name);}
  catch(error){results.push({name,status:'failed',ms:Date.now()-start,error:error.stack,consoleErrors:errors});await page.screenshot({path:path.join(output,`failure-${results.length}.png`),fullPage:true}).catch(()=>{});console.error('FAIL '+name+'\n'+error.message);}
  finally{await context.close();}
}

try{
  await waitServer();browser=await playwright.chromium.launch({headless:true,...(channel==='chromium'?{}:{channel})});
  await test('01 abre offline, assets locais, tema e persistência',async({page})=>{
    await page.getByText('Do contexto à próxima ação.',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'home-light.png')});
    await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.screenshot({path:path.join(output,'home-dark.png')});
    await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  });
  await test('02 texto livre extrai escala e não repete campos conhecidos',async({page})=>{
    await page.getByRole('button',{name:/Analisar nova operação/}).click();
    await page.locator('#freeform-operation').fill('Tenho uma importação urgente de medicamentos, NCM 30049099, 4 contêineres de 40 pés, aguardando ANVISA. Transporte já está programado mas ainda não confirmamos a janela.');
    await page.getByRole('button',{name:'Analisar texto',exact:true}).click();
    const s=await stateOf(page);assert.equal(s.op.containers40,4);assert.equal(s.op.descricao,'medicamentos');assert.equal(s.op.janela,'Ainda não sabemos');
    const agent=await page.locator('#chat-body .msg.agent').allTextContents();assert.ok(!agent.some(x=>/Qual é o NCM|Qual é a escala|O transporte já/.test(x)));assert.match(agent.at(-1),/estrutura logística/);
    await choice(page,'Sim');await choice(page,'Não');await choice(page,'Alta');assert.match(await page.locator('.result-hero').innerText(),/Comparação suspensa/);assert.match(await page.locator('.estimate-unavailable').innerText(),/CIF/);
  });
  await test('03 questionário guiado, validações, Enter e nova operação',async({page})=>{
    await page.getByRole('button',{name:/Analisar nova operação/}).click();await page.locator('#guided-start-btn').click();
    await answer(page,'123');assert.match(await page.locator('#chat-body').innerText(),/8 dígitos/);await answer(page,'87089990');await answer(page,'Peças automotivas');await answer(page,'navio chegando');assert.match(await page.locator('#chat-body').innerText(),/não define a escala/);await answer(page,'3x20 + 2x40');
    for(const v of ['Crítica','Não','Não','Sim','Sim','Sim','Não','Alta'])await choice(page,v);
    assert.equal((await stateOf(page)).result.directAvailable,true);assert.match(await page.locator('.result-hero').innerText(),/retirada direta/);await page.locator('[data-view="analysis"]').click();await page.locator('#new-op-btn').click();assert.deepEqual((await stateOf(page)).op,{});
  });
  await test('04 demo completa, revisão obrigatória, protocolo e reanálise',async({page})=>{
    await demo(page);let s=await stateOf(page);assert.equal(s.result.hardBlocked,true);assert.deepEqual(s.documentIssue.missing,['Declaração complementar']);assert.ok(s.documents.every(d=>d.demo&&d.extractionMode==='demo'));
    await resultsTab(page);assert.equal(await page.locator('.option-card h3').filter({hasText:'Comparação suspensa'}).count(),4);await page.locator('[data-view="analysis"]').click();
    await page.getByRole('button',{name:'Resolver pendência documental',exact:true}).click();assert.match(await page.locator('#chat-body .msg.agent').last().innerText(),/finalidade/);await answer(page,'Uso hospitalar');
    await page.evaluate(()=>window.approveAndSendDocument());assert.equal((await stateOf(page)).protocol,null);
    await page.getByRole('button',{name:'Revisar documento',exact:true}).click();assert.equal(await page.locator('#approve-document').isDisabled(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#doc-modal').isVisible(),false);await page.getByRole('button',{name:'Revisar documento',exact:true}).click();
    await page.locator('#review-confirm').check();await page.locator('[data-draft-field="finalidade"]').fill('Uso hospitalar revisado');assert.equal(await page.locator('#approve-document').isDisabled(),true);
    await page.locator('#review-confirm').check();await page.screenshot({path:path.join(output,'review-human.png')});await page.locator('#approve-document').click();
    s=await stateOf(page);assert.match(s.protocol.id,/^DEMO-/);assert.equal(s.documents.length,3);assert.equal(s.op.pendencia,'Sim');assert.equal(s.result.directAvailable,true);assert.equal(s.simulationResolved,true);assert.ok(s.afterSnapshot);assert.ok(s.costEstimate.available);
    await page.evaluate(()=>window.approveAndSendDocument());assert.equal((await stateOf(page)).documents.length,3);
    await page.locator('#audit-panel summary').click();assert.match(await page.locator('.audit-body').innerText(),/Urgência crítica/);assert.equal(await page.locator('#audit-panel summary').getAttribute('aria-expanded'),'true');
    await page.locator('#audit-panel summary').click();await page.screenshot({path:path.join(output,'results-demo.png')});
  });
  await test('05 upload PDF real e TXT, extração e escala documental',async({page})=>{
    await page.locator('#doc-input').setInputFiles([invoicePdf(),textFile('packing.txt','Packing List: PL-TEST-001\n3x20 + 2x40\n12 volumes')]);
    await page.waitForFunction(async()=>{const s=(await import('/src/services/state.js')).state;return s.documentIssue&&s.documents.every(d=>d.status!=='Lendo…');});
    const s=await stateOf(page);assert.equal(s.documents[0].read,true);assert.equal(s.documents[0].validated,true);assert.equal(s.documents[0].extractionMode,'real');assert.equal(s.op.ncm,'87089990');assert.equal(s.op.importador,'Importadora Teste Ltda.');assert.equal(s.op.containers20,3);assert.equal(s.op.containers40,2);assert.equal(s.documents[1].extracted.volumes,'12 volumes');
    await page.locator('#guided-start-btn').click();assert.match(await page.locator('#chat-body .msg.agent').last().innerText(),/urgência/);assert.ok(!s.documents[0].extracted.valor);
  });
  await test('06 arquivo ilegível, PDF inválido e vazio falham sem inventar leitura',async({page})=>{
    await page.locator('#doc-input').setInputFiles([textFile('invoice.txt','Apenas texto sem identificação'),{name:'packing.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid PDF')},{name:'photo.png',mimeType:'image/png',buffer:Buffer.from([1,2,3])},textFile('empty.txt','')]);
    await page.waitForFunction(async()=>!!(await import('/src/services/state.js')).state.documentIssue);
    const s=await stateOf(page);assert.equal(s.documents.length,4);assert.equal(s.documents.filter(d=>d.validated).length,0);assert.equal(s.documentIssue.canGenerate,false);assert.deepEqual(s.documents[1].extracted,{});assert.match(s.documents[1].error,/Não foi possível extrair/);assert.match(s.documents[3].error,/vazio/);
  });
  await test('07 resolver documento pede todos os dados ausentes, preserva pendência real',async({page})=>{
    await page.getByRole('button',{name:/Analisar nova operação/}).click();await page.locator('#freeform-operation').fill('Importação urgente de medicamentos NCM 30049099, 4 contêineres de 40 pés, aguardando ANVISA.');await page.locator('#freeform-analyze-btn').click();
    await page.locator('#doc-input').setInputFiles([textFile('invoice.txt','Commercial Invoice\nNCM: 30049099'),textFile('packing.txt','Packing List')]);await page.waitForFunction(async()=>!!(await import('/src/services/state.js')).state.documentIssue?.canGenerate);
    await page.locator('#pendency-box').getByRole('button',{name:'Resolver com o agente',exact:true}).click();
    for(const [label,value] of [['importador','Importadora Real Informada'],['invoice','INV-USER-1'],['packing','PL-USER-1'],['volumes','12 volumes'],['finalidade','Revenda']]){assert.match((await page.locator('#chat-body .msg.agent').last().innerText()).toLowerCase(),new RegExp(label));await answer(page,value);}
    await page.getByRole('button',{name:'Revisar documento',exact:true}).click();await page.locator('#review-confirm').check();await page.locator('#approve-document').click();
    const s=await stateOf(page);assert.equal(s.demo,false);assert.equal(s.op.pendencia,'Sim');assert.equal(s.result.hardBlocked,true);assert.match(await page.locator('.result-hero').innerText(),/suspensa/);
  });
  await test('08 histórico abre detalhes e painel deriva métricas das operações',async({page})=>{
    await demo(page,1);await page.locator('[data-view="dashboard"]').click();assert.equal(await page.locator('.kpi').filter({hasText:'Operações analisadas'}).locator('.kpi-value').innerText(),'1');
    await page.locator('[data-view="analysis"]').click();await page.locator('#presentation-btn').click();await page.getByRole('button',{name:'Resolver pendência documental',exact:true}).waitFor();await finishDemo(page);
    await page.locator('[data-view="dashboard"]').click();for(const [label,n] of [['Operações analisadas','2'],['Pendências detectadas','1'],['Resolvidas na simulação','1'],['Documentos processados','3']])assert.equal(await page.locator('.kpi').filter({hasText:label}).locator('.kpi-value').innerText(),n);
    const op=(await stateOf(page)).id;await page.locator('[data-view="history"]').click();assert.equal(await page.locator('[data-history-id]').count(),2);await page.locator(`[data-history-id="${op}"]`).click();assert.equal((await stateOf(page)).id,op);assert.equal((await stateOf(page)).documents.length,3);assert.match(await page.locator('.result-hero').innerText(),/retirada direta/);
  });
  await test('09 agente contextual, memória de sessão e nenhuma mutação da operação',async({page})=>{
    await demo(page);const before=JSON.stringify((await stateOf(page)).op);await page.locator('#faq-toggle').click();
    const queries=[['O que é DUIMP?',/Declaração Única/],['O que é LPCO?',/Licenças, Permissões/],['O que é anuência?',/controle administrativo/],['Qual a diferença entre retirada direta e recinto?',/Não existe vencedor universal/],['Quais documentos tenho nessa operação?',/Invoice/],['O que está faltando?',/Declaração complementar/],['Por que deu recinto?',/Comparação suspensa/],['Por que retirada direta não está disponível?',/Comparação suspensa/],['Como esse custo foi calculado?',/Subtotal logístico/],['Qual o próximo passo?',/declaração complementar/],['Qual a escala dessa operação?',/4×40/]];
    for(const [q,expected] of queries)assert.match(await askHelp(page,q),expected,q);
    assert.equal(JSON.stringify((await stateOf(page)).op),before);assert.equal(await page.locator('#faq-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('#faq-panel').getAttribute('aria-hidden'),'true');
    const memory=await page.evaluate(()=>sessionStorage.getItem('duimpHubFaqSessionV3'));assert.ok(memory.includes('Qual a escala'));await page.reload();await page.locator('#faq-toggle').click();assert.match(await page.locator('#faq-body').innerText(),/Qual a escala/);
  });
  await test('10 custo editável, discriminação, insuficiência e terminal não cadastrado',async({page})=>{
    await demo(page,1);await resultsTab(page);await page.locator('.calculation-detail>summary').click();assert.match(await page.locator('.cost-table').first().innerText(),/Handling in/);assert.match(await page.locator('.cost-table').first().innerText(),/Subtotal logístico/);
    await page.locator('#cost-parameters>summary').click();await page.locator('#cost-cif').fill('');await page.getByRole('button',{name:'Calcular subtotal',exact:true}).click();assert.match(await page.locator('.estimate-unavailable').innerText(),/CIF/);
    await page.locator('#cost-cif').fill('800.000');await page.locator('#cost-escala').fill('8 TEU');await page.getByRole('button',{name:'Calcular subtotal',exact:true}).click();assert.match(await page.locator('.estimate-unavailable').innerText(),/20 e 40/);
    await page.locator('#cost-escala').fill('4×40 pés');await page.locator('#cost-terminal').selectOption('other');await page.getByRole('button',{name:'Calcular subtotal',exact:true}).click();assert.match(await page.locator('.estimate-unavailable').innerText(),/Tarifa não cadastrada/);
    await page.locator('#cost-terminal').selectOption('tecon-santos');await page.getByRole('button',{name:'Calcular subtotal',exact:true}).click();assert.ok((await stateOf(page)).costEstimate.available);
  });
  await test('11 MCP sem cliente e autenticação necessária: nenhum retorno fictício',async({page})=>{
    await page.getByRole('button',{name:/Analisar nova operação/}).click();await page.locator('#freeform-operation').fill('Importação de peças NCM 87089990');await page.locator('#freeform-analyze-btn').click();await page.getByRole('button',{name:'Consultar fonte externa',exact:true}).click();assert.match(await page.locator('#chat-body').innerText(),/Consulta externa indisponível/);assert.equal((await stateOf(page)).logcomexData.real,false);
    await page.evaluate(()=>{window.claude={use:async()=>({listTools:async()=>({servers:[{authStatus:'needs_reauth'}]})})};});await page.getByRole('button',{name:'Consultar fonte externa',exact:true}).click();assert.match(await page.locator('#logcomex-status-text').innerText(),/autenticação necessária/);
  });
  await test('12 localStorage bloqueado: aviso, memória e backup',async({page})=>{
    await demo(page,1);assert.equal(await page.locator('#app-notice').isVisible(),true);await page.locator('[data-view="history"]').click();assert.equal(await page.locator('[data-history-id]').count(),1);
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar backup do histórico',exact:true}).click();const dl=await downloadEvent;const contents=JSON.parse(await readFile(await dl.path(),'utf8'));assert.equal(contents.operations.length,1);
  },{setup:context=>context.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('blocked','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('blocked','SecurityError');}});})});
  await test('13 histórico corrompido é preservado sem sobrescrita silenciosa',async({page})=>{
    assert.match(await page.locator('#app-notice').innerText(),/inválido/);await demo(page,1);assert.equal(await page.evaluate(()=>localStorage.getItem('duimpHubAnalysesDocumentalV2')),'{corrupt');await page.locator('[data-view="history"]').click();assert.equal(await page.locator('[data-history-id]').count(),1);
  },{setup:context=>context.addInitScript(()=>localStorage.setItem('duimpHubAnalysesDocumentalV2','{corrupt'))});
  await test('14 exportação carrega origem, fatores, simulação e memória de custos',async({page})=>{
    await demo(page);await finishDemo(page);const promise=page.waitForEvent('download');await page.locator('#view-results .page-head').getByRole('button',{name:'Exportar resumo',exact:true}).click();const dl=await promise,text=await readFile(await dl.path(),'utf8');for(const pattern of [/DEMO — OPERAÇÃO FICTÍCIA/,/Guardrails:/,/SUBTOTAL LOGÍSTICO-OPERACIONAL ESTIMADO/,/Handling/,/santosbrasil.com.br/,/nenhum envio oficial/])assert.match(text,pattern);
  });
  await test('15 remover declaração invalida a resolução e suspende novamente',async({page})=>{
    await demo(page);await finishDemo(page);await page.locator('[data-view="analysis"]').click();await page.getByRole('button',{name:'Remover declaracao_complementar_simulada.txt',exact:true}).click();const s=await stateOf(page);assert.equal(s.protocol,null);assert.equal(s.simulationResolved,false);assert.equal(s.result.hardBlocked,true);assert.equal(s.protocols.length,1);
  });
  await test('16 mobile: navegação, apresentação, revisão e tema sem overflow',async({page})=>{
    await page.screenshot({path:path.join(output,'mobile-home.png'),fullPage:true});await demo(page);await page.getByRole('button',{name:'Resolver pendência documental',exact:true}).click();await answer(page,'Uso hospitalar');await page.getByRole('button',{name:'Revisar documento',exact:true}).click();
    await page.screenshot({path:path.join(output,'mobile-review.png'),fullPage:true});await page.locator('#review-confirm').check();await page.locator('#approve-document').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#theme-toggle').click();await page.screenshot({path:path.join(output,'mobile-results-dark.png'),fullPage:true});await page.locator('[data-view="history"]').click();assert.equal(await page.locator('[data-history-id]').count(),1);
  },{viewport:{width:390,height:844}});
  await test('17 teclado, foco preso na revisão e aria do chat',async({page})=>{
    await demo(page);await page.getByRole('button',{name:'Resolver pendência documental',exact:true}).click();await answer(page,'Uso hospitalar');await page.getByRole('button',{name:'Revisar documento',exact:true}).click();
    for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('#doc-modal')!==null),true);}
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Revisar documento');await page.locator('#faq-toggle').click();assert.equal(await page.locator('#faq-panel').getAttribute('aria-hidden'),'false');await page.keyboard.press('Escape');assert.equal(await page.locator('#faq-toggle').getAttribute('aria-expanded'),'false');
  });
  await test('18 texto e nomes maliciosos são exibidos como texto',async({page})=>{
    await page.getByRole('button',{name:/Analisar nova operação/}).click();await page.locator('#guided-start-btn').click();await answer(page,'87089990');await answer(page,'<img src=x onerror="window.__xss=1">');await page.locator('#doc-input').setInputFiles(textFile('<img onerror=alert(1)>.txt','Commercial Invoice\nNCM: 87089990'));
    await page.waitForFunction(async()=>!!(await import('/src/services/state.js')).state.documentIssue);assert.equal(await page.evaluate(()=>window.__xss),undefined);assert.equal(await page.locator('#ctx-fields img').count(),0);assert.equal(await page.locator('#doc-list img').count(),0);
  });
  await test('19 registro v8 migra sem reutilizar custos ou leitura não comprovada',async({page})=>{
    await page.locator('[data-view="history"]').click();await page.locator('[data-history-id="old-v8"]').click();const s=await stateOf(page);assert.equal(s.documents[0].validated,false);assert.equal(s.costEstimate.available,false);assert.ok(s.sources.some(x=>x.label==='Registro migrado do v8'));
  },{setup:context=>context.addInitScript(()=>localStorage.setItem('duimpHubAnalysesDocumentalV2',JSON.stringify([{id:'old-v8',createdAt:'2026-01-01',op:{ncm:'30049099'},documents:[{name:'invoice.pdf',type:'Invoice',status:'Lido'}],result:{vencedor:'direta',resultado:'Antigo'},costEstimate:{totalDireta:{low:1,high:2}}}])))});
  await test('20 documento em leitura não contamina uma nova operação',async({page,context})=>{
    await context.route('**/vendor/pdf.worker.mjs',async route=>{await pause(600);await route.continue().catch(()=>{});});await page.locator('#doc-input').setInputFiles(invoicePdf());await page.locator('#new-op-btn').click();await pause(900);const s=await stateOf(page);assert.deepEqual(s.op,{});assert.equal(s.documents.length,0);
  });
}finally{
  await browser?.close();server.kill();
  const report={runAt:new Date().toISOString(),browser:channel,playwright:require(path.join(process.env.PLAYWRIGHT_PACKAGE||path.dirname(require.resolve('playwright/package.json')),'package.json')).version,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,cases:results};
  await writeFile(path.join(output,'e2e-report.json'),JSON.stringify(report,null,2));console.log(`\n${report.passed} passed / ${report.failed} failed`);if(report.failed)process.exitCode=1;
}
