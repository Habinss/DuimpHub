import {TECON_SANTOS} from '../data/tariffs/tecon-santos-2026.js';
import {deriveCargoScale} from './intake.js';
import {roundMoney,formatBRL} from '../utils/format.js';

export const COST_EXCLUSIONS=['mercadoria','tributos de importação e tributos incidentes sobre os serviços','frete internacional','seguro','câmbio','demurrage/detention','transporte rodoviário externo','despachante','serviços sob consulta','serviços não selecionados e outros valores não disponíveis'];
export const COST_FIELDS={terminal:'terminal com tarifa cadastrada',entryDate:'data de ingresso',cif:'CIF aproximado em reais',daysDireta:'dias previstos para retirada',daysRecinto:'dias previstos em recinto',cargoType:'modalidade da carga',reefer:'condição reefer',imo:'classificação IMO/perigosa',oog:'condição OOG/Flat Rack/Open Top',sanitary:'controle sanitário/Exército',inspection:'inspeção prevista',handlingIn:'quantidade de handling in',handlingOut:'quantidade de handling out',scanner:'quantidade de scanners',weighing:'quantidade de pesagens',moves:'quantidade de movimentações internas'};
const requiredBools=['reefer','imo','oog','sanitary','inspection'];
const services={handlingIn:'1.26',handlingOut:'1.27',scanner:'1.25',weighing:'1.17',moves:'1.04'};
export function estimateCosts(op,{tariff=TECON_SANTOS}={}){
  const scale=deriveCargoScale(op),missing=[],unsupported=[];
  for(const key of Object.keys(COST_FIELDS)){
    if(op[key]===undefined||op[key]===null||op[key]==='')missing.push(COST_FIELDS[key]);
  }
  if(!scale.known)missing.push('escala da operação');
  else if(!Number.isInteger(scale.containers20)||!Number.isInteger(scale.containers40))missing.push('quantidade de contêineres de 20 e 40 pés');
  for(const key of requiredBools)if(op[key]!==undefined&&typeof op[key]!=='boolean')missing.push(COST_FIELDS[key]+' confirmada');
  const count=scale.count;
  if(op.terminal&&op.terminal!==tariff.id)unsupported.push('Tarifa não cadastrada para esse terminal.');
  if(op.cargoType&&op.cargoType!=='house')unsupported.push('Modalidade fora do catálogo: disponível somente importação house FCL, sem mudança de regime, um BL por contêiner e descarga no próprio Tecon Santos.');
  if(scale.known&&scale.containerized===false)unsupported.push('Carga solta, breakbulk e granel exigem outra tabela; não há conversão para TEU.');
  if(op.entryDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(op.entryDate)||op.entryDate<'2026-01-01'||op.entryDate>tariff.source.checkedAt))unsupported.push(`Vigência não verificada para essa data. Catálogo conferido em ${tariff.source.checkedAt}; confirme uma tabela aplicável.`);
  for(const key of ['cif','daysDireta','daysRecinto'])if(op[key]!==undefined&&(!(Number(op[key])>0)||!Number.isFinite(Number(op[key]))))missing.push(`${COST_FIELDS[key]} válido`);
  for(const key of ['daysDireta','daysRecinto'])if(Number(op[key])>365)unsupported.push('Permanência acima de 365 dias exige conferência comercial.');
  for(const key of Object.keys(services))if(op[key]!==undefined&&(!Number.isInteger(Number(op[key]))||Number(op[key])<0||Number(op[key])>10000))missing.push(`${COST_FIELDS[key]} válida`);
  if(op.reefer&&op.hotStuffing!==false)unsupported.push('Confirme reefer sem hot stuffing; condições especiais de temperatura exigem cotação.');
  if([op.imo,op.oog,op.sanitary].filter(v=>v===true).length>1)unsupported.push('Acúmulo de adicionais IMO/OOG/sanitário: confirme a regra comercial antes de calcular.');
  if(op.inspection&&!op.inspectionConfirmed)missing.push('escopo dos serviços de inspeção confirmado');
  if((Number(op.weighing)>0||Number(op.scanner)>0)&&!op.movesConfirmed)missing.push('movimentações para scanner/pesagem confirmadas sem duplicidade');
  let cifValues=[];
  if(count>0&&count<=500){
    if(Array.isArray(op.cifByContainer)&&op.cifByContainer.length===count&&op.cifByContainer.every(x=>Number.isFinite(x)&&x>0)){
      cifValues=op.cifByContainer;
      if(Math.abs(cifValues.reduce((a,b)=>a+b,0)-Number(op.cif))>.02)missing.push('CIF por contêiner compatível com o CIF total');
    }else if(count===1)cifValues=[Number(op.cif)];
    else if(op.equalCifConfirmed===true)cifValues=Array(count).fill(Number(op.cif)/count);
    else missing.push('CIF de cada contêiner ou confirmação do rateio igual');
  }else if(count>500)unsupported.push('Acima de 500 contêineres: conferir o cálculo com o terminal.');
  const disclaimer='Não inclui: '+COST_EXCLUSIONS.join('; ')+'. Valores líquidos de tributos, conforme nota 5.1. Não é cotação nem custo total da importação.';
  const scope='Projeções de permanência no mesmo Tecon Santos, modalidade house. “Retirada direta” representa menor permanência; não aplica automaticamente descarga direta, DTA, despacho antecipado ou transferência a outro recinto.';
  const base={scale,source:tariff.source,tariffVersion:tariff.version,disclaimer,scope,missing:[...new Set(missing)],unsupported};
  if(missing.length||unsupported.length)return {...base,available:false,message:missing.length?'Estimativa indisponível — faltam '+[...new Set(missing)].join(', ')+'.':'Estimativa indisponível — '+unsupported.join(' ')};
  const tariffById=Object.fromEntries(tariff.tariffs.map(t=>[t.id,t]));
  const units=[...Array(scale.containers20).fill(20),...Array(scale.containers40).fill(40)].map((size,i)=>({size,cif:cifValues[i]}));
  function scenario(days){
    days=Math.ceil(Number(days));const lines=[];
    const add=(id,amount,formula)=>{const t=tariffById[id];lines.push({id,service:t.service,amount:roundMoney(amount),formula,tariff:t});};
    const storage=(id,n)=>{
      if(!n)return;const t=tariffById[id];
      const amounts=units.map(c=>Math.max(c.cif*t.value,t['min'+c.size]));
      add(id,amounts.reduce((a,b)=>a+b,0)*n,`${n} período(s) × soma por contêiner de máx(CIF individual × ${(t.value*100).toFixed(2)}%, mínimo 20’ ${formatBRL(t.min20)} / 40’ ${formatBRL(t.min40)})`);
    };
    storage('2.01',1);storage('2.02-2.04',Math.min(Math.max(days-4,0),3));storage('2.05',Math.max(days-7,0));
    for(const [key,id] of Object.entries(services)){
      const quantity=Number(op[key]);add(id,quantity*tariffById[id].value,`${quantity} ocorrência(s) × ${formatBRL(tariffById[id].value)}`);
    }
    if(op.reefer){for(const id of ['1.18','1.20','1.21']){const n=id==='1.18'?days*count:count;add(id,n*tariffById[id].value,`${n} ${id==='1.18'?'contêiner-dia':'contêiner(es)'} × ${formatBRL(tariffById[id].value)}`);}}
    const extra=op.oog?'5.8':op.imo?'5.4':op.sanitary?'5.5':null;
    if(extra){const before=lines.reduce((a,b)=>a+b.amount,0);add(extra,before*tariffById[extra].value,`${formatBRL(before)} × ${tariffById[extra].value*100}% de adicional`);}
    return {days,lines,total:roundMoney(lines.reduce((n,x)=>n+x.amount,0))};
  }
  return {...base,available:true,direta:scenario(op.daysDireta),recinto:scenario(op.daysRecinto),units,premises:op.equalCifConfirmed&&count>1?['CIF rateado igualmente por contêiner, por confirmação do usuário.']:['CIF individual por contêiner.'],calculatedAt:new Date().toISOString()};
}
