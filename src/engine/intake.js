import {normalize,parseBRL} from '../utils/format.js';

export function deriveCargoScale(op={}){
  const t=normalize(op.escala||'');
  const values={containers20:0,containers40:0};
  const matches=[...t.matchAll(/\b(\d+)\s*(?:[x×]\s*|(?:conteiner(?:es)?|container(?:s|es)?)\s*(?:de\s*)?|de\s+)(20|40)\s*(?:ft|pes|['′])?\b/g)];
  for(const m of matches)values['containers'+m[2]]+=Number(m[1]);
  const c20=matches.length?values.containers20:Number(op.containers20||0);
  const c40=matches.length?values.containers40:Number(op.containers40||0);
  if(c20>0||c40>0)return {known:true,containers20:c20,containers40:c40,count:c20+c40,teus:c20+c40*2,containerized:true,label:[c20?`${c20}×20 pés`:'',c40?`${c40}×40 pés`:''].filter(Boolean).join(' + ')};
  const teu=t.match(/\b(\d+(?:[.,]\d+)?)\s*teus?\b/);
  const teus=teu?Number(teu[1].replace(',','.')):Number(op.teus||0);
  if(teus>0)return {known:true,count:null,teus,containerized:true,label:`${teus} TEU · quantidade/tamanhos a confirmar`};
  const count=t.match(/\b(\d+)\s*(?:conteiner(?:es)?|container(?:s|es)?)\b/);
  const generic=count?Number(count[1]):Number(op.containers||0);
  if(generic>0)return {known:true,count:generic,teus:null,containerized:true,label:`${generic} contêiner(es) · tamanho a confirmar`};
  const tons=t.match(/\b(\d+(?:[.,]\d+)?)\s*(?:toneladas?|tons?|t)\b/);
  const weight=tons?Number(tons[1].replace(',','.')):Number(op.peso_ton||0);
  if(/carga solta|breakbulk|granel/.test(t)||weight>0)return {known:true,count:null,teus:null,containerized:false,weight:weight||null,label:[/breakbulk/.test(t)?'Breakbulk':/granel/.test(t)?'Granel':'Carga solta',weight?`${weight} toneladas`:'peso/volume a confirmar'].join(' · ')};
  return {known:false,count:null,teus:null,label:'Escala não informada'};
}

export function parseFreeformOperation(text){
  const raw=String(text),t=normalize(raw),f={};
  const ncm=raw.match(/\b(?:NCM\s*[:\-]?\s*)?(\d{4})\.?\s?(\d{2})\.?\s?(\d{2})\b/i);
  if(ncm)f.ncm=ncm.slice(1).join('');
  if(/sem urgencia|baixa urgencia|nao (?:e |esta )?urgente/.test(t))f.urgencia='Baixa';
  else if(/critic[ao]|parada de linha|muito urgente/.test(t))f.urgencia='Crítica';
  else if(/urgente|alta urgencia/.test(t))f.urgencia='Alta';
  else if(/urgencia media/.test(t))f.urgencia='Média';
  if(/sem anuencia|nao (?:ha|existe|precisa de|precisa).{0,12}anuencia/.test(t))f.anuencia_prevista='Não';
  else if(/anvisa|\bmapa\b|anuencia prevista|inspecao prevista|fiscalizacao prevista/.test(t)){
    f.anuencia_prevista='Sim';
    if(/anvisa/.test(t))f.orgao_anuente='ANVISA';else if(/\bmapa\b/.test(t))f.orgao_anuente='MAPA';
  }
  if(/sem transporte|transporte[^,.;]{0,20}nao[^,.;]{0,10}(programad|agendad)|transporte[^,.;]{0,12}(nao esta|nao foi)/.test(t))f.transporte='Não';
  else if(/(?:transporte|caminhao)[^,.;]{0,25}(programad|agendad)/.test(t))f.transporte='Sim';
  if(/logistica[^,.;]{0,15}parcial|estrutura[^,.;]{0,15}parcial/.test(t))f.logistica='Parcialmente';
  else if(/(?:logistica|estrutura)[^,.;]{0,15}nao[^,.;]{0,10}pronta/.test(t))f.logistica='Não';
  else if(/(?:logistica|estrutura)[^,.;]{0,20}pronta/.test(t))f.logistica='Sim';
  if(/nao (?:sei|sabemos|confirmamos)[^,.;]{0,25}janela|janela[^,.;]{0,20}(incerta|nao confirmad|a confirmar|nao sei)|sem confirmacao[^,.;]{0,12}janela/.test(t))f.janela='Ainda não sabemos';
  else if(/sem janela|janela[^,.;]{0,12}(indisponivel|nao disponivel)/.test(t))f.janela='Não';
  else if(/janela[^,.;]{0,15}parcial/.test(t))f.janela='Parcialmente';
  else if(/janela[^,.;]{0,20}(disponivel|confirmada|compativel)/.test(t))f.janela='Sim';
  if(/sem pendencia|nenhuma pendencia|nao ha pendencia/.test(t))f.pendencia='Não';
  else if(/aguardando (?:a )?(?:anvisa|mapa|liberacao)|pendencia impeditiva|bloquead|travou/.test(t))f.pendencia='Sim';
  else if(/pendencia/.test(t))f.pendencia='Parcialmente / incerta';
  if(/sem entreposto|sem armazenagem|nao precisa[^,.;]{0,15}armazenagem/.test(t))f.entreposto='Não';
  else if(/entreposto[^,.;]{0,20}necessario|precisa[^,.;]{0,15}armazenagem|necessita[^,.;]{0,15}armazenagem/.test(t))f.entreposto='Sim';
  const desc=raw.match(/(?:importa[çc][aã]o(?:\s+urgente)?\s+de|mercadoria\s*[:\-]|produto\s*[:\-])\s*([^,.;\n]{3,100})/i);
  if(desc)f.descricao=desc[1].split(/\s+NCM\b/i)[0].trim();
  const scale=deriveCargoScale({escala:t});
  if(scale.known){
    f.escala=scale.label.replace(' · quantidade/tamanhos a confirmar','').replace(' · tamanho a confirmar','');
    if(scale.containers20||scale.containers40){f.containers20=scale.containers20;f.containers40=scale.containers40;}
    else if(scale.teus)f.teus=scale.teus;
    else if(scale.count)f.containers=scale.count;
    if(scale.weight)f.peso_ton=scale.weight;
  }
  const cif=raw.match(/\bCIF\s*(?:aproximado|total)?\s*[:\-]?\s*(?:R\$)?\s*([\d.,]+)/i);
  if(cif&&/CIF[^,;\n]{0,20}R\$/i.test(raw)&&parseBRL(cif[1])>0)f.cif=parseBRL(cif[1]);
  if(/tecon santos/.test(t))f.terminal='tecon-santos';
  const purpose=raw.match(/(?:finalidade|uso previsto)\s*[:\-]\s*([^\n;]{3,100})/i);
  if(purpose)f.finalidade=purpose[1].trim();
  return f;
}

export const QUESTIONS=[
  {key:'ncm',label:'NCM',text:'Qual é o NCM da mercadoria?',type:'free',placeholder:'8 dígitos, por exemplo 30049099',validate:v=>/^\d{8}$/.test(String(v))?null:'Informe um NCM com 8 dígitos.',clean:v=>String(v).replace(/[.\s]/g,'')},
  {key:'descricao',label:'Mercadoria',text:'Qual é a mercadoria desta operação?',type:'free',placeholder:'Descrição resumida da mercadoria'},
  {key:'escala',label:'Escala',text:'Qual é a escala desta operação?',type:'free',placeholder:'1 contêiner de 20 pés, 3x20 + 2x40, 8 TEU ou carga solta',shouldAsk:op=>!deriveCargoScale(op).known,validate:v=>deriveCargoScale({escala:v}).known?null:'Informe a quantidade e tamanho, TEU, carga solta, breakbulk ou toneladas. Citar o navio não define a escala.'},
  {key:'urgencia',label:'Urgência',text:'Qual é a urgência desta operação?',type:'choice',options:['Baixa','Média','Alta','Crítica']},
  {key:'anuencia_prevista',label:'Anuência / inspeção',text:'Existe anuência, fiscalização ou inspeção prevista?',type:'choice',options:['Não','Sim','Ainda não sabemos']},
  {key:'orgao_anuente',label:'Órgão',text:'Qual órgão está envolvido na operação?',type:'choice',options:['ANVISA','MAPA','Outro / não sei'],shouldAsk:op=>normalize(op.anuencia_prevista)!=='nao'},
  {key:'pendencia',label:'Pendência impeditiva',text:'Há alguma pendência impeditiva para retirada?',type:'choice',options:['Não','Parcialmente / incerta','Sim']},
  {key:'logistica',label:'Logística pronta',text:'A estrutura logística para retirada está pronta?',type:'choice',options:['Sim','Parcialmente','Não']},
  {key:'transporte',label:'Transporte',text:'O transporte já está programado?',type:'choice',options:['Sim','Não']},
  {key:'janela',label:'Janela',text:'A janela/agendamento do terminal está disponível e compatível?',type:'choice',options:['Sim','Parcialmente','Não','Ainda não sabemos']},
  {key:'entreposto',label:'Armazenagem',text:'Existe necessidade de armazenagem prolongada ou entreposto?',type:'choice',options:['Não','Talvez','Sim']},
  {key:'preparacao',label:'Preparação DUIMP',text:'Como está a preparação interna para a DUIMP?',type:'choice',options:['Baixa','Média','Alta']}
];
export function missingQuestions(op){return QUESTIONS.filter(q=>(!q.shouldAsk||q.shouldAsk(op))&&!String(op[q.key]??'').trim());}
export function dataCoverage(op){
  const relevant=QUESTIONS.filter(q=>q.key==='escala'||!q.shouldAsk||q.shouldAsk(op));
  const present=q=>q.key==='escala'?deriveCargoScale(op).known:!!String(op[q.key]??'').trim();
  const missing=relevant.filter(q=>!present(q)).map(q=>q.key),filled=relevant.length-missing.length,ratio=filled/relevant.length;
  return {filled,total:relevant.length,missing,ratio,level:ratio>=.85?'Alta':ratio>=.55?'Média':'Baixa'};
}
