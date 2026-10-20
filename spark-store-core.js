import {caseKey} from './case-save.js?v=20261015.3';
import {ACTIVITY_FIELDS,identityFields,validateInput,auditFor,activityForDisplay,SparkError} from './spark-policy.js?v=20261020.spark1';

export function createSparkStore(database,auth,api) {
  const {ref,get,update,runTransaction,serverTimestamp,onValue}=api;
  async function transaction(reference,callback) {
    const stop=onValue(reference,()=>{});
    try {await get(reference);return await runTransaction(reference,callback,{applyLocally:false});}
    finally {stop();}
  }
  const current=()=>{if(!auth.currentUser)throw new SparkError('Entre novamente.');return auth.currentUser.uid;};
  async function access(uid) {
    const value=(await get(ref(database,`access/${uid}`))).val();
    if(current()!==uid||value?.active!==true||!['administrador','coordenador','tecnico'].includes(value.role))throw new SparkError('Seu perfil não permite gravar.');
    return value;
  }
  async function saveCase(body) {
    if(!body||!['create','update','import'].includes(body.operation))throw new SparkError('Operação inválida.');
    const uid=current(),profile=await access(uid),imported=body.operation==='import',editing=body.operation==='update';
    validateInput(body.data,imported);
    if(imported&&profile.role!=='administrador')throw new SparkError('Somente administrador pode importar.');
    if(editing) {
      const result=await transaction(ref(database,`casos/${body.caseKey}`),old=>{
        if(auth.currentUser?.uid!==uid||!old||old.numeroProntuario!==body.data.numeroProntuario)return;
        if(Object.keys(body.data).some(k=>(old[k]??'')!==(body.expected[k]??'')))return;
        return {...old,...body.data,origemCadastro:old.origemCadastro??'legado',auditoria:auditFor(old.auditoria,uid,serverTimestamp(),true)};
      },{applyLocally:false});
      return {committed:result.committed,caseKey:body.caseKey};
    }
    if((await get(ref(database,'securityPolicy/identityRegistryReady'))).val()!==true)throw new SparkError('Novos cadastros estão bloqueados até a conferência administrativa do índice de prontuários.');
    const identity=identityFields(body.data.numeroProntuario),key=await caseKey(body.data.numeroProntuario);
    if((await get(ref(database,`identidades/${identity.identidade}`))).exists())return {committed:false,duplicate:true};
    const offset=await new Promise((resolve,reject)=>onValue(ref(database,'.info/serverTimeOffset'),snapshot=>resolve(snapshot.val()||0),reject,{onlyOnce:true}));
    const inicioMs=Math.floor((Date.now()+offset)/3600000)*3600000;
    for(let attempt=0;attempt<30;attempt++) {
      let slot=null;
      if(profile.role!=='administrador') {
        const used=(await get(ref(database,`cotasManuais/${uid}/${inicioMs}`))).val()||{};
        slot=Array.from({length:30},(_,i)=>String(i)).find(s=>!Object.hasOwn(used,s));
        if(slot===undefined)throw new SparkError('Limite de 30 cadastros manuais por hora atingido. Solicite a importação ao administrador.');
      }
      const record={...body.data,...identity,origemCadastro:imported?'planilha':'manual',auditoria:auditFor(null,uid,serverTimestamp())};
      const patch={[`casos/${key}`]:record,[`identidades/${identity.identidade}`]:key};
      if(slot!==null) {
        record.quota={inicioMs,slot};
        patch[`cotasManuais/${uid}/${inicioMs}/${slot}`]={caseId:key,inicioMs,criadoEmMs:serverTimestamp()};
      }
      if(current()!==uid)throw new SparkError('Sessão encerrada.');
      try {await update(ref(database),patch);return {committed:true,caseKey:key};}
      catch(error) {
        if(current()!==uid)throw error;
        if((await get(ref(database,`identidades/${identity.identidade}`))).exists())return {committed:false,duplicate:true};
        // Only retry a proven quota-slot race, not general permission failures.
        if(slot!==null&&(await get(ref(database,`cotasManuais/${uid}/${inicioMs}/${slot}`))).exists())continue;
        throw error;
      }
    }
    throw new SparkError('Cadastros concorrentes ocuparam as vagas. Tente novamente.');
  }
  async function saveActivity({caseKey,field,value,expected}) {
    const uid=current();await access(uid);
    const input=JSON.parse(value),kind=field.startsWith('agenda_')?'agenda':'tarefas';
    if(!/^(agenda|pendencia)_[A-Za-z0-9_-]{1,100}$/.test(field)||input.kind!==kind)throw new SparkError('Atividade inválida.');
    const data=Object.fromEntries(ACTIVITY_FIELDS.filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]));
    const legacy=(await get(ref(database,`casos/${caseKey}/${field}`))).val();
    const result=await transaction(ref(database,`atividades/${caseKey}/${field}`),old=>{
      if(auth.currentUser?.uid!==uid)return;
      const displayed=old?JSON.stringify(activityForDisplay(old)):legacy??null;
      if(displayed!==expected)return;
      return {...data,auditoria:auditFor(old?.auditoria,uid,serverTimestamp())};
    },{applyLocally:false});
    return {committed:result.committed};
  }
  async function sharedSummary() {
    current();
    const value=(await get(ref(database,'compartilhavel/resumo'))).val();
    if(!value)return {published:false};
    return {published:true,casesRange:value.faixa===0?'Menos de 10':`${value.faixa*10} a ${value.faixa*10+9}`};
  }
  async function publishSummary(total) {
    const uid=current(),profile=await access(uid);
    if(profile.role!=='administrador')throw new SparkError('Somente administrador publica resumos.');
    await transaction(ref(database,'compartilhavel/resumo'),old=>auth.currentUser?.uid===uid?{schema:1,faixa:Math.floor(total/10),revisao:(old?.revisao??0)+1,publicadoEmMs:serverTimestamp()}:undefined,{applyLocally:false});
  }
  return {saveCase,saveActivity,sharedSummary,publishSummary};
}
