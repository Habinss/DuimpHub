export class LocalKnowledgeProvider {
  constructor(answer){this.resolve=answer;}
  answer(question,context){return this.resolve(question,structuredClone(context));}
}
export class OperationContextProvider {
  constructor(read){this.read=read;}
  snapshot(){return structuredClone(this.read());}
}
// No hosted model is configured. A host may inject a function with its own server-side
// authentication. Never put API keys in frontend code or browser persistence.
export class LLMProvider {
  constructor(invoke=null){this.invoke=invoke;}
  get available(){return typeof this.invoke==='function';}
  async answer(question,context){
    if(!this.available)throw new Error('LLM indisponível');
    const result=await this.invoke({question,context:structuredClone(context),readOnly:true});
    if(typeof result?.text!=='string'||!result.text.trim())throw new Error('Resposta LLM inválida');
    return {text:result.text,meta:['IA generativa','Operação atual'],intent:'llm'};
  }
}
