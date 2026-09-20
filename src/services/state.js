import {uid} from '../utils/format.js';
import {deriveCargoScale} from '../engine/intake.js';
export function createOperation(){return {id:uid(),createdAt:new Date().toISOString(),op:{},provenance:{},conflicts:[],documents:[],sources:[],actionLog:[],step:0,waitingFree:false,inputMode:'question',result:null,costEstimate:null,documentIssue:null,documentDraft:null,preCheck:null,protocol:null,protocols:[],beforeSnapshot:null,afterSnapshot:null,operationStarted:false,finalized:false,demo:false,simulationResolved:false,detectedPendency:false,revision:0,logcomexData:null,lastError:null};}
export const state={...createOperation(),presentationMode:false};
export function resetOperation(){const presentationMode=state.presentationMode;Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,createOperation(),{presentationMode});}
export function setFields(fields,{kind='user',label='Informado pelo usuário',overwrite=false}={}){
  for(const [key,value] of Object.entries(fields)){
    if(value===undefined||value===null||value==='')continue;
    if(key==='escala'&&state.op.escala){const current=deriveCargoScale(state.op),incoming=deriveCargoScale({escala:value});if(current.known&&incoming.known&&current.label===incoming.label)continue;}
    if(state.op[key]!==undefined&&state.op[key]!==''&&state.op[key]!==value&&!overwrite){
      if(!state.conflicts.some(c=>c.key===key&&c.value===value))state.conflicts.push({key,current:state.op[key],value,source:label});
      continue;
    }
    state.op[key]=value;state.provenance[key]={kind:state.demo?'demo':kind,label,at:new Date().toISOString()};
  }
  state.revision++;
}
