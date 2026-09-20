import {normalize} from '../utils/format.js';
import {dataCoverage} from './intake.js';

// Versioned v8 scoring, now pure: the audit rows are the scoring inputs themselves.
export const ENGINE_VERSION='9.0.0';
const RULES={
  urgencia:{baixa:['Urgência baixa',0,1],media:['Urgência média',1,1],alta:['Urgência alta',2,0],critica:['Urgência crítica',3,0]},
  pendencia:{nao:['Sem pendência informada',2,0],sim:['Pendência impeditiva informada',0,3],'parcialmente / incerta':['Pendência incerta',0,1]},
  logistica:{sim:['Logística pronta',3,0],parcialmente:['Logística parcial',1,1],nao:['Logística não pronta',0,3]},
  transporte:{sim:['Transporte programado',2,0],nao:['Transporte não programado',0,2]},
  janela:{sim:['Janela disponível',3,0],parcialmente:['Janela parcial',1,1],nao:['Janela indisponível',0,3],'ainda nao sabemos':['Janela não confirmada',0,1]},
  entreposto:{nao:['Sem necessidade de armazenagem prolongada',1,0],talvez:['Possível necessidade de armazenagem',0,1],sim:['Armazenagem/entreposto necessário',0,3]}
};
export function analyzeOperation(op,{documentIssue=null,conflicts=[],simulationResolved=false,demo=false}={}){
  const rows=[],alertas=[],conflitos=[],guardrails=[];
  const effective={...op};
  // Only the documented demo pendency is released in a simulated projection.
  if(demo&&simulationResolved&&op.pendencia_tipo==='documental-demo')effective.pendencia='Não';
  for(const [key,values] of Object.entries(RULES)){
    const rule=values[normalize(effective[key])];
    if(rule){const [label,d,r]=rule;rows.push({key,label,d,r});}
  }
  const score_direta=rows.reduce((n,x)=>n+x.d,0),score_recinto=rows.reduce((n,x)=>n+x.r,0);
  const faltantes=dataCoverage(op).missing;
  if(faltantes.length)guardrails.push('Dados essenciais incompletos: a comparação é inconclusiva.');
  const documentBlocked=!!documentIssue?.missing?.length||!!documentIssue?.unread?.length;
  const pending=normalize(effective.pendencia)!=='nao';
  const hardBlocked=documentBlocked||normalize(effective.pendencia)==='sim';
  if(documentBlocked)guardrails.push('Checklist demonstrativo incompleto ou documento sem leitura validada.');
  if(normalize(effective.pendencia)==='sim')guardrails.push('Pendência impeditiva informada: comparação suspensa.');
  else if(pending)guardrails.push('Ausência de pendência impeditiva ainda não confirmada.');
  if(normalize(op.anuencia_prevista)==='ainda nao sabemos')guardrails.push('Tratamento administrativo ainda precisa ser confirmado.');
  const readiness=['logistica','transporte','janela'].every(k=>normalize(op[k])==='sim')&&normalize(op.entreposto)==='nao';
  if(!readiness)alertas.push('Retirada imediata depende de logística, transporte e janela confirmados, sem necessidade de armazenagem prolongada.');
  if(['alta','critica'].includes(normalize(op.urgencia))&&!readiness)conflitos.push('Urgência alta com prontidão operacional incompleta.');
  for(const c of conflicts)conflitos.push(`Divergência em ${c.key}: “${c.current}” × “${c.value}” (${c.source}).`);
  if(conflicts.length)guardrails.push('Divergências entre fontes devem ser resolvidas antes da recomendação.');
  if(normalize(op.preparacao)==='baixa')alertas.push('Preparação interna para a DUIMP informada como baixa.');
  alertas.push('Pontuação heurística de compatibilidade; não representa probabilidade, liberação ou prazo garantido.');
  const suspended=hardBlocked||pending||faltantes.length>0||conflicts.length>0||normalize(op.anuencia_prevista)==='ainda nao sabemos';
  const delta=score_direta-score_recinto;
  let vencedor=suspended?'equilibrado':Math.abs(delta)<2?'equilibrado':delta>0?'direta':'recinto';
  if(vencedor==='direta'&&!readiness){vencedor='equilibrado';guardrails.push('Pontuação favorável não supera a falta de prontidão para retirada.');}
  const resultado=hardBlocked?'Comparação suspensa — pendência impeditiva':suspended?'Análise inconclusiva — confirme os pontos pendentes':vencedor==='direta'?'Maior compatibilidade: retirada direta':vencedor==='recinto'?'Maior compatibilidade: uso de recinto':'Cenários próximos — análise adicional necessária';
  return {version:ENGINE_VERSION,score_direta,score_recinto,rows,fatores:rows.map(x=>x.label),conflitos,alertas,faltantes,guardrails,vencedor,resultado,hardBlocked,suspended,directAvailable:!suspended&&readiness,simulated:demo&&simulationResolved};
}

export function compareOptions(result,estimate){
  const blocked={choice:'Comparação suspensa',metric:'Pendência impeditiva',reason:'Resolver a pendência e reanalisar. Nenhum caminho recebe liberação por este motor.'};
  const unknown={choice:'Comparação inconclusiva',metric:'Confirmação necessária',reason:result.guardrails.join(' ')||'Confirme a prontidão operacional.'};
  let cheaper=!estimate?.available?{choice:'Estimativa indisponível',metric:'Complete os parâmetros',reason:estimate?.message||'Faltam tarifas e parâmetros.'}: {choice:estimate.direta.total===estimate.recinto.total?'Mesmo subtotal nominal':estimate.direta.total<estimate.recinto.total?'Retirada direta':'Permanência em recinto',amount:Math.min(estimate.direta.total,estimate.recinto.total),metric:'Subtotal dos serviços selecionados',reason:estimate.scope};
  if(result.hardBlocked)cheaper={...blocked,reason:'Comparação de custo suspensa; o detalhamento tarifário abaixo é apenas uma projeção nominal.'};
  else if(!result.directAvailable)cheaper={...unknown,reason:'A retirada direta ainda não está operacionalmente disponível. Consulte os subtotais como projeções condicionais.'};
  const faster=result.hardBlocked?blocked:result.suspended?unknown:result.directAvailable?{choice:'Retirada direta',metric:'Maior prontidão',reason:'Logística, transporte e janela confirmados. O motor não estima horas ou prazo de liberação.'}:{choice:'Sem vantagem confirmada',metric:'Prontidão incompleta',reason:'Confirme a janela e o transporte antes de comparar velocidade.'};
  const lowerRisk=result.hardBlocked?blocked:result.suspended?unknown:result.directAvailable?{choice:'Retirada direta',metric:'Menos impedimentos informados',reason:'Prontidão reduz pontos de interrupção. Risco qualitativo, sem probabilidade estimada.'}:{choice:'Uso de recinto',metric:'Permanência a avaliar',reason:'Armazenagem ou falta de prontidão favorecem avaliar permanência no recinto. Transferência depende de autorização.'};
  const best=result.hardBlocked?blocked:result.suspended?unknown:{choice:result.vencedor==='direta'?'Retirada direta':result.vencedor==='recinto'?'Uso de recinto':'Revisar antes de decidir',metric:`${result.score_direta} × ${result.score_recinto} pontos`,reason:'Compatibilidade operacional pelas regras do protótipo. O subtotal não é convertido em pontos nem substitui a decisão humana.'};
  return {cheaper,faster,lowerRisk,best};
}
