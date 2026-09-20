import {state} from '../services/state.js';
import {dataCoverage as coverage,deriveCargoScale,QUESTIONS} from '../engine/intake.js';
import {escapeHtml as esc,normalize} from '../utils/format.js';

export const $=id=>document.getElementById(id);
export const operationCode=()=> 'OP-'+state.id.replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase();
export const dataCoverage=()=>coverage(state.op);
export function badge(kind){const k={user:['real','REAL'],real:['real','REAL'],demo:['sim','DEMO'],sim:['sim','SIMULAÇÃO'],engine:['engine','MOTOR'],external:['external','FONTE EXTERNA']}[kind]||['engine','MOTOR'];return `<span class="badge-mini ${k[0]}">${k[1]}</span>`;}
export function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
export function notice(text){const el=$('app-notice');el.hidden=!text;el.textContent=text||'';}
export function addMsg(role,html){const el=document.createElement('div');el.className='msg '+role;el.innerHTML=`<div class="bubble">${html}</div>`;$('chat-body').appendChild(el);$('chat-body').scrollTop=$('chat-body').scrollHeight;return el;}
export function safeMsg(role,text){return addMsg(role,esc(text));}
export function setStatus(kind,text){$('status-pill').className='status-pill '+kind;$('status-pill').innerHTML=`<span class="dot"></span>${esc(text)}`;}
export function action(text){state.actionLog.push({time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),at:new Date().toISOString(),text});renderLog();}
export function source(kind,label,text){if(!state.sources.some(s=>s.kind===kind&&s.label===label&&s.text===text))state.sources.push({kind,label,text,at:new Date().toISOString()});renderSources();}
export function renderSources(){$('ctx-sources').innerHTML=state.sources.map(s=>`<div class="source-item ${esc(s.kind)}"><div class="source-head"><b>${esc(s.label)}</b>${badge(s.kind)}</div>${esc(s.text||'')}</div>`).join('')||'<div class="ctx-empty">Nenhuma fonte consultada.</div>';}
export function renderLog(){$('ctx-action-log').innerHTML=state.actionLog.slice(-8).reverse().map(x=>`<div class="log-item"><span class="log-time">${esc(x.time)}</span><span class="log-dot"></span><span>${esc(x.text)}</span></div>`).join('')||'<div class="ctx-empty">Nenhuma ação executada.</div>';}
export function markTool(name,status){const el=document.querySelector(`[data-tool="${name}"]`);el?.classList.remove('active','done');if(status)el?.classList.add(status);}
export function deriveOperationStatus(){
  if(state.documentDraft)return {key:'review',label:'Documento em revisão',stage:'Aguardando revisão humana'};
  if(state.result?.hardBlocked||state.documentIssue?.missing?.length||state.documentIssue?.unread?.length||normalize(state.op.pendencia)==='sim'&&!(state.demo&&state.simulationResolved&&state.op.pendencia_tipo==='documental-demo'))return {key:'blocked',label:'Pendência identificada',stage:'Resolver antes de comparar'};
  if(state.simulationResolved)return {key:'ready',label:'Pendência resolvida na simulação',stage:state.result?'Operação reanalisada':'Reanálise pendente'};
  if(state.result)return {key:state.result.suspended?'review':'ready',label:state.result.suspended?'Análise inconclusiva':'Análise concluída',stage:'Cenários disponíveis'};
  return {key:'collecting',label:state.operationStarted?'Em análise':'Nova operação',stage:state.operationStarted?'Completando o contexto':'Aguardando contexto'};
}
export function mainBlocker(){
  if(state.conflicts.length)return 'Há divergências entre fontes. Revise o contexto antes de decidir.';
  if(state.documentIssue?.missing?.length)return `Checklist simulado: faltam ${state.documentIssue.missing.join(', ')}.`;
  if(state.documentIssue?.unread?.length)return 'Existem documentos registrados sem leitura validada.';
  if(state.result?.hardBlocked)return 'A pendência impeditiva informada permanece ativa; o protocolo simulado não substitui sua liberação real.';
  if(state.result?.faltantes.length)return 'Faltam dados essenciais para comparar os cenários.';
  if(normalize(state.op.janela)!=='sim')return 'Confirme a janela/agendamento do terminal.';
  if(normalize(state.op.transporte)!=='sim')return 'Confirme a programação do transporte.';
  if(normalize(state.op.logistica)!=='sim')return 'A estrutura logística ainda não está plenamente pronta.';
  return 'Nenhum bloqueio crítico identificado com os dados informados. A execução depende da validação do responsável.';
}
export function mainNextAction(){
  if(state.documentDraft)return 'Revisar os dados do rascunho e aprovar a simulação.';
  if(state.conflicts.length)return 'Editar o contexto e resolver as divergências registradas.';
  if(state.documentIssue?.canGenerate)return 'Preparar a declaração complementar usando os documentos lidos.';
  if(state.documentIssue?.missing?.length||state.documentIssue?.unread?.length)return 'Adicionar ou substituir os documentos faltantes/ilegíveis e repetir o checklist.';
  if(state.result?.hardBlocked)return 'Confirmar a liberação real com o responsável e atualizar a pendência na operação.';
  if(dataCoverage().missing.length)return 'Completar somente os dados essenciais que faltam.';
  if(!state.result?.directAvailable)return 'Confirmar prontidão, janela e condições de armazenagem antes de decidir.';
  return 'Validar os cenários com o responsável operacional e registrar a decisão.';
}
export function snapshot(){const s=deriveOperationStatus();return {status:s.label,stage:s.stage,pendency:state.simulationResolved?'Resolvida na simulação (sem liberação oficial)':state.op.pendencia||'Não informado',docs:state.documents.length,missingDocs:state.documentIssue?.missing?.slice()||[],result:state.result?.resultado||'Não analisada',at:new Date().toISOString()};}
export function renderContext(){
  const s=deriveOperationStatus(),cov=dataCoverage(),scale=deriveCargoScale(state.op);
  $('operation-status-card').innerHTML=`<div class="operation-card"><div class="operation-card-top"><div><div class="operation-code">${esc(operationCode())}</div><div class="operation-status ${s.key}">${esc(s.label)}</div></div>${badge(state.demo?'demo':state.simulationResolved?'sim':'engine')}</div><div class="operation-meta"><div><span>Etapa</span>${esc(s.stage)}</div><div><span>Documentos</span>${state.documents.length}</div></div><div class="coverage-wrap"><div class="coverage-top"><span>Cobertura de dados</span><b>${Math.round(cov.ratio*100)}% · ${cov.filled}/${cov.total}</b></div><div class="coverage-track" role="progressbar" aria-label="Cobertura dos dados" aria-valuenow="${cov.filled}" aria-valuemin="0" aria-valuemax="${cov.total}"><div class="coverage-fill" style="width:${cov.ratio*100}%"></div></div><div class="coverage-missing">${cov.missing.length?'Faltam: '+cov.missing.map(k=>QUESTIONS.find(q=>q.key===k)?.label||k).join(', '):'Contexto essencial preenchido. Confira pendências e parâmetros de custo.'}</div></div></div>`;
  const keys=QUESTIONS.filter(q=>q.key==='escala'?scale.known:state.op[q.key]);
  $('ctx-fields').innerHTML=keys.map(q=>`<div class="ctx-row"><span>${esc(q.label)}</span><span>${esc(q.key==='escala'?scale.label:state.op[q.key])} ${badge(state.provenance[q.key]?.kind||(state.demo?'demo':'user'))}</span></div>`).join('')||'<div class="ctx-empty">Nenhum dado coletado ainda.</div>';
  if(state.conflicts.length)$('ctx-fields').innerHTML+=`<div class="error-card">${state.conflicts.length} divergência(s) entre fontes. <button class="text-btn" onclick="editOperation()">Revisar</button></div>`;
}
export function download(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
