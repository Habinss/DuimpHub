import {normalize} from '../utils/format.js';
import {parseFreeformOperation,deriveCargoScale} from '../engine/intake.js';

export function inferDocType(text){
  const n=normalize(text);
  if(/commercial invoice|\binvoice\b|fatura comercial/.test(n))return 'Invoice';
  if(/packing[ _-]?list|romaneio/.test(n))return 'Packing List';
  if(/declaracao complementar|declaracao de finalidade/.test(n))return 'Declaração complementar';
  if(/bill of lading|conhecimento de carga|\bbl\b/.test(n))return 'Conhecimento de carga / BL';
  if(/licenca|licence|\blpco\b/.test(n))return 'Licença / registro';
  if(/certificado|certificate/.test(n))return 'Certificado';
  return 'Documento da operação';
}
export function fieldsFromFileText(text){
  const f=parseFreeformOperation(text),pick=(re)=>text.match(re)?.[1]?.trim();
  const ncm=text.match(/\bNCM\s*[:\-]?\s*(\d{4})\.?\s?(\d{2})\.?\s?(\d{2})\b/i);
  delete f.ncm;if(ncm)f.ncm=ncm.slice(1).join('');
  const fields={
    importador:pick(/(?:importador|importer)\s*[:\-]\s*([^\n;]{3,100})/i),
    referencia:pick(/(?:invoice|fatura|packing list|romaneio|referencia)\s*(?:n[ºo°.]*\s*)?[:#]\s*([A-Z0-9./-]{3,60})/i),
    volumes:pick(/\b(\d+\s+(?:volumes|packages|caixas))\b/i),
    descricao:pick(/(?:mercadoria|produto|goods)\s*[:\-]\s*([^\n;]{3,120})/i)
  };
  const s=deriveCargoScale({escala:text});if(s.known)f.escala=s.label.replace(' · quantidade/tamanhos a confirmar','');
  return {...f,...Object.fromEntries(Object.entries(fields).filter(([,v])=>v))};
}
export async function extractFileText(file){
  if(!file.size)throw new Error('Documento inválido: arquivo vazio.');
  if(file.size>15*1024*1024)throw new Error('Arquivo acima do limite local de 15 MB.');
  const ext=file.name.split('.').pop().toLowerCase();
  if(['txt','csv','json','md','xml'].includes(ext))return {text:await file.text(),complete:true};
  if(ext!=='pdf')return {text:'',complete:false,error:'Não foi possível extrair o conteúdo deste arquivo neste ambiente. Formato registrado sem leitura.'};
  let pdf;
  try{
    const pdfjs=await import('../../vendor/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('../../vendor/pdf.worker.mjs',import.meta.url).href;
    pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
    if(pdf.numPages>40)return {text:'',complete:false,error:'PDF acima do limite de 40 páginas; registrado sem leitura completa.'};
    let text='';
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),content=await page.getTextContent();
      text+=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n';
      if(text.length>200000)return {text:'',complete:false,error:'PDF excede o limite de texto local; registrado sem leitura completa.'};
    }
    return {text,complete:!!text.trim(),error:!text.trim()?'Não foi possível extrair o conteúdo deste arquivo neste ambiente. PDF sem texto selecionável; OCR não disponível.':null};
  }catch{return {text:'',complete:false,error:'Não foi possível extrair o conteúdo deste arquivo neste ambiente. PDF inválido, protegido ou sem leitor disponível.'};}
  finally{await pdf?.destroy();}
}
