export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
export function normalize(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
export function uid(){return globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);}
export function parseBRL(value){
  if(typeof value==='number')return Number.isFinite(value)?value:NaN;
  let s=String(value??'').trim().replace(/R\$\s*/g,'').replace(/\s/g,'');
  if(!s)return NaN;
  if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d+(,\d{1,2})?$/.test(s))s=s.replace(',','.');
  else if(!/^\d+(\.\d{1,2})?$/.test(s))return NaN;
  return Number(s);
}
export function formatBRL(n){return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'indisponível';}
export const roundMoney=n=>Math.round((n+Number.EPSILON)*100)/100;
export function dateBR(iso){return iso?new Date(iso).toLocaleString('pt-BR'):'—';}
