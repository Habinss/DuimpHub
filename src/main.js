import {state,resetOperation,setFields} from './services/state.js';
import {HistoryStore} from './services/persistence.js';
import {QUESTIONS,missingQuestions,parseFreeformOperation,deriveCargoScale} from './engine/intake.js';
import {analyzeOperation} from './engine/decision.js';
import {estimateCosts} from './engine/costs.js';
import {inferDocType,fieldsFromFileText,extractFileText} from './documents/reader.js';
import {checkDocuments,validDocument,draftFields,DRAFT_LABELS,missingDraftFields} from './documents/workflow.js';
import {LogcomexMcpAdapter,MCP_STATES} from './integrations/logcomex/adapter.js';
import {DEMO_OPERATION,DEMO_DOCUMENTS} from './data/demo.js';
import {initHelpAgent} from './chat/agent.js';
import {OperationContextProvider} from './chat/providers.js';
import {renderDocuments} from './components/documents.js';
import {renderResultsPage} from './components/results.js';
import {renderHistory as historyView,renderDashboard as dashboardView} from './components/history.js';
import {$,badge,operationCode,dataCoverage,toast,notice,addMsg,safeMsg,setStatus,action,source,renderSources,renderLog,markTool,deriveOperationStatus,mainBlocker,mainNextAction,snapshot,renderContext,download} from './components/common.js';
import {escapeHtml as e,normalize,uid,parseBRL,formatBRL} from './utils/format.js';

let historyStorage;
try{historyStorage=localStorage;}catch{historyStorage={getItem(){throw new Error('storage_blocked');},setItem(){throw new Error('storage_blocked');}};}
const history=new HistoryStore(historyStorage,notice);
const mcp=new LogcomexMcpAdapter();
let help,activeQuestion=null,activeModal=null,returnFocus=null,inertElements=[],reading=0;
const contextProvider=new OperationContextProvider(()=>({
  active:!!Object.keys(state.op).length||!!state.documents.length,id:operationCode(),op:state.op,demo:state.demo,
  status:deriveOperationStatus(),coverage:dataCoverage(),scale:deriveCargoScale(state.op),estimate:state.costEstimate||estimateCosts(state.op),
  documents:state.documents,missingDocuments:state.documentIssue?.missing||[],preCheck:state.preCheck,result:state.result,protocol:state.protocol,blocker:mainBlocker(),nextAction:mainNextAction()
}));

function refresh(){renderContext();renderDocuments();renderSources();renderLog();help?.refresh();}
function setInput(enabled,placeholder='Responda ao agente operacional...'){$('free-input').disabled=!enabled;$('send-btn').disabled=!enabled;$('free-input').placeholder=placeholder;state.waitingFree=enabled;}
function disableChoices(){document.querySelectorAll('#chat-body .choices button').forEach(b=>b.disabled=true);}
function renderHistory(){historyView(history.read());}
function renderDashboard(){dashboardView(history.read());}
function switchView(name){
  const target=$('view-'+name);if(!target)return;
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x===target));
  document.querySelectorAll('.nav-item').forEach(x=>{x.classList.toggle('active',x.dataset.view===name);if(x.dataset.view===name)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  if(name==='history')renderHistory();if(name==='dashboard')renderDashboard();if(name==='results')renderResultsPage();
}
function hideStartScreen(){state.operationStarted=true;$('start-screen').style.display='none';$('freeform-box').style.display='block';}
function captureItem(){return structuredClone({...state,code:operationCode(),operationalStatus:deriveOperationStatus(),nextAction:mainNextAction()});}
function saveCurrentAnalysis(quiet=false){
  if(!Object.keys(state.op).length&&!state.documents.length){if(!quiet)toast('Adicione contexto antes de salvar.');return;}
  const persisted=history.save(captureItem());if(!quiet)toast(persisted?'Operação salva neste navegador.':'Operação mantida na sessão. Exporte um backup.');
}
function preserveCurrent(){if(Object.keys(state.op).length||state.documents.length)saveCurrentAnalysis(true);}
function resetChat(ask=false){
  preserveCurrent();if(activeModal)closeModal();resetOperation();reading=0;activeQuestion=null;
  $('chat-body').innerHTML='';$('free-input').value='';$('freeform-operation').value='';$('head-sub').textContent='Detectar, analisar, resolver, reanalisar e comparar.';
  $('start-screen').style.display='block';$('freeform-box').style.display='none';
  document.querySelectorAll('.tool-chip').forEach(el=>el.classList.remove('active','done'));setInput(false);setStatus('wait','Aguardando contexto');refresh();renderResultsPage();updateMcpStatus(MCP_STATES.UNAVAILABLE);
  if(ask){hideStartScreen();askNext();}
}
function startProductAction(type){
  if(type==='history'){switchView('history');return;}
  resetChat(false);hideStartScreen();switchView('analysis');
  if(type==='documents'){safeMsg('agent','Adicione os documentos disponíveis. Vou tentar ler o conteúdo e aproveitar os campos encontrados.');$('doc-input').click();}
  else{safeMsg('agent',type==='pendency'?'Descreva a pendência e adicione Invoice e Packing List. O pré-check documental deste MVP é demonstrativo.':'Descreva a importação. Vou extrair o contexto e perguntar apenas o que faltar.');$('freeform-operation').focus();}
}
function askNext(){
  disableChoices();const q=missingQuestions(state.op)[0];activeQuestion=q||null;
  if(!q){finalize();return;}
  hideStartScreen();state.inputMode='question';state.step=QUESTIONS.indexOf(q);setStatus('run','Completando contexto');
  safeMsg('agent',q.text);
  if(q.type==='choice'){
    setInput(false);const choices=document.createElement('div');choices.className='choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',q.text);
    q.options.forEach(opt=>{const btn=document.createElement('button');btn.className='choice-btn';btn.textContent=opt;btn.onclick=()=>answer(q,opt);choices.appendChild(btn);});$('chat-body').appendChild(choices);choices.querySelector('button')?.focus();
  }else{setInput(true,q.placeholder);$('free-input').value='';$('free-input').focus();}
  $('chat-body').scrollTop=$('chat-body').scrollHeight;refresh();
}
function answer(q,value){
  if(q!==activeQuestion)return;
  const clean=q.clean?q.clean(value):value;const error=q.validate?.(clean);
  if(error){safeMsg('agent',error);setInput(true,q.placeholder);$('free-input').focus();return;}
  disableChoices();safeMsg('user',clean);setFields({[q.key]:clean});source(state.demo?'demo':'user','Contexto da operação','Respostas fornecidas no fluxo guiado.');action(`${q.label} informado.`);
  refresh();askNext();
}
function submitFree(){
  if(!state.waitingFree)return;const value=$('free-input').value.trim();if(!value)return;
  if(state.inputMode==='document_field'){
    safeMsg('user',value);state.documentDraft[state.draftMissingKey]=value;$('free-input').value='';askDraftField();return;
  }
  if(activeQuestion)answer(activeQuestion,value);
}
function handleFreeformOperation(){
  const text=$('freeform-operation').value.trim();if(!text){toast('Descreva a operação primeiro.');return;}
  hideStartScreen();disableChoices();const found=parseFreeformOperation(text);setFields(found,{label:'Descrição livre'});
  safeMsg('user',text);source(state.demo?'demo':'user','Descrição livre','Campos extraídos localmente; revise eventuais divergências.');action(`${Object.keys(found).length} campo(s) extraído(s) da descrição.`);
  addMsg('agent',`${badge('engine')} Aproveitei <b>${Object.keys(found).length} campo(s)</b> do texto. ${state.conflicts.length?'Encontrei divergências; você pode revisá-las em Editar contexto.':'Vou perguntar somente o que falta.'}`);
  state.result=null;state.finalized=false;state.costEstimate=null;refresh();askNext();
}
function continueIntake(){switchView('analysis');hideStartScreen();askNext();}
function analyzeDocuments(showChat=true){
  if(reading){toast('Aguarde a leitura dos arquivos para verificar o checklist.');return;}
  state.checklistEnabled=true;
  state.documentIssue=checkDocuments(state.documents,{enabled:true});
  state.preCheck={status:state.documentIssue.status,pendencia_impeditiva:!!state.documentIssue.missing.length||!!state.documentIssue.unread.length,kind:'sim'};
  if(state.preCheck.pendencia_impeditiva)state.detectedPendency=true;
  markTool('anuencia','done');
  if(showChat){addMsg('agent',`${badge('sim')} <b>Pré-check documental local</b><br>${state.documentIssue.missing.length?'Faltam documentos com leitura validada: '+e(state.documentIssue.missing.join(', '))+'.':'Os documentos do checklist demonstrativo estão presentes.'} ${state.documentIssue.canGenerate?'Posso preparar a declaração complementar com os dados da Invoice e do Packing List.':''}`);action('Pré-check demonstrativo executado.');source('sim','Checklist documental','Requisitos de demonstração; não substituem o tratamento administrativo aplicável.');}
  refresh();if(state.result)finalize(true,false);
}
async function addDocument(file,{demo=false}={}){
  const opId=state.id;hideStartScreen();const doc={id:uid(),name:file.name,type:inferDocType(file.name),size:file.size,read:false,validated:false,status:'Lendo…',extractionMode:demo?'demo':'filename',demo,registeredAt:new Date().toISOString(),extracted:{}};
  state.documents.push(doc);reading++;markTool('docs','active');refresh();
  try{
    const result=await extractFileText(file);if(state.id!==opId)return;
    if(!result.text?.trim()||!result.complete){doc.status='Registrado sem leitura';doc.error=result.error||'Não foi possível extrair o conteúdo deste arquivo neste ambiente.';}
    else{
      const type=inferDocType(result.text);doc.type=type==='Documento da operação'?doc.type:type;
      doc.read=true;doc.validated=type!=='Documento da operação';doc.extractionMode=demo?'demo':'real';doc.status=demo?'DEMO · texto de exemplo processado':doc.validated?'Lido · validação local':'Lido · tipo não confirmado';
      doc.extracted=fieldsFromFileText(result.text);doc.textLength=result.text.length;
      if(!doc.validated)doc.error='Conteúdo lido, mas o tipo documental não foi confirmado. O nome do arquivo sozinho não valida o documento.';
      const {referencia,volumes,...fields}=doc.extracted;
      // References and volume fields remain associated with their individual document.
      setFields(fields,{kind:demo?'demo':'user',label:`Documento: ${doc.name}`});
      action(`Documento ${doc.name}: ${doc.validated?'leitura e validação local concluídas':'leitura sem identificação confirmada'}.`);
    }
  }catch(err){if(state.id!==opId)return;doc.status='Erro';doc.error=String(err.message||'Documento inválido.');}
  finally{
    if(state.id===opId){reading=Math.max(0,reading-1);if(!reading)markTool('docs','done');source(demo?'demo':'user','Documento registrado',doc.name);refresh();}
  }
}
async function uploadDocuments(files){
  const id=state.id;
  for(const file of files){await addDocument(file);if(state.id!==id)return;}
  analyzeDocuments(true);
  if(activeQuestion&&state.op[activeQuestion.key])askNext();
}
function removeDocument(id){
  const doc=state.documents.find(x=>x.id===id);if(!doc)return;
  state.documents=state.documents.filter(x=>x.id!==id);
  if(doc.generated){state.simulationResolved=false;state.protocol=null;}
  if(state.documentDraft){state.documentDraft=null;if(activeModal==='doc-modal')closeModal();}
  action(`Documento removido: ${doc.name}. Dados já extraídos continuam no contexto para revisão.`);analyzeDocuments(false);
}
function finalize(isReanalysis=false,navigate=true){
  if(reading){toast('Aguarde a leitura dos documentos antes de analisar.');return;}
  if(state.checklistEnabled)state.documentIssue=checkDocuments(state.documents,{enabled:true});
  state.costEstimate=estimateCosts(state.op);
  state.result=analyzeOperation(state.op,{documentIssue:state.documentIssue,conflicts:state.conflicts,simulationResolved:state.simulationResolved,demo:state.demo});
  state.finalized=true;state.operationStarted=true;
  if(state.result.hardBlocked)state.detectedPendency=true;
  markTool('custos','done');markTool('motor','done');disableChoices();setInput(false);activeQuestion=null;
  setStatus(state.result.hardBlocked||state.result.suspended?'warn':'ok',isReanalysis?'Operação reanalisada':'Análise concluída');
  $('head-sub').textContent=isReanalysis?'Operação reanalisada com o contexto atualizado.':'Análise concluída. Revise os fatores e os próximos passos.';
  source('engine','Motor DUIMP Hub','Regras de compatibilidade operacional, com guardrails e fatores auditáveis.');
  source('external','Catálogo tarifário local','Tecon Santos 2026; parâmetros publicados pelo terminal, conferidos em 20/09/2026. Não é consulta ao vivo.');
  if(!state.beforeSnapshot)state.beforeSnapshot=snapshot();
  if(isReanalysis&&state.simulationResolved)state.afterSnapshot=snapshot();
  action(isReanalysis?'Operação reanalisada.':'Comparação de cenários concluída.');
  refresh();renderResultsPage();saveCurrentAnalysis(true);
  if(navigate){addMsg('agent',`${badge('engine')} ${e(state.result.resultado)}. <button class="text-btn" onclick="switchView('results')">Ver resultados</button>`);switchView('results');}
}
function reanalyzeAndShowResults(){finalize(true);}
function startResolveDocument(){
  switchView('analysis');if(!state.documentIssue?.canGenerate){toast('São necessárias Invoice e Packing List com leitura validada para preparar o rascunho.');return;}
  if(state.conflicts.length){toast('Resolva as divergências do contexto antes de gerar o rascunho.');editOperation();return;}
  if(!state.beforeSnapshot)state.beforeSnapshot=snapshot();
  disableChoices();state.documentDraft={...draftFields(state.op,state.documents),status:'Coletando campos',reviewed:false};
  addMsg('agent',`${badge('engine')} Aproveitei os dados identificados na Invoice, no Packing List e no contexto. Vou pedir apenas os campos ainda ausentes.`);askDraftField();
}
function askDraftField(){
  const missing=missingDraftFields(state.documentDraft);
  if(!missing.length){generateDocumentDraft();return;}
  state.draftMissingKey=missing[0];state.inputMode='document_field';
  safeMsg('agent',`Falta uma informação para o rascunho: ${DRAFT_LABELS[missing[0]].toLowerCase()}.`);setInput(true,DRAFT_LABELS[missing[0]]);$('free-input').value='';$('free-input').focus();refresh();
}
function generateDocumentDraft(){
  state.documentDraft.status='Aguardando revisão';state.documentDraft.createdAt=new Date().toISOString();state.documentDraft.id=uid();
  state.inputMode='question';setInput(false);markTool('gerar','done');action('Rascunho preparado com os campos disponíveis e informações complementadas pelo usuário.');
  addMsg('agent',`<div class="workflow-card"><div class="workflow-head">${badge('sim')} <strong>Declaração complementar pronta para revisão</strong><div>Modelo demonstrativo. O profissional revisa antes da aprovação.</div></div><div class="workflow-body"><div class="workflow-row"><span>Mercadoria</span><b>${e(state.documentDraft.mercadoria)}</b></div><div class="workflow-row"><span>Finalidade</span><b>${e(state.documentDraft.finalidade)}</b></div></div><div class="workflow-actions"><button class="btn primary" onclick="openDocModal()">Revisar documento</button></div></div>`);
  setStatus('warn','Aguardando revisão humana');refresh();
}
function openModal(id){
  if(activeModal)closeModal();returnFocus=document.activeElement;activeModal=id;$(id).classList.add('show');
  inertElements=[...document.body.children].filter(el=>el.id!==id&&el.tagName!=='SCRIPT'&&!el.inert);inertElements.forEach(el=>el.inert=true);
  $(id).querySelector('button,input,textarea,select')?.focus();
}
function closeModal(){
  if(!activeModal)return;$(activeModal).classList.remove('show');inertElements.forEach(el=>el.inert=false);inertElements=[];activeModal=null;
  if(returnFocus?.isConnected)returnFocus.focus();
}
function openDocModal(){
  if(!state.documentDraft||state.documentDraft.status!=='Aguardando revisão'){toast('Nenhum rascunho disponível para revisão.');return;}
  const d=state.documentDraft;
  $('doc-preview').innerHTML=`<div class="simulation-warning"><b>SIMULAÇÃO</b> — nenhum dado será enviado a ANVISA, MAPA, Siscomex ou outro órgão.</div><h4>Declaração complementar de finalidade</h4><div class="form-grid">${Object.entries(DRAFT_LABELS).map(([key,label])=>`<label class="field"><span>${e(label)}</span><input data-draft-field="${key}" value="${e(d[key])}" required ${key==='ncm'?'pattern="[0-9]{8}"':''}></label>`).join('')}</div><p class="muted">Documento elaborado a partir dos dados informados. Modelo não oficial; sem validade de protocolo.</p>`;
  $('review-confirm').checked=false;$('approve-document').disabled=true;openModal('doc-modal');
}
function closeDocModal(){closeModal();}
function validDraftInputs(){return [...document.querySelectorAll('[data-draft-field]')].every(x=>x.value.trim()&&x.checkValidity());}
function approveAndSendDocument(){
  if(activeModal!=='doc-modal'||!state.documentDraft||!$('review-confirm').checked||!validDraftInputs()){toast('Revise todos os campos e confirme a aprovação.');return;}
  for(const input of document.querySelectorAll('[data-draft-field]'))state.documentDraft[input.dataset.draftField]=input.value.trim();
  const draft={...state.documentDraft,reviewed:true,approvedAt:new Date().toISOString()};
  const protocol={id:'DEMO-'+uid().slice(0,8).toUpperCase(),status:'PROTOCOLO SIMULADO',at:new Date().toISOString(),draftId:draft.id};
  state.protocol=protocol;state.protocols.push(protocol);state.simulationResolved=true;
  state.documents.push({id:uid(),name:'declaracao_complementar_simulada.txt',type:'Declaração complementar',generated:true,demo:state.demo,read:true,validated:true,extractionMode:'engine',status:'Revisado · aprovado · protocolo simulado',extracted:draft,protocol:protocol.id,registeredAt:protocol.at});
  state.documentDraft=null;closeModal();markTool('protocolo','done');action(`Revisão humana e aprovação registradas. Protocolo simulado ${protocol.id}.`);source('sim','Protocolo simulado',protocol.id+' · nenhum envio externo.');
  state.documentIssue=checkDocuments(state.documents,{enabled:true});state.checklistEnabled=true;
  addMsg('agent',`${badge('sim')} <b>${e(protocol.id)}</b><br>A pendência documental foi resolvida no checklist de simulação. ${state.demo?'Vou reanalisar a projeção demonstrativa.':'Qualquer pendência impeditiva real permanece até confirmação do responsável.'} <button class="text-btn" onclick="downloadDraft()">Baixar declaração revisada</button>`);
  finalize(true);
}
function downloadDraft(){const d=[...state.documents].reverse().find(x=>x.generated);if(!d)return;download(`${operationCode()}_declaracao_SIMULADA.txt`,'SIMULAÇÃO — MODELO NÃO OFICIAL. NENHUM ENVIO REAL.\n\n'+Object.entries(DRAFT_LABELS).map(([k,label])=>label+': '+d.extracted[k]).join('\n')+'\n\nProtocolo de demonstração: '+d.protocol);}
async function runDemo(n=3){
  resetChat(false);hideStartScreen();switchView('analysis');state.demo=true;state.checklistEnabled=n!==1;
  setFields(n===1?{...DEMO_OPERATION,ncm:'87089990',descricao:'Peças automotivas · demonstração',pendencia:'Não',pendencia_tipo:'',anuencia_prevista:'Não',orgao_anuente:'',reefer:false,sanitary:false}:DEMO_OPERATION,{kind:'demo',label:'Cenário demonstrativo local'});
  const id=state.id;addMsg('system',`${badge('demo')} Operação fictícia. Documentos e dados locais. Sem dependência de internet ou MCP.`);updateMcpStatus(MCP_STATES.DEMO);
  safeMsg('user',n===1?'Operação urgente de peças, com logística, transporte e janela confirmados.':'Importação urgente de medicamentos, 4 contêineres de 40 pés. O checklist de demonstração sinalizou falta de declaração complementar.');
  action('Demo iniciada; contexto preenchido a partir do cenário local.');
  if(n!==1){for(const fixture of DEMO_DOCUMENTS){await addDocument(new File([fixture.text],fixture.name,{type:'text/plain'}),{demo:true});if(state.id!==id)return;}analyzeDocuments(true);}
  if(state.id!==id)return;
  finalize(false,false);
  addMsg('agent',n===1?`${badge('engine')} Operação pronta para comparar. <button class="btn primary" onclick="switchView('results')">Ver resultados</button>`:`${badge('engine')} <b>Invoice e Packing List identificados.</b> Falta a declaração complementar. Posso preenchê-la e encaminhar para sua revisão. <div class="workflow-actions"><button class="btn primary" onclick="startResolveDocument()">Resolver pendência documental</button><button class="btn" onclick="switchView('results')">Ver comparação suspensa</button></div>`);
  refresh();
}
function togglePresentationMode(){
  state.presentationMode=!state.presentationMode;document.body.classList.toggle('presentation-mode',state.presentationMode);$('presentation-btn').textContent=state.presentationMode?'Sair da apresentação':'Modo apresentação';
  if(state.presentationMode)runDemo(3);else toast('Modo apresentação encerrado. A operação DEMO continua identificada.');
}
function updateMcpStatus(status){$('logcomex-status-text').textContent='Logcomex: '+status;$('logcomex-signal').style.background=status===MCP_STATES.CONNECTED?'#44C47C':status===MCP_STATES.AUTH?'#E4A23A':'#9AA3B2';}
async function queryLogcomex(){
  if(!state.op.ncm){toast('Informe o NCM no contexto antes de consultar.');return;}
  const id=state.id;markTool('logcomex','active');
  const r=await mcp.query({ncm:state.op.ncm,descricao:state.op.descricao,demo:state.demo});if(state.id!==id)return;
  state.logcomexData=r;updateMcpStatus(r.status);markTool('logcomex','done');switchView('analysis');
  addMsg('agent',`${badge(r.real?'external':state.demo?'demo':'engine')} <b>${r.real?'Retorno da fonte externa':'Consulta externa indisponível'}</b><p class="external-response">${e(r.texto)}</p>`);
  if(r.real)source('external','Logcomex MCP',r.texto);action(r.real?'Retorno externo Logcomex recebido.':'Consulta externa indisponível; nenhuma resposta foi inventada.');refresh();
}
function exportSummaryReport(){
  if(!state.result){toast('Conclua uma análise antes de exportar.');return;}
  const ctx=contextProvider.snapshot(),est=state.costEstimate;
  const cost=est.available?['Retirada direta: '+formatBRL(est.direta.total),'Permanência em recinto: '+formatBRL(est.recinto.total),...est.direta.lines.map(l=>`${l.service}: ${formatBRL(l.amount)} | ${l.formula}`),...est.recinto.lines.map(l=>`Recinto / ${l.service}: ${formatBRL(l.amount)} | ${l.formula}`)].join('\n'):est.message+'\n'+est.unsupported.join('\n');
  const text=`DUIMP HUB · ${operationCode()}\n${state.demo?'DEMO — OPERAÇÃO FICTÍCIA':'DADOS INFORMADOS PELO USUÁRIO/DOCUMENTOS, SEM VALIDAÇÃO OFICIAL'}\nGerado em ${new Date().toLocaleString('pt-BR')}\n\nCONTEXTO\n${QUESTIONS.map(q=>q.label+': '+(q.key==='escala'?ctx.scale.label:state.op[q.key]||'Não informado')).join('\n')}\nCobertura: ${ctx.coverage.filled}/${ctx.coverage.total}\n\nSTATUS\n${ctx.status.label}\n${ctx.blocker}\nPróxima ação: ${ctx.nextAction}\n\nDOCUMENTOS\n${state.documents.map(d=>`${d.name}: ${d.status} [${d.demo?'DEMO':d.generated?'SIMULAÇÃO':'REAL — FORNECIDO'}]`).join('\n')}\n\nMOTOR ${state.result.version}\n${state.result.resultado}\n${state.result.rows.map(x=>`${x.label}: Direta +${x.d} / Recinto +${x.r}`).join('\n')}\nGuardrails: ${state.result.guardrails.join('; ')}\nConflitos: ${state.result.conflitos.join('; ')}\nAlertas: ${state.result.alertas.join('; ')}\n\nSUBTOTAL LOGÍSTICO-OPERACIONAL ESTIMADO\n${cost}\n${est.scope}\n${est.disclaimer}\nFonte externa: ${est.source.url} (catálogo local conferido em ${est.source.checkedAt})\n\n${state.protocol?'SIMULAÇÃO — '+state.protocol.id+'; nenhum envio oficial.':''}\nA decisão final continua com o responsável operacional.`;
  download(operationCode()+'_resumo_DUIMP_Hub.txt',text);action('Resumo com fatores e memória de custos exportado.');saveCurrentAnalysis(true);
}
function exportHistory(){download('DUIMP_Hub_historico_backup.json',JSON.stringify(history.backup(),null,2),'application/json');}
function openHistory(id){
  const item=history.read().find(x=>x.id===id);if(!item)return;preserveCurrent();resetOperation();
  const defaults={...state};Object.assign(state,defaults,item);state.documents=(item.documents||[]).map(d=>({...d,id:d.id||uid(),validated:!!d.validated,read:!!d.read,status:d.validated?d.status:'Registro anterior · leitura não comprovada',extracted:d.extracted||{}}));
  state.sources=item.sources||[];state.actionLog=item.actionLog||[];state.conflicts=item.conflicts||[];state.provenance=item.provenance||{};state.protocols=item.protocols||[];
  if(item.schemaVersion!==3){state.result=null;state.costEstimate=null;state.simulationResolved=false;source('engine','Registro migrado do v8','Custos antigos não reutilizados. Documentos sem evidência devem ser lidos novamente.');}
  $('chat-body').innerHTML='';hideStartScreen();setInput(false);state.documentDraft=null;activeQuestion=null;reading=0;
  action('Operação aberta a partir do histórico.');refresh();finalize(true);updateMcpStatus(state.demo?MCP_STATES.DEMO:MCP_STATES.UNAVAILABLE);
}
function editOperation(){
  $('edit-fields').innerHTML=`${state.conflicts.length?`<div class="error-card"><b>Divergências encontradas</b><ul>${state.conflicts.map(c=>`<li>${e(c.key)}: contexto “${e(c.current)}”; ${e(c.source)} informou “${e(c.value)}”.</li>`).join('')}</ul></div>`:''}<div class="form-grid">${QUESTIONS.map(q=>`<label class="field"><span>${e(q.label)}</span>${q.options?`<select name="${q.key}"><option value="">Não informado</option>${q.options.map(opt=>`<option ${state.op[q.key]===opt?'selected':''}>${e(opt)}</option>`).join('')}</select>`:`<input name="${q.key}" value="${e(q.key==='escala'?state.op.escala||'':state.op[q.key]||'')}">`}</label>`).join('')}</div><label class="field"><span>Justificativa da revisão</span><input name="reviewReason" placeholder="Ex.: confirmação do terminal ou conciliação documental" ${state.conflicts.length?'required':''}></label><p class="muted">O registro da alteração fica na linha de ação. Uma simulação não comprova liberação oficial.</p>`;openModal('edit-modal');
}
function closeEditModal(){closeModal();}
function applyCostForm(form){
  const values=Object.fromEntries(new FormData(form));const fields={};
  for(const key of ['terminal','entryDate','escala','cargoType'])fields[key]=values[key]||'';
  for(const key of ['cif'])fields[key]=parseBRL(values[key]);
  for(const key of ['daysDireta','daysRecinto','handlingIn','handlingOut','scanner','weighing','moves'])fields[key]=values[key]===''?null:Number(values[key]);
  for(const key of ['reefer','hotStuffing','imo','oog','sanitary','inspection'])fields[key]=values[key]===''?null:values[key]==='true';
  for(const key of ['equalCifConfirmed','movesConfirmed','inspectionConfirmed'])fields[key]=values[key]==='on';
  fields.cifByContainer=values.cifList?.trim()?values.cifList.split(';').map(parseBRL):null;
  if(fields.cifByContainer?.some(x=>!Number.isFinite(x)||x<=0)){toast('Informe valores CIF positivos separados por ponto e vírgula.');return;}
  // Clearing a field must invalidate its prior estimate, not preserve stale values.
  for(const key of Object.keys(fields))state.op[key]=fields[key];
  for(const key of ['containers20','containers40','containers','teus','peso_ton'])delete state.op[key];
  state.revision++;state.costEstimate=estimateCosts(state.op);action('Parâmetros de custo revisados pelo responsável.');
  for(const key of Object.keys(fields))state.provenance[key]={kind:state.demo?'demo':'user',label:'Parâmetro de custo informado'};
  finalize(true,false);$('cost-parameters').open=!state.costEstimate.available;toast(state.costEstimate.available?'Subtotal recalculado. Consulte cada parcela.':'Estimativa indisponível. Confira os campos indicados.');
}

Object.assign(window,{switchView,resetChat,startProductAction,continueIntake,runDemo,togglePresentationMode,analyzeDocuments,startResolveDocument,openDocModal,closeDocModal,approveAndSendDocument,saveCurrentAnalysis,renderDashboard,renderHistory,removeDocument,reanalyzeAndShowResults,exportSummaryReport,exportHistory,queryLogcomex,editOperation,closeEditModal,downloadDraft});
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
$('new-op-btn').addEventListener('click',()=>{resetChat(false);switchView('analysis');});
$('guided-start-btn').addEventListener('click',continueIntake);
$('freeform-analyze-btn').addEventListener('click',handleFreeformOperation);
$('freeform-operation').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();handleFreeformOperation();}});
$('send-btn').addEventListener('click',submitFree);$('free-input').addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();submitFree();}});
$('attach-doc-btn').addEventListener('click',()=>$('doc-input').click());
$('doc-input').addEventListener('change',ev=>{const files=[...ev.target.files];ev.target.value='';void uploadDocuments(files);});
$('analyze-docs-btn').addEventListener('click',()=>analyzeDocuments(true));
$('review-confirm').addEventListener('change',()=>$('approve-document').disabled=!$('review-confirm').checked||!validDraftInputs());
$('doc-preview').addEventListener('input',()=>{$('review-confirm').checked=false;$('approve-document').disabled=true;});
document.addEventListener('click',ev=>{const button=ev.target.closest('[data-history-id]');if(button)openHistory(button.dataset.historyId);});
document.addEventListener('submit',ev=>{if(ev.target.id==='cost-form'){ev.preventDefault();applyCostForm(ev.target);}});
$('edit-form').addEventListener('submit',ev=>{
  ev.preventDefault();const data=Object.fromEntries(new FormData(ev.target));
  for(const q of QUESTIONS){const value=q.clean?q.clean(data[q.key]):data[q.key];if(value&&q.validate?.(value)){toast(q.validate(value));return;}data[q.key]=value;}
  const reason=data.reviewReason;delete data.reviewReason;
  for(const key of ['containers20','containers40','containers','teus','peso_ton'])delete state.op[key];
  for(const [k,v] of Object.entries(data))state.op[k]=v;
  state.conflicts=[];state.documentDraft=null;state.revision++;Object.keys(data).forEach(k=>state.provenance[k]={kind:state.demo?'demo':'user',label:'Revisão humana'});
  action('Contexto revisado pelo responsável'+(reason?': '+reason:'.'));closeModal();finalize(true);
});
document.addEventListener('keydown',ev=>{
  if(!activeModal)return;
  if(ev.key==='Escape'){ev.preventDefault();closeModal();}
  else if(ev.key==='Tab'){
    const nodes=[...$(activeModal).querySelectorAll('button,input,select,textarea,a,[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0);const first=nodes[0],last=nodes.at(-1);
    if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
  }
});
document.querySelectorAll('.modal-backdrop').forEach(el=>el.addEventListener('click',ev=>{if(ev.target===el)closeModal();}));
function applyTheme(theme){document.documentElement.dataset.theme=theme;$('theme-state').textContent=theme==='dark'?'Claro':'Escuro';$('theme-icon').textContent=theme==='dark'?'☀':'☾';$('theme-toggle').setAttribute('aria-label',theme==='dark'?'Ativar tema claro':'Ativar tema escuro');try{localStorage.setItem('duimpHubTheme',theme);}catch{notice('Preferência visual não pôde ser persistida neste navegador.');}}
let theme='light';try{theme=localStorage.getItem('duimpHubTheme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}catch{}
applyTheme(theme);$('theme-toggle').addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
help=initHelpAgent({getContext:()=>contextProvider.snapshot(),toast});
window.addEventListener('error',()=>notice('Ocorreu um erro inesperado. A operação permanece nesta sessão; exporte um backup e tente novamente.'));
window.addEventListener('unhandledrejection',()=>notice('Uma etapa não foi concluída. Revise o status da operação; os dados disponíveis foram preservados.'));
window.addEventListener('storage',ev=>{if(ev.key==='duimpHubAnalysesDocumentalV2'){renderHistory();renderDashboard();}});
refresh();renderHistory();renderDashboard();renderResultsPage();
if(location.protocol==='file:')notice('Para carregar os módulos locais, execute node server.mjs na pasta do projeto e abra http://127.0.0.1:4173.');
