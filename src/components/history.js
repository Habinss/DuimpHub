import {escapeHtml as e,dateBR} from '../utils/format.js';
import {$,badge} from './common.js';

export function renderHistory(list){
  $('history-body').innerHTML=`<div class="section-heading history-toolbar"><span class="muted">${list.length} operação(ões) salvas · dados deste navegador</span><button class="btn" onclick="exportHistory()">Exportar backup do histórico</button></div>${list.length?`<div class="table-scroll"><table class="history-table"><thead><tr><th>Operação / data</th><th>Mercadoria / NCM</th><th>Status</th><th>Pendência</th><th>Documentos</th><th>Resultado</th><th>Próxima ação</th></tr></thead><tbody>${list.map(x=>`<tr><td><button class="text-btn" data-history-id="${e(x.id)}">${e(x.code||'OP-'+x.id.slice(-6).toUpperCase())}</button><small>${e(dateBR(x.updatedAt||x.createdAt))}</small>${badge(x.demo?'demo':'user')}</td><td>${e(x.op.descricao||'—')}<small>NCM ${e(x.op.ncm||'—')}</small></td><td>${e(x.operationalStatus?.label||'Registro anterior')}</td><td>${e(x.simulationResolved?'Resolvida na simulação':x.documentIssue?.missing?.join(', ')||x.op.pendencia||'—')}</td><td>${x.documents?.length||0}</td><td>${e(x.result?.resultado||'Análise pendente')}</td><td>${e(x.nextAction||'Abrir e revisar a operação')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-card"><h3>Seu histórico começa aqui.</h3><p>As análises salvas aparecerão com documentos, resultado e próxima ação.</p></div>'}`;
}
export function dashboardStats(list){return {
  analyzed:list.filter(x=>x.result).length,
  detected:list.filter(x=>x.detectedPendency||x.documentIssue?.missing?.length||x.op.pendencia==='Sim').length,
  resolved:list.filter(x=>x.simulationResolved).length,
  direta:list.filter(x=>x.result?.vencedor==='direta').length,
  recinto:list.filter(x=>x.result?.vencedor==='recinto').length,
  inconclusive:list.filter(x=>x.result&&(!['direta','recinto'].includes(x.result.vencedor))).length,
  docs:list.reduce((sum,x)=>sum+(x.documents||[]).filter(d=>d.validated===true).length,0)
};}
export function renderDashboard(list){
  const s=dashboardStats(list),kpis=[['Operações analisadas',s.analyzed],['Pendências detectadas',s.detected],['Resolvidas na simulação',s.resolved],['Retirada direta',s.direta],['Uso de recinto',s.recinto],['Análise inconclusiva',s.inconclusive],['Documentos processados',s.docs]];
  $('dashboard-body').innerHTML=`<div class="dashboard-intro"><div class="start-eyebrow">VISIBILIDADE OPERACIONAL</div><h2>O que suas operações mostram.</h2><p>Contagem de operações únicas do histórico salvo, incluindo ${list.filter(x=>x.demo).length} DEMO. Reanálises atualizam a mesma operação.</p></div><div class="kpi-grid">${kpis.map(([label,n])=>`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${n}</div></div>`).join('')}</div><div class="panel"><h3>Distribuição dos resultados</h3>${[['Retirada direta',s.direta],['Uso de recinto',s.recinto],['Inconclusiva / suspensa',s.inconclusive]].map(([label,n])=>`<div class="distribution-row"><span>${label}</span><div class="coverage-track"><div class="coverage-fill" style="width:${s.analyzed?n/s.analyzed*100:0}%"></div></div><b>${n}</b></div>`).join('')}<p class="muted">Documentos processados contam apenas os registros com validação local, incluindo rascunhos aprovados na simulação. Não há métricas de economia ou tempo inventadas.</p></div>`;
}
