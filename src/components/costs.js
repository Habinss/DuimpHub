import {state} from '../services/state.js';
import {escapeHtml as e,formatBRL} from '../utils/format.js';
import {badge} from './common.js';
import {deriveCargoScale} from '../engine/intake.js';

function field(key,label,{type='text',options=null,hint='',min,step}={}){
  const v=state.op[key];
  const control=options?`<select id="cost-${key}" name="${key}"><option value="">Selecione</option>${options.map(([val,text])=>`<option value="${e(val)}" ${String(v)===String(val)?'selected':''}>${e(text)}</option>`).join('')}</select>`:`<input id="cost-${key}" name="${key}" type="${type}" value="${e(v??'')}" ${min!==undefined?`min="${min}"`:''} ${step?`step="${step}"`:''}>`;
  return `<label class="field" for="cost-${key}"><span>${e(label)}</span>${control}${hint?`<small>${e(hint)}</small>`:''}</label>`;
}
const bools=[['false','Não'],['true','Sim']];
function check(key,text){return `<label class="check-field"><input type="checkbox" name="${key}" ${state.op[key]?'checked':''}>${e(text)}</label>`;}
export function costForm(){
  const s=deriveCargoScale(state.op);
  return `<form id="cost-form"><div class="form-grid">
    ${field('terminal','Terminal',{options:[['tecon-santos','Tecon Santos'],['other','Outro terminal (sem tarifa cadastrada)']]})}
    ${field('entryDate','Data de ingresso no terminal',{type:'date',hint:'Tabela conferida em 20/09/2026.'})}
    ${field('escala','Escala da operação',{hint:s.known?s.label:'Ex.: 3x20 + 2x40. TEU sem tamanhos não permite cobrar por unidade.'})}
    ${field('cif','CIF aproximado total (R$)',{type:'text',hint:'Informe o CIF em reais; não há conversão cambial automática.'})}
    ${field('daysDireta','Dias até a retirada direta',{type:'number',min:1,step:1})}
    ${field('daysRecinto','Dias no cenário de recinto',{type:'number',min:1,step:1})}
    ${field('cargoType','Modalidade tarifária',{options:[['house','House FCL · descarga no próprio terminal'],['lcl','LCL / carga solta'],['special','DTA / descarga direta / regime especial']],hint:'House: 1 BL por contêiner, sem mudança de regime. Os dois cenários usam o mesmo terminal.'})}
    ${field('reefer','Contêiner reefer?',{options:bools})}
    ${field('hotStuffing','Reefer com hot stuffing?',{options:bools,hint:'Se reefer: confirme as condições de temperatura.'})}
    ${field('imo','IMO / carga perigosa?',{options:bools})}
    ${field('oog','OOG / Flat Rack / Open Top?',{options:bools})}
    ${field('sanitary','Controle sanitário / Exército?',{options:bools,hint:'Enquadramento informado pelo responsável; não inferido apenas do NCM.'})}
    ${field('inspection','Inspeção prevista?',{options:bools})}
  </div><label class="field"><span>CIF individual por contêiner (opcional, R$)</span><textarea name="cifList" rows="2" placeholder="100000; 120000; 80000">${e(state.op.cifByContainer?.join('; ')||'')}</textarea><small>Valores separados por ponto e vírgula. Primeiro os contêineres de 20 pés, depois os de 40.</small></label>
  ${check('equalCifConfirmed','Se não informar valores individuais, confirmo o rateio igual do CIF entre os contêineres como premissa de estimativa.')}
  <fieldset><legend>Serviços previstos · quantidade total de ocorrências em cada cenário</legend><p class="muted">Informe zero para serviços não previstos. As quantidades abaixo são iguais nos dois cenários; apenas a permanência varia.</p><div class="form-grid service-fields">
  ${[['handlingIn','Handling in'],['handlingOut','Handling out'],['scanner','Scanner'],['weighing','Pesagem'],['moves','Movimentação interna']].map(([k,l])=>field(k,l,{type:'number',min:0,step:1})).join('')}
  </div>${check('movesConfirmed','Conferi os movimentos para scanner/pesagem, incluindo o item 1.04 quando aplicável, sem contar o mesmo movimento duas vezes.')}
  ${check('inspectionConfirmed','Se houver inspeção, confirmei os serviços selecionados; serviços adicionais sob consulta permanecem excluídos.')}</fieldset>
  <div class="form-footer"><span class="muted">Tarifa pública local; contratos comerciais podem ter condições diferentes.</span><button class="btn primary" type="submit">Calcular subtotal</button></div></form>`;
}
function breakdown(scenario,title){
  return `<section class="cost-scenario"><h4>${e(title)} <span>${scenario.days} dia(s)</span></h4><table class="cost-table"><thead><tr><th>Serviço</th><th>Memória de cálculo</th><th>Valor estimado</th></tr></thead><tbody>${scenario.lines.map(l=>`<tr><td>${e(l.service)}<small>Item ${e(l.id)}</small></td><td><details><summary>${e(l.formula)}</summary><p>Unidade: ${e(l.tariff.unit)} · Período: ${e(l.tariff.period)}</p><p>Vigência a partir de ${e(l.tariff.validFrom)}. ${e(l.tariff.note)}</p><a href="${e(l.tariff.source.url)}" target="_blank" rel="noopener noreferrer">Consultar a tabela de origem</a></details></td><td>${formatBRL(l.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">Subtotal logístico-operacional estimado</th><td>${formatBRL(scenario.total)}</td></tr></tfoot></table></section>`;
}
export function renderCosts(est){
  return `<div class="panel cost-panel"><div class="section-heading"><h3>Subtotal logístico-operacional estimado</h3>${badge('engine')}</div>
    <p class="muted">${e(est.scope)}</p>
    ${est.available?`<div class="cost-summary"><div><span>Retirada direta · ${est.direta.days} dias</span><strong>${formatBRL(est.direta.total)}</strong></div><div><span>Permanência em recinto · ${est.recinto.days} dias</span><strong>${formatBRL(est.recinto.total)}</strong></div></div><p class="muted">${e(est.premises.join(' '))} CIF total: ${formatBRL(Number(state.op.cif))}. ${badge(state.demo?'demo':'user')}</p><details class="calculation-detail"><summary>De onde saiu esse valor? Ver cada parcela</summary>${breakdown(est.direta,'Retirada direta')}${breakdown(est.recinto,'Permanência em recinto')}</details>`:`<div class="estimate-unavailable" role="status">${e(est.message)}${est.unsupported.length?`<ul>${est.unsupported.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`:''}</div>`}
    <div class="cost-source">${badge('external')} <a href="${e(est.source.url)}" target="_blank" rel="noopener noreferrer">${e(est.source.title)}</a> · cópia de parâmetros conferida em ${e(est.source.checkedAt)} · sem consulta ao vivo.</div>
    <details id="cost-parameters" class="parameter-details" ${est.available?'':'open'}><summary>${est.available?'Editar parâmetros de custo':'Completar parâmetros para estimar'}</summary>${costForm()}</details>
    <p class="estimate-note">${e(est.disclaimer)}</p></div>`;
}
