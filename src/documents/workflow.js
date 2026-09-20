export const REQUIRED_DEMO_DOCS=['Invoice','Packing List','Declaração complementar'];
export function validDocument(d){return d.validated===true&&['real','demo','engine'].includes(d.extractionMode)&&d.status!=='Erro';}
export function checkDocuments(documents,{enabled=false}={}){
  if(!enabled)return null;
  const missing=REQUIRED_DEMO_DOCS.filter(type=>!documents.some(d=>d.type===type&&validDocument(d)));
  const unread=documents.filter(d=>!validDocument(d)).map(d=>d.name);
  const canGenerate=missing.includes('Declaração complementar')&&['Invoice','Packing List'].every(t=>documents.some(d=>d.type===t&&validDocument(d)));
  return {missing,unread,canGenerate,status:missing.length||unread.length?'PENDÊNCIA DOCUMENTAL':'CHECKLIST SIMULADO COMPLETO',kind:'sim',required:REQUIRED_DEMO_DOCS};
}
export function draftFields(op,docs){
  const inv=docs.find(d=>d.type==='Invoice'&&validDocument(d))?.extracted||{};
  const pl=docs.find(d=>d.type==='Packing List'&&validDocument(d))?.extracted||{};
  return {orgao:op.orgao_anuente||'',ncm:op.ncm||inv.ncm||'',mercadoria:op.descricao||inv.descricao||'',importador:op.importador||inv.importador||'',invoice:inv.referencia||'',packing:pl.referencia||'',volumes:pl.volumes||'',finalidade:op.finalidade||inv.finalidade||pl.finalidade||''};
}
export const DRAFT_LABELS={orgao:'Órgão informado',ncm:'NCM',mercadoria:'Mercadoria',importador:'Importador',invoice:'Referência da Invoice',packing:'Referência do Packing List',volumes:'Volumes',finalidade:'Finalidade da importação'};
export function missingDraftFields(draft){return Object.keys(DRAFT_LABELS).filter(k=>!String(draft[k]||'').trim());}
