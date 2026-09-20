import {normalize, escapeHtml, formatBRL} from '../utils/format.js';
import {LocalKnowledgeProvider} from './providers.js';
export function initHelpAgent({getContext, toast}) {
let faqReady=false;
function costAnswer(ctx){ const e=ctx.estimate; return {intent:'cost',text:!e?.available ? (e?.message||'Estimativa indisponível — complete os parâmetros de custo.') : `Subtotal logístico-operacional estimado: retirada ${formatBRL(e.direta.total)}; permanência em recinto ${formatBRL(e.recinto.total)}.\n${e.direta.lines.map(l=>l.service+': '+formatBRL(l.amount)+' ('+l.formula+')').join('\n')}\nFonte: ${e.source.url}. ${e.scope} ${e.disclaimer}`,meta:['Base local','Operação atual',ctx.demo?'DEMO':'Motor']};}
const FAQ_SESSION_KEY='duimpHubFaqSessionV3';
const FAQ_MAX_MESSAGES=50;
const FAQ_FIELD_LABELS={
  ncm:'NCM',descricao:'mercadoria',escala:'escala da carga',urgencia:'urgência',
  anuencia_prevista:'anuência',orgao_anuente:'órgão anuente',pendencia:'pendência',
  logistica:'logística',transporte:'transporte',janela:'janela do terminal',
  entreposto:'armazenagem/entreposto',preparacao:'preparação DUIMP'
};
const faqState={messages:[],lastIntent:null,operationId:null,busy:false};

function faqLoadSession(){
  try{
    const parsed=JSON.parse(sessionStorage.getItem(FAQ_SESSION_KEY)||'null');
    if(!parsed||parsed.version!==3||!Array.isArray(parsed.messages))return;
    faqState.messages=parsed.messages.slice(-FAQ_MAX_MESSAGES).filter(m=>m&&['user','agent','system'].includes(m.role)&&typeof m.text==='string').map(m=>({
      role:m.role,text:m.text.slice(0,5000),meta:Array.isArray(m.meta)?m.meta.slice(0,4):[],intent:m.intent||null,at:m.at||null
    }));
    faqState.lastIntent=parsed.lastIntent||null;
    faqState.operationId=parsed.operationId||null;
  }catch(e){}
}
function faqSaveSession(){
  try{
    sessionStorage.setItem(FAQ_SESSION_KEY,JSON.stringify({
      version:3,operationId:faqState.operationId,lastIntent:faqState.lastIntent,
      messages:faqState.messages.slice(-FAQ_MAX_MESSAGES),updatedAt:new Date().toISOString()
    }));
  }catch(e){}
}
function faqMetaClass(label){
  const n=normalize(label);
  if(n.includes('operacao'))return'context';
  if(n.includes('simul')||n.includes('protot')||n.includes('estimativa')||n.includes('limite'))return'sim';
  return'';
}
function faqRenderMessage(message){
  const box=document.getElementById('faq-body');
  if(!box)return;
  const wrap=document.createElement('div');
  wrap.className='faq-msg '+message.role;
  const bubble=document.createElement('div');
  bubble.className='faq-bubble';
  bubble.textContent=message.text;
  wrap.appendChild(bubble);
  if(message.role!=='user'&&message.meta?.length){
    const meta=document.createElement('div');meta.className='faq-msg-meta';
    message.meta.forEach(label=>{
      const tag=document.createElement('span');tag.className='faq-meta-tag '+faqMetaClass(label);tag.textContent=label;meta.appendChild(tag);
    });
    wrap.appendChild(meta);
  }
  box.appendChild(wrap);box.scrollTop=box.scrollHeight;
}
function faqAppend(role,text,meta=[],intent=null,persist=true){
  const message={role,text:String(text||''),meta,intent,at:new Date().toISOString()};
  faqState.messages.push(message);
  if(faqState.messages.length>FAQ_MAX_MESSAGES)faqState.messages=faqState.messages.slice(-FAQ_MAX_MESSAGES);
  if(intent)faqState.lastIntent=intent;
  faqRenderMessage(message);
  if(persist)faqSaveSession();
  return message;
}
function faqWelcome(){
  return 'Olá! Este é o canal de dúvidas do DUIMP Hub. Posso explicar conceitos ou comentar os dados da operação atual. Funciono com uma base local, sem depender de internet, e não altero a análise.';
}
function faqRestoreMessages(){
  const box=document.getElementById('faq-body');
  box.innerHTML='';
  faqState.messages.forEach(faqRenderMessage);
  if(!faqState.messages.length)faqAppend('agent',faqWelcome(),['Base local','Protótipo'],'help');
}

function getFaqOperationContext(){return structuredClone(getContext())}
function faqWinnerLabel(result){
  if(!result)return'Análise ainda não concluída';
  if(result.vencedor==='direta')return'Retirada direta';
  if(result.vencedor==='recinto')return'Uso de recinto';
  return'Análise inconclusiva ou suspensa';
}
function faqMissingLabels(ctx){
  return(ctx.coverage?.missing||[]).map(k=>FAQ_FIELD_LABELS[k]||k);
}
function refreshFaqPanel(){
  const ctx=getFaqOperationContext();
  if(faqReady)faqSyncOperation(ctx);
  const el=document.getElementById('faq-context');
  if(el){
    if(!ctx.active){
      el.innerHTML='<div class="faq-context-empty"><b>Nenhuma operação em andamento.</b> Posso responder conceitos gerais; os comentários contextuais aparecem quando houver dados.</div>';
    }else{
      const detail=[ctx.op.descricao||null,ctx.op.ncm?('NCM '+ctx.op.ncm):null,ctx.scale.known?ctx.scale.label:null].filter(Boolean).join(' · ');
      el.innerHTML=`<div class="faq-context-top"><b>${escapeHtml(ctx.id)} · ${escapeHtml(ctx.status.label)}</b><span>${escapeHtml(faqWinnerLabel(ctx.result))}</span></div><div class="faq-context-detail">${escapeHtml(detail||ctx.status.stage)}</div>`;
    }
  }
  faqRenderQuickQuestions(ctx);
}
function faqQuickQuestions(ctx){
  if(!ctx.active)return['O que é DUIMP?','Retirada direta x recinto','O que é anuência?','Quais documentos podem aparecer?'];
  const items=['Resuma esta operação','O que está travando?'];
  if(ctx.result)items.push('Por que esse resultado apareceu?');else items.push('Qual é o próximo passo?');
  if(ctx.missingDocuments.length)items.push('Quais documentos faltam?');
  else if(ctx.documents.length)items.push('Quais documentos estão registrados?');
  else items.push('Quais documentos devo conferir?');
  if(ctx.estimate)items.push('Como o custo foi calculado?');
  return items.slice(0,5);
}
function faqRenderQuickQuestions(ctx=getFaqOperationContext()){
  const wrap=document.getElementById('faq-quick');if(!wrap)return;
  wrap.innerHTML='';
  faqQuickQuestions(ctx).forEach(question=>{
    const b=document.createElement('button');b.type='button';b.className='faq-chip';b.textContent=question;
    b.addEventListener('click',()=>faqAsk(question));wrap.appendChild(b);
  });
  wrap.scrollLeft=0;
}
function faqSyncOperation(ctx){
  if(faqState.operationId&&faqState.operationId!==ctx.id){
    faqState.lastIntent=null;
    faqAppend('system',ctx.active
      ?`O contexto ativo agora é ${ctx.id}. As próximas respostas usam somente os dados dessa operação.`
      :'A operação anterior não está mais ativa. As mensagens acima permanecem apenas como histórico desta sessão.',
      ['Operação atual'],null,false);
  }
  faqState.operationId=ctx.active?ctx.id:null;
  faqSaveSession();
}

function faqDetectIntent(question,ctx){
  const q=normalize(question).replace(/[?!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  const contextual=/\b(meu caso|nesta operacao|nessa operacao|operacao atual|aqui|desta operacao|dessa operacao)\b/.test(q);
  const asksSpecificRule=/\b(obrigatorio|obrigatoria|prazo legal|lei|norma|portaria|vigente|aliquota|tarifa oficial|exige|exigido|pode liberar|autorizado|autorizacao oficial)\b/.test(q)||(/\bncm\b/.test(q)&&/\b(anvisa|mapa|anuencia|lpco|exige|precisa)\b/.test(q));
  if(asksSpecificRule)return'current_rule';
  if(/\b(prototipo|simulacao|simulado|offline|sem internet|base local|dado real)\b/.test(q))return'limits';
  if(/\b(resum[a-z]*|panorama|situacao geral)\b/.test(q)&&(/\boperacao\b/.test(q)||ctx.active))return'operation_summary';
  if(/\b(status|situacao)\b/.test(q)&&ctx.active)return'operation_summary';
  if(/\b(o que esta faltando|o que falta|esta faltando|falta o que|travando|bloqueio|bloqueado|pendencia atual)\b/.test(q))return'operation_blocker';
  if(/\b(proximo passo|o que faco agora|como continuar|e agora)\b/.test(q))return'next_step';
  if((/\b(por que|porque|motivo|explica)\b/.test(q)&&/\b(resultado|direta|recinto|escolh|indic|recomend)\b/.test(q))||q==='por que'||q==='porque')return'result_reason';
  if(/\b(qual caminho|qual opcao|melhor opcao|recomendacao|vale mais|devo usar)\b/.test(q))return'result_reason';
  if(/\b(custo|custos|gasto|valor|preco|estimativa|calculad|faixa)\b/.test(q))return'cost';
  if(/\b(escala|teu|conteiner|container|20 pes|40 pes)\b/.test(q))return'scale';
  if(/quais documentos (tenho|faltam|tem|ha)/.test(q))return'operation_documents';
  if(/\b(documentos? falt|o que falta nos documentos|pendencia documental)\b/.test(q))return'operation_documents';
  if(/\b(documentos? (tenho|registrad|enviad|adicionad)|quais documentos estao)\b/.test(q))return'operation_documents';
  if(/\b(anuencia|orgao anuente|anvisa|mapa)\b/.test(q)&&contextual)return'operation_anuence';
  if((q==='e no meu caso'||q==='e neste caso'||q==='e nessa operacao'||q==='e aqui')&&faqState.lastIntent){
    if(['duimp','direct','warehouse','comparison'].includes(faqState.lastIntent))return'result_reason';
    if(['documents','operation_documents'].includes(faqState.lastIntent))return'operation_documents';
    if(['anuence','operation_anuence'].includes(faqState.lastIntent))return'operation_anuence';
    if(['cost','scale'].includes(faqState.lastIntent))return faqState.lastIntent;
    return'operation_summary';
  }
  if(/\b(lpco|licencas permissoes certificados)\b/.test(q))return'lpco';
  if(/\b(retirada direta)\b/.test(q)&&/\b(recinto|versus| vs |diferenca|compar)\b/.test(' '+q+' '))return'comparison';
  if(/\b(retirada direta)\b/.test(q))return'direct';
  if(/\b(recinto alfandegado|recinto)\b/.test(q))return'warehouse';
  if(/\b(anuencia|orgao anuente|anvisa|mapa)\b/.test(q))return'anuence';
  if(/\b(invoice|commercial invoice|fatura comercial)\b/.test(q))return'invoice';
  if(/\b(packing list|romaneio)\b/.test(q))return'packing';
  if(/\b(conhecimento de carga|bill of lading|\bbl\b)\b/.test(q))return'bl';
  if(/\b(documento|documentos|documentacao|checklist)\b/.test(q))return contextual?'operation_documents':'documents';
  if(/\b(entreposto|armazenagem|armazenamento)\b/.test(q))return'entreposto';
  if(/\boea\b/.test(q))return'oea';
  if(/\b(ncm|classificacao fiscal)\b/.test(q))return'ncm';
  if(/\b(catalogo de produtos|catalogo)\b/.test(q))return'catalog';
  if(/\bduimp\b/.test(q))return'duimp';
  if(/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|o que voce faz|como funciona)\b/.test(q))return'help';
  return'fallback';
}

function faqAnswer(question,ctx){
  const intent=faqDetectIntent(question,ctx);
  if(intent==='cost')return costAnswer(ctx);
  const local=['Base local'];
  const contextual=['Base local','Operação atual',ctx.demo?'DEMO':'Motor'];
  if(intent==='duimp')return{intent,text:'A DUIMP é a Declaração Única de Importação elaborada no módulo de Importação do Portal Único Siscomex. Ela reúne dados da operação, da carga, dos documentos, dos itens e do tratamento administrativo. A aplicação e os campos válidos dependem do escopo vigente no Portal Único; este chat explica o conceito, mas não registra nem valida uma declaração.',meta:local};
  if(intent==='direct')return{intent,text:'Neste protótipo, retirada direta é o cenário em que a carga segue para retirada com menor permanência, desde que liberação, documentos, transporte, janela e estrutura logística estejam compatíveis. Não é uma autorização automática: qualquer pendência, inspeção ou indisponibilidade operacional pode impedir ou reduzir a vantagem desse caminho.',meta:['Base local','Protótipo']};
  if(intent==='warehouse')return{intent,text:'Recinto alfandegado é uma instalação autorizada e submetida ao controle aduaneiro, usada para movimentação, armazenagem e procedimentos sobre cargas. No comparador, o uso de recinto tende a ganhar peso quando há pendência, inspeção, janela indisponível, transporte não programado ou necessidade de armazenagem. A escolha real depende do terminal, do regime e das liberações aplicáveis.',meta:['Base local','Protótipo']};
  if(intent==='comparison')return{intent,text:'Não existe vencedor universal. A retirada direta tende a exigir liberação e sincronização entre documentos, transporte e janela; o recinto oferece margem para armazenagem, inspeção e regularização, mas pode acrescentar etapas e custos. O DUIMP Hub compara essas condições operação por operação e apresenta uma tendência demonstrativa, nunca uma liberação oficial.',meta:['Base local','Protótipo']};
  if(intent==='anuence')return{intent,text:'Anuência é o controle administrativo exercido por um órgão competente sobre determinadas mercadorias ou operações. Quando aplicável, o processo pode envolver LPCO, documentos, inspeção ou outras condições do órgão. O NCM sozinho não basta para este chat afirmar a exigência: produto, atributos, finalidade e regra vigente também precisam ser confirmados no Portal Único e na fonte oficial.',meta:['Base local','Limite do protótipo']};
  if(intent==='lpco')return{intent,text:'LPCO significa Licenças, Permissões, Certificados e Outros Documentos. No Portal Único, o módulo é usado quando o tratamento administrativo da importação requer um pedido ou documento específico. O modelo correto e o momento do pedido dependem da mercadoria e da regra vigente; a base offline não valida um enquadramento específico.',meta:['Base local','Limite do protótipo']};
  if(intent==='documents')return{intent,text:'Documentos comuns podem incluir Commercial Invoice, Packing List e conhecimento de carga, além de documentos instrutivos, certificados ou LPCO conforme a operação. Isso é uma referência geral, não uma lista universal. O conjunto correto depende da mercadoria, do modal, do tratamento administrativo, do regime e das exigências vigentes.',meta:['Base local','Limite do protótipo']};
  if(intent==='invoice')return{intent,text:'A Commercial Invoice registra os dados comerciais da operação, como partes, mercadoria, valores, moeda e condições negociadas. No protótipo, ela pode fornecer alguns dados ao contexto, mas a leitura local não comprova validade, autenticidade ou suficiência documental.',meta:['Base local','Protótipo']};
  if(intent==='packing')return{intent,text:'O Packing List, ou romaneio de carga, detalha a composição física dos volumes — por exemplo, quantidades, pesos, medidas e identificação das embalagens. Ele ajuda a conferir a carga, mas não substitui a Invoice nem eventuais documentos regulatórios.',meta:local};
  if(intent==='bl')return{intent,text:'O conhecimento de carga documenta o transporte. No modal marítimo, é comum a referência ao Bill of Lading (BL). Dados, formato e efeitos variam conforme o modal e a operação; o protótipo apenas registra o documento informado, sem validá-lo perante transportador ou autoridade.',meta:['Base local','Protótipo']};
  if(intent==='entreposto')return{intent,text:'Armazenagem é a permanência física da carga no recinto. Entreposto aduaneiro é um regime específico, com requisitos próprios, e não deve ser tratado como sinônimo automático de qualquer armazenagem. Neste protótipo, o campo representa a necessidade operacional de permanência/entreposto e influencia apenas a comparação simulada.',meta:['Base local','Protótipo']};
  if(intent==='oea')return{intent,text:'OEA é o Programa Brasileiro de Operador Econômico Autorizado, que certifica intervenientes considerados de baixo risco e confiáveis em critérios definidos pela Receita Federal. Benefícios e modalidades devem ser verificados nas regras vigentes; este protótipo não consulta nem confirma a certificação de uma empresa.',meta:['Base local','Limite do protótipo']};
  if(intent==='ncm')return{intent,text:'A NCM classifica fiscalmente a mercadoria e participa de regras tributárias e de tratamento administrativo. Uma decisão não deve ser tomada apenas pelo código: descrição, atributos, finalidade, origem e normas vigentes podem mudar o enquadramento. O protótipo armazena o NCM informado, mas não certifica a classificação.',meta:['Base local','Limite do protótipo']};
  if(intent==='catalog')return{intent,text:'O Catálogo de Produtos do Portal Único organiza dados dos produtos e do operador estrangeiro para reaproveitamento nas operações. O cadastro exige consistência com a classificação e os atributos do item. Este arquivo não está conectado ao Portal Único e não cria nem valida itens do catálogo.',meta:['Base local','Protótipo']};
  if(intent==='limits')return {intent,text:'Base local com contexto ao vivo, sem IA generativa ativa. Memória restrita à sessão. Pré-check e protocolo são simulações; o motor não concede liberações. Custos usam o catálogo local de tarifas e parâmetros informados; MCP só aparece como fonte externa após retorno real.',meta:['Base local','Limites']};
  if(intent==='current_rule')return{intent,text:`A base offline não confirma obrigação, prazo, tarifa ou exigência vigente para um caso específico${ctx.op.ncm?' (NCM '+ctx.op.ncm+')':''}. Posso explicar o conceito e organizar os dados desta operação, mas a confirmação deve ser feita no tratamento administrativo do Portal Único, na norma aplicável, no órgão anuente, no terminal ou com o responsável aduaneiro.`,meta:['Base local','Limite do protótipo']};
  if(intent==='operation_summary'){
    if(!ctx.active)return{intent,text:'Ainda não há dados de uma operação nesta tela. Inicie uma análise ou adicione documentos; depois posso resumir status, cobertura, escala, pendências e resultado sem alterar o fluxo.',meta:contextual};
    const lines=[`Panorama de ${ctx.id}:`,`• Status: ${ctx.status.label} — ${ctx.status.stage}.`];
    if(ctx.op.descricao||ctx.op.ncm)lines.push(`• Carga: ${ctx.op.descricao||'não descrita'}${ctx.op.ncm?' · NCM '+ctx.op.ncm:''}.`);
    lines.push(`• Escala: ${ctx.scale.known?ctx.scale.label:'ainda não informada'}.`);
    lines.push(`• Dados: cobertura ${ctx.coverage.level.toLowerCase()} (${ctx.coverage.filled}/${ctx.coverage.total}).`);
    lines.push(`• Documentos: ${ctx.documents.length} registrado(s)${ctx.missingDocuments.length?' · faltam '+ctx.missingDocuments.join(', '):''}.`);
    if(ctx.result)lines.push(`• Resultado do motor: ${ctx.result.resultado}.`);
    lines.push(`Ponto de atenção: ${ctx.blocker}`);
    return{intent,text:lines.join('\n'),meta:contextual};
  }
  if(intent==='operation_blocker'){
    if(!ctx.active)return{intent,text:'Sem uma operação em andamento, não há como identificar bloqueios. Posso explicar quais fatores normalmente merecem conferência: documentos, anuência, liberação, transporte, janela, logística e necessidade de armazenagem.',meta:contextual};
    const parts=[];
    if(ctx.missingDocuments.length)parts.push(`O pré-check local marcou como faltante: ${ctx.missingDocuments.join(', ')}.`);
    parts.push(`Principal ponto de atenção: ${ctx.blocker}`);
    const missing=faqMissingLabels(ctx);if(missing.length)parts.push(`Dados ainda não preenchidos: ${missing.join(', ')}.`);
    parts.push('Isso é uma leitura do protótipo, não uma retenção ou exigência confirmada por órgão/terminal.');
    return{intent,text:parts.join('\n'),meta:contextual};
  }
  if(intent==='next_step'){
    if(!ctx.active)return{intent,text:'Primeiro, descreva a operação ou inicie o questionário guiado. Este chat é somente para dúvidas e não preenche a análise por conta própria.',meta:contextual};
    return{intent,text:`Próximo passo sugerido pelo protótipo: ${ctx.nextAction}\nAntes de executar, confirme o status real com os responsáveis e sistemas aplicáveis.`,meta:contextual};
  }
  if(intent==='result_reason'){
    if(!ctx.active)return{intent,text:'Ainda não existe uma operação para comparar. A análise precisa de contexto sobre carga, escala, urgência, pendências, logística, transporte, janela e armazenagem.',meta:contextual};
    if(!ctx.result){const missing=faqMissingLabels(ctx);return{intent,text:`A comparação ainda não foi concluída${missing.length?'. Faltam: '+missing.join(', '):''}. Continue o fluxo principal; este chat não altera nem finaliza a análise.`,meta:contextual};}
    const reasons=(ctx.result.fatores||[]).slice(0,4);
    const warnings=[...(ctx.result.conflitos||[]),...(ctx.result.alertas||[])].slice(0,2);
    let text=`O motor marcou: ${ctx.result.resultado}.\nCaminho destacado: ${faqWinnerLabel(ctx.result)}.`;
    if(reasons.length)text+=`\nFatores usados: ${reasons.join(' ')}`;
    if(warnings.length)text+=`\nRessalvas: ${warnings.join(' ')}`;
    text+=`\nPróximo passo: ${ctx.nextAction}\nÉ uma comparação heurística do protótipo, não autorização operacional.`;
    return{intent,text,meta:contextual};
  }
  if(intent==='operation_documents'){
    if(!ctx.active)return{intent,text:'Nenhuma operação está ativa. Como referência geral, Invoice, Packing List e conhecimento de carga são documentos frequentes, mas a lista correta varia conforme a operação e o tratamento administrativo.',meta:contextual};
    const list=ctx.documents.length?ctx.documents.map(d=>`• ${d.type}: ${d.status}${d.generated?' (gerado no protótipo)':''}`).join('\n'):'• Nenhum documento registrado nesta operação.';
    let text=`Documentos em ${ctx.id}:\n${list}`;
    if(ctx.missingDocuments.length)text+=`\nO pré-check simulado marcou como faltante: ${ctx.missingDocuments.join(', ')}.`;
    else if(ctx.preCheck)text+='\nO checklist local não marcou falta neste momento, mas isso não equivale a conferência ou liberação oficial.';
    else text+='\nAinda não houve pré-check local; não posso afirmar que a documentação está completa.';
    return{intent,text,meta:contextual};
  }
  if(intent==='operation_anuence'){
    if(!ctx.active)return{intent,text:'Não há operação ativa para contextualizar a anuência. Em geral, a aplicabilidade precisa ser confirmada pelo tratamento administrativo e pelos atributos reais da mercadoria.',meta:contextual};
    const informed=ctx.op.anuencia_prevista||'não informado';
    const agency=ctx.op.orgao_anuente||'não confirmado';
    return{intent,text:`Nesta operação, a anuência/fiscalização foi informada como “${informed}” e o órgão aparece como “${agency}”. Isso é dado do usuário ou inferência do protótipo; não confirma exigência, deferimento ou dispensa. Verifique o tratamento administrativo vigente no Portal Único e a orientação do órgão competente.`,meta:contextual};
  }
  if(intent==='scale')return {intent,text:ctx.active ? `Escala informada: ${ctx.scale.label}. ${ctx.scale.teus ? ctx.scale.teus+' TEU equivalentes.' : 'Sem conversão automática para TEU.'} Nenhuma quantidade é assumida a partir do navio.` : 'Informe contêineres de 20/40 pés, TEU, carga solta, breakbulk ou toneladas. Para precificar por contêiner, precisamos da quantidade e tamanho.',meta:contextual};

  if(intent==='cost')return costAnswer(ctx);

  if(intent==='help')return{intent,text:'Posso explicar DUIMP, retirada direta, recinto, anuência, LPCO, documentos, NCM, escala e limites do protótipo. Se houver uma operação em andamento, também resumo o status, mostro o que falta, explico o resultado e detalho a estimativa — sempre em modo somente leitura.',meta:['Base local','Protótipo']};
  return{intent,text:'Não encontrei uma resposta segura na base local para essa formulação. Tente perguntar sobre DUIMP, retirada direta, recinto, anuência, documentos, escala, custo ou sobre o status da operação atual. Para regra vigente, exigência por NCM, prazo ou tarifa oficial, confirme na fonte competente.',meta:['Base local','Limite do protótipo']};
}

function faqThinking(){
  const box=document.getElementById('faq-body');
  const wrap=document.createElement('div');wrap.className='faq-msg agent';wrap.id='faq-thinking';wrap.setAttribute('role','status');
  const bubble=document.createElement('div');bubble.className='faq-bubble faq-loading';bubble.textContent='Consultando a base local…';wrap.appendChild(bubble);box.appendChild(wrap);box.scrollTop=box.scrollHeight;
}
function faqSetBusy(busy){
  faqState.busy=busy;document.getElementById('faq-input').disabled=busy;document.getElementById('faq-send').disabled=busy;
}
function faqAsk(question){
  const q=String(question||'').trim();if(!q||faqState.busy)return;
  const ctx=getFaqOperationContext();faqSyncOperation(ctx);
  faqAppend('user',q);faqSetBusy(true);faqThinking();
  setTimeout(()=>{
    try{
      const answer=localProvider.answer(q,getFaqOperationContext());
      document.getElementById('faq-thinking')?.remove();
      faqAppend('agent',answer.text,answer.meta,answer.intent);
    }catch(e){
      document.getElementById('faq-thinking')?.remove();
      faqAppend('agent','Não consegui montar a resposta local. Tente reformular a pergunta; a análise principal não foi alterada.',['Base local','Protótipo'],'fallback');
    }finally{
      faqSetBusy(false);refreshFaqPanel();document.getElementById('faq-input').focus();
    }
  },180);
}
function faqSubmit(){
  const input=document.getElementById('faq-input'),q=input.value.trim();if(!q)return;
  input.value='';faqAsk(q);
}
function faqOpen(){
  const panel=document.getElementById('faq-panel'),toggle=document.getElementById('faq-toggle');
  panel.classList.add('open');panel.inert=false;panel.setAttribute('aria-hidden','false');toggle.setAttribute('aria-expanded','true');
  refreshFaqPanel();setTimeout(()=>document.getElementById('faq-input').focus(),30);
}
function faqClose(){
  const panel=document.getElementById('faq-panel'),toggle=document.getElementById('faq-toggle');
  panel.classList.remove('open');panel.inert=true;panel.setAttribute('aria-hidden','true');toggle.setAttribute('aria-expanded','false');toggle.focus();
}
function faqClear(){
  faqState.messages=[];faqState.lastIntent=null;faqState.operationId=getFaqOperationContext().id;
  try{sessionStorage.removeItem(FAQ_SESSION_KEY)}catch(e){}
  faqRestoreMessages();faqSaveSession();toast('Conversa do agente limpa.');
}

const localProvider = new LocalKnowledgeProvider(faqAnswer);
faqLoadSession();faqRestoreMessages();faqReady=true;refreshFaqPanel();
document.getElementById('faq-toggle').addEventListener('click',()=>document.getElementById('faq-panel').classList.contains('open')?faqClose():faqOpen());
document.getElementById('faq-close').addEventListener('click',faqClose);
document.getElementById('faq-clear').addEventListener('click',faqClear);
document.getElementById('faq-send').addEventListener('click',faqSubmit);
document.getElementById('faq-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();faqSubmit()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('faq-panel').classList.contains('open'))faqClose()});

return {refresh:refreshFaqPanel,close:faqClose};
}
