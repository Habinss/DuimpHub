export const STORAGE_KEY='duimpHubAnalysesDocumentalV2';
export class HistoryStore {
  constructor(storage,onError=()=>{}){this.storage=storage;this.onError=onError;this.memory=[];this.corrupt=false;}
  read(){
    try{
      const raw=this.storage.getItem(STORAGE_KEY);
      if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||parsed.some(x=>!x||typeof x.id!=='string'||!x.op||typeof x.op!=='object'))throw new SyntaxError('Histórico inválido');
        const byId=new Map(parsed.map(x=>[x.id,x]));
        for(const m of this.memory){const old=byId.get(m.id);if(!old||(m.updatedAt||m.createdAt)>(old.updatedAt||old.createdAt))byId.set(m.id,m);}
        this.memory=[...byId.values()];
      }
      this.corrupt=false;
    }catch(error){
      this.corrupt=error instanceof SyntaxError;
      this.onError(this.corrupt?'Histórico local inválido: o conteúdo original foi preservado. Exporte um backup para recuperação. Novas operações ficam apenas nesta sessão.':'Armazenamento local indisponível. As análises ficam nesta sessão; exporte o histórico antes de fechar.');
    }
    return structuredClone(this.memory).sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''));
  }
  save(item){
    const list=this.read(),old=list.find(x=>x.id===item.id);
    const snapshot=structuredClone({...item,createdAt:old?.createdAt||item.createdAt,updatedAt:new Date().toISOString(),schemaVersion:3});
    this.memory=[snapshot,...list.filter(x=>x.id!==item.id)];
    if(this.corrupt)return false;
    try{this.storage.setItem(STORAGE_KEY,JSON.stringify(this.memory));return true;}
    catch{this.onError('Não foi possível salvar no navegador. Histórico mantido nesta sessão; exporte o backup para não perdê-lo.');return false;}
  }
  backup(){let original=null;try{original=this.storage.getItem(STORAGE_KEY);}catch{}return {format:'duimp-hub-backup',version:3,exportedAt:new Date().toISOString(),operations:this.read(),original};}
}
