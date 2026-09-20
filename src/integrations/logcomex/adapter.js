export const LOGCOMEX_MCP_URL='https://platform.logcomex.ai/mcp';
export const MCP_STATES={CONNECTED:'conectado',AUTH:'autenticação necessária',UNAVAILABLE:'indisponível',ERROR:'erro',DEMO:'modo demonstração'};
function extractText(result){
  if(result?.isError)throw new Error('tool_error');
  if(typeof result?.payload==='string')return result.payload;
  if(typeof result?.payload?.text==='string')return result.payload.text;
  return (result?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
}
function errorState(e){return ['needs_reauth','consent_required','selection_required','approval_required','401','403'].includes(String(e?.code))?MCP_STATES.AUTH:e?.code==='server_not_connected'?MCP_STATES.UNAVAILABLE:MCP_STATES.ERROR;}
async function bounded(fn,ms){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]);}finally{clearTimeout(timer);}}
// The sole compatibility bridge for the artifact API already attempted by v8.
async function legacyTransport(){return globalThis.window?.claude?.use?await window.claude.use('mcp'):null;}
export class LogcomexMcpAdapter {
  constructor({getTransport=legacyTransport,timeout=8000}={}){this.getTransport=getTransport;this.timeout=timeout;this.status=MCP_STATES.UNAVAILABLE;this.transport=null;}
  async connect({demo=false}={}){
    if(demo){this.status=MCP_STATES.DEMO;return this.status;}
    try{
      this.transport=await bounded(()=>this.getTransport(),this.timeout);
      if(!this.transport){this.status=MCP_STATES.UNAVAILABLE;return this.status;}
      const list=await bounded(()=>this.transport.listTools('Logcomex.ai'),this.timeout);
      const servers=list?.servers||[];
      this.status=servers.some(s=>s.authStatus==='connected')?MCP_STATES.CONNECTED:servers.some(s=>['needs_reauth','consent_required'].includes(s.authStatus))?MCP_STATES.AUTH:MCP_STATES.UNAVAILABLE;
    }catch(e){this.status=errorState(e);}
    return this.status;
  }
  async query({ncm,descricao,demo=false}){
    const status=await this.connect({demo});
    const unavailable=()=>({real:false,status:this.status,source:'Logcomex',texto:demo?'DEMO — fonte externa desativada durante a apresentação.':'Consulta externa indisponível. '+(this.status===MCP_STATES.AUTH?'Autenticação necessária no cliente MCP.':'Conecte um cliente MCP compatível para consultar a Logcomex.')});
    if(status!==MCP_STATES.CONNECTED)return unavailable();
    try{
      const agents=await bounded(()=>this.transport.callTool('Logcomex.ai','list_agents',{}, {cache:false}),this.timeout);
      const raw=extractText(agents);let parsed;try{parsed=JSON.parse(raw);}catch{}
      const array=Array.isArray(parsed)?parsed:parsed?.agents;
      const ids=Array.isArray(array)?array.map(a=>a.id||a.agent_id).filter(Boolean):[...new Set(raw.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi)||[])];
      // Never guess an agent ID or silently select from multiple contracted agents.
      if(ids.length!==1)throw Object.assign(new Error('selection_required'),{code:ids.length?'selection_required':'tool_error'});
      const result=await bounded(()=>this.transport.callTool('Logcomex.ai','chat_with_agent',{agent_id:ids[0],message:`Contexto de importação: NCM ${String(ncm).replace(/\D/g,'').slice(0,8)}; mercadoria ${String(descricao||'').slice(0,160)}. Retorne um panorama com fonte e período. Não trate a resposta como liberação ou cotação.`},{cache:false}),this.timeout);
      let content=extractText(result);
      const task=content.match(/task_id\s*[=:"]+\s*"?([a-f0-9-]{36})/i);
      if(task){
        let completed=false;
        for(let attempt=0;attempt<3;attempt++){
          await new Promise(resolve=>setTimeout(resolve,400));
          const next=await bounded(()=>this.transport.callTool('Logcomex.ai','get_task_status',{task_id:task[1]},{cache:false}),this.timeout);
          content=extractText(next);let payload;try{payload=JSON.parse(content);}catch{}
          const taskStatus=payload?.status||next?.status;
          if(['failed','error','cancelled'].includes(taskStatus))throw new Error('task_error');
          if(['completed','success','done'].includes(taskStatus)){content=payload?.result?.text||payload?.result||payload?.text||content;completed=true;break;}
          if(!taskStatus&&!/processando|processing|pending|queued|running|task_id/i.test(content)&&content.trim()){completed=true;break;}
        }
        if(!completed)throw new Error('task_pending');
      }
      if(typeof content!=='string'||!content.trim())throw new Error('empty_response');
      return {real:true,status:this.status,source:'Logcomex · MCP',texto:content.slice(0,12000),queriedAt:new Date().toISOString(),url:LOGCOMEX_MCP_URL};
    }catch(e){this.status=errorState(e);return unavailable();}
  }
}
