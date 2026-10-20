const { createHash } = require('node:crypto');
const CASE_FIELDS = new Set(['numeroProntuario','dataEntrada','docOrigem','origemCaso','cor','detalheOrigem','situacaoAtual','detalheSituacao','nomeCriad','responsavelNome','responsavelCpf','comunicacaoViolencia','oficioViolencia','encaminhamentosSolicitados','detalheEncaminhamento','dataOficioEnc','retornoSolicitado','infoRetorno','estudoCaso','piaElaborado','outrasPendencias','datasTexto','tecnicosReferencia','tipoViolencia','violenciaSexual','outrasViolencias']);
const IMPORT_FIELDS = new Set([...CASE_FIELDS,'dadosPlanilha','historicoPlanilha','origemImportacao']);
const WRITERS = new Set(['administrador','coordenador','tecnico']);
const STATUSES = new Set(['ativo','suspenso','encerrado_com_protecao','encerrado_sem_protecao','nao_competencia']);
class PolicyError extends Error { constructor(code,message) { super(message); this.code=code; } }
const fail = (code,message) => { throw new PolicyError(code,message); };
const object = value => value !== null && typeof value==='object' && !Array.isArray(value);
function identity(value) {
  const id=String(value??'').normalize('NFKC').trim().toUpperCase();
  return /^\d+$/.test(id)?id.replace(/^0+(?=\d)/,''):id;
}
const caseKey = number => 'case_'+createHash('sha256').update(identity(number),'utf8').digest('hex');
function dateValid(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T12:00:00Z');
  return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;
}
function fields(value, allowed) {
  if(!object(value))fail('invalid-argument','Dados inválidos.');
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>900000)fail('invalid-argument','Registro muito grande.');
  for(const [key,v] of Object.entries(value)) {
    if(!allowed.has(key)||typeof v!=='string'||v.length>20000)fail('invalid-argument','Campo não permitido, tipo ou tamanho inválido.');
  }
  return {...value};
}
function validateCase(value, imported=false) {
  const data=fields(value,imported?IMPORT_FIELDS:CASE_FIELDS);
  if(!data.numeroProntuario?.trim()||data.numeroProntuario.length>100)fail('invalid-argument','Informe um prontuário válido.');
  if(!dateValid(data.dataEntrada))fail('invalid-argument','Informe uma data de entrada existente no calendário.');
  if(data.dataOficioEnc&&!dateValid(data.dataOficioEnc))fail('invalid-argument','Informe uma data de ofício válida.');
  if(data.situacaoAtual&&!STATUSES.has(data.situacaoAtual))fail('invalid-argument','Situação inválida.');
  return data;
}
function activity(value, field, previous, uid, now) {
  if(typeof value!=='string'||value.length>20000)fail('invalid-argument','Atividade inválida.');
  let input;try{input=JSON.parse(value);}catch{fail('invalid-argument','Atividade inválida.');}
  const kind=field.startsWith('agenda_')?'agenda':'tarefas';
  const allowed=new Set(['schema','kind','revisao','criadoEm','criadoPor','atualizadoEm','atualizadoPor','responsavel','observacao','situacao','tipo','dataConclusao',...(kind==='agenda'?['data','hora']:['descricao','prazo','prioridade'])]);
  if(!object(input)||Object.keys(input).some(k=>!allowed.has(k))||input.schema!==1||input.kind!==kind)fail('invalid-argument','Estrutura de atividade inválida.');
  const str=(key,max,required=false)=>{const v=input[key];if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('invalid-argument','Campo de atividade inválido.');return v;};
  const data={schema:1,kind,responsavel:str('responsavel',120,true),observacao:str('observacao',4000),situacao:str('situacao',40,true),tipo:str('tipo',100,true),dataConclusao:str('dataConclusao',10)};
  const statuses=kind==='agenda'?['agendado','realizado','nao_compareceu','cancelado']:['aberta','em_andamento','concluida','cancelada'];
  const types=kind==='agenda'?['Atenção inicial','Atendimento psicossocial','Orientação jurídico-social','Retorno','Outro']:['Documento','Retorno de encaminhamento','Contato com responsável','Outra'];
  if(!statuses.includes(data.situacao)||!types.includes(data.tipo))fail('invalid-argument','Situação ou tipo de atividade inválido.');
  if(kind==='agenda') {
    data.data=str('data',10,true);data.hora=str('hora',5);
    if(!dateValid(data.data)||(data.hora&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.hora)))fail('invalid-argument','Data ou horário inválido.');
  } else {
    data.descricao=str('descricao',240,true);data.prazo=str('prazo',10);data.prioridade=str('prioridade',10,true);
    if((data.prazo&&!dateValid(data.prazo))||!['normal','alta'].includes(data.prioridade))fail('invalid-argument','Prazo ou prioridade inválido.');
  }
  const done=data.situacao===(kind==='agenda'?'realizado':'concluida');
  if((data.dataConclusao&&!dateValid(data.dataConclusao))||(done&&!data.dataConclusao))fail('invalid-argument','Data de conclusão inválida.');
  let old=null;try{old=previous?JSON.parse(previous):null;}catch{fail('failed-precondition','Atividade anterior inválida; solicite revisão administrativa.');}
  // Ignore incoming audit attributes; preserve only existing creation metadata.
  return JSON.stringify({...data,revisao:(Number.isSafeInteger(old?.revisao)?old.revisao:0)+1,criadoEm:old?.criadoEm||now,criadoPor:old?.criadoPor||uid,atualizadoEm:now,atualizadoPor:uid});
}
function createService(database,{clock=()=>Date.now(),manualLimit=30}={}) {
  async function knownTransaction(reference, transform) {
    // Keep a listener alive until commit: a one-shot read alone can release
    // the SDK cache before a cold-instance transaction inspects legacy data.
    const listener=()=>{};
    reference.on('value',listener);
    try {
      await reference.once('value');
      return await reference.transaction(transform,undefined,false);
    } finally { reference.off('value',listener); }
  }
  async function authorize(request,roles=WRITERS) {
    if(!request.auth?.uid)fail('unauthenticated','Entre no sistema.');
    const uid=request.auth.uid,access=(await database.ref(`access/${uid}`).get()).val();
    if(access?.active!==true||!roles.has(access.role))fail('permission-denied','Seu perfil não permite esta operação.');
    return {uid,role:access.role};
  }
  async function reserveManual(uid) {
    const window=Math.floor(clock()/3600000);
    const result=await database.ref(`writeLimits/${uid}`).transaction(current=>{
      const count=current?.window===window?current.count:0;
      if(!Number.isSafeInteger(count)||count>=manualLimit)return;
      return {window,count:count+1};
    },undefined,false);
    if(!result.committed)fail('resource-exhausted','Limite de cadastros manuais por hora atingido. Solicite a importação ao administrador.');
  }
  async function saveCase(request) {
    const {uid,role}=await authorize(request);
    const body=request.data;
    if(!object(body)||!['create','update','import'].includes(body.operation)||Object.keys(body).some(k=>!['operation','data','caseKey','expected'].includes(k)))fail('invalid-argument','Operação inválida.');
    const imported=body.operation==='import';
    if(imported&&role!=='administrador')fail('permission-denied','Somente administrador pode importar.');
    const data=validateCase(body.data,imported),isUpdate=body.operation==='update';
    if(isUpdate&&(!object(body.expected)||typeof body.caseKey!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(body.caseKey)))fail('invalid-argument','Versão ou chave do caso inválida.');
    if(!isUpdate&&(body.caseKey!==undefined||body.expected!==undefined))fail('invalid-argument','A chave de criação é definida pelo servidor.');
    if(isUpdate)fields(body.expected,CASE_FIELDS);
    if(!isUpdate&&!imported&&role!=='administrador')await reserveManual(uid);
    const target=isUpdate?body.caseKey:caseKey(data.numeroProntuario),now=new Date(clock()).toISOString();
    let duplicate=false;
    // Serialize canonical/legacy uniqueness checks and preserve concurrent edits.
    const casesRef=database.ref('casos');
    // RTDB transaction callbacks can start with an empty local cache. Prime it
    // before deciding an existing edit is missing; otherwise the SDK can abort
    // before fetching the server value on a cold Functions instance.
    const result=await knownTransaction(casesRef,current=>{
      const cases=current||{},old=cases[target];
      if(isUpdate) {
        if(!old||old.numeroProntuario!==data.numeroProntuario)return;
        if(Object.keys(data).some(k=>(old[k]??'')!==(body.expected[k]??'')))return;
      } else if(Object.values(cases).some(c=>identity(c?.numeroProntuario)===identity(data.numeroProntuario))) {duplicate=true;return;}
      return {...cases,[target]:{...(isUpdate?old:{}),...data,...(isUpdate?{}:{origemCadastro:imported?'planilha':'manual',criadoEm:now,criadoPor:uid}),atualizadoEm:now,atualizadoPor:uid}};
    });
    return {committed:result.committed,caseKey:target,duplicate:!result.committed&&duplicate};
  }
  async function saveActivity(request) {
    const {uid}=await authorize(request),body=request.data;
    if(!object(body)||Object.keys(body).some(k=>!['caseKey','field','value','expected'].includes(k))||typeof body.caseKey!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(body.caseKey)||typeof body.field!=='string'||!/^(agenda|pendencia)_[A-Za-z0-9_-]{1,100}$/.test(body.field)||(body.expected!==null&&typeof body.expected!=='string'))fail('invalid-argument','Atividade inválida.');
    if(body.expected?.length>20000)fail('invalid-argument','Versão de atividade inválida.');
    const now=new Date(clock()).toISOString();
    activity(body.value,body.field,body.expected,uid,now);
    const recordRef=database.ref(`casos/${body.caseKey}`);
    const result=await knownTransaction(recordRef,current=>{
      if(!current||(current[body.field]??null)!==body.expected)return;
      return {...current,[body.field]:activity(body.value,body.field,current[body.field],uid,now),atualizadoEm:now,atualizadoPor:uid};
    });
    return {committed:result.committed};
  }
  async function sharedSummary(request) {
    await authorize(request,new Set([...WRITERS,'consulta']));
    if(request.data!=null&&(!object(request.data)||Object.keys(request.data).length))fail('invalid-argument','Esta consulta não aceita filtros ou identificadores.');
    const snapshot=await database.ref('casos').get();
    const total=Object.values(snapshot.val()||{}).filter(c=>typeof c?.numeroProntuario==='string').length,lower=Math.floor(total/10)*10;
    // No IDs, free text, exact small counts, dates, categories or personal attributes.
    return {schema:1,casesRange:total<10?'Menos de 10':`${lower} a ${lower+9}`};
  }
  return {saveCase,saveActivity,sharedSummary};
}
module.exports={createService,PolicyError,validateCase,dateValid,identity,caseKey};
