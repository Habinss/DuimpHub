import {state} from '../services/state.js';
import {escapeHtml as e} from '../utils/format.js';
import {$,badge} from './common.js';
import {validDocument} from '../documents/workflow.js';

export function renderDocuments(){
  $('doc-list').innerHTML=state.documents.map(d=>`<div class="doc-item"><div class="doc-icon">${d.generated?'SIM':'DOC'}</div><div class="doc-meta"><div class="doc-name" title="${e(d.name)}">${e(d.name)}</div><div class="doc-type">${e(d.type)} ${badge(d.demo?'demo':d.generated?'sim':'user')}</div><div class="doc-status ${validDocument(d)?'done':'wait'}">${e(d.status)}</div><div class="doc-workflow"><span class="doc-step done">Detectado</span><span class="doc-arrow">→</span><span class="doc-step ${d.read?'done':''}">Lido</span><span class="doc-arrow">→</span><span class="doc-step ${d.validated?'done':''}">Validação local</span></div>${d.error?`<p class="doc-error">${e(d.error)}</p>`:''}${d.read?`<details class="doc-evidence"><summary>Campos identificados</summary>${Object.entries(d.extracted||{}).map(([k,v])=>`<div>${e(k)}: ${e(v)}</div>`).join('')||'Texto lido; nenhum campo reconhecido.'}</details>`:''}</div><button class="doc-remove" onclick="removeDocument('${e(d.id)}')" aria-label="Remover ${e(d.name)}">×</button></div>`).join('')||'<div class="ctx-empty">Adicione documentos para aproveitar dados já disponíveis.</div>';
  const issue=state.documentIssue;
  $('pendency-box').innerHTML=!issue?'':`<div class="pendency-card ${!issue.missing.length&&!issue.unread.length?'ok':''}"><div class="pendency-title">${badge('sim')} ${issue.missing.length||issue.unread.length?'Pendência no checklist':'Checklist completo'}</div><div class="pendency-text">${issue.missing.length?'Faltantes ou sem validação: '+e(issue.missing.join(', '))+'.':'Documentos da demonstração presentes.'} ${issue.unread.length?'Há arquivo(s) sem leitura validada.':''} Este checklist local não confirma exigência de órgão.</div><div class="pendency-actions">${issue.canGenerate?'<button class="btn amber" onclick="startResolveDocument()">Resolver com o agente</button>':''}<button class="btn" onclick="analyzeDocuments(true)">Reanalisar documentos</button></div></div>`;
}
export function documentPipeline(){
  const stages=['Detectado','Lido','Validação local','Pendência','Geração','Revisão humana','Protocolo simulado'];
  const at=state.protocol?6:state.documentDraft?5:state.documentIssue?.missing.length?3:state.documents.some(d=>d.validated)?2:state.documents.some(d=>d.read)?1:0;
  return `<ol class="document-pipeline" aria-label="Etapas documentais">${stages.map((s,i)=>`<li class="${i<at?'done':i===at?'current':''}"><span>${i+1}</span>${s}</li>`).join('')}</ol>`;
}
