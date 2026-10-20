// Client-side preparation only. RTDB Security Rules are the authority.
import {caseIdentity} from './case-save.js?v=20261015.3';
import {dateValue} from './import-core.js?v=20261015.3';
export const CASE_FIELDS=['numeroProntuario','dataEntrada','docOrigem','origemCaso','cor','detalheOrigem','situacaoAtual','detalheSituacao','nomeCriad','responsavelNome','responsavelCpf','comunicacaoViolencia','oficioViolencia','encaminhamentosSolicitados','detalheEncaminhamento','dataOficioEnc','retornoSolicitado','infoRetorno','estudoCaso','piaElaborado','outrasPendencias','datasTexto','tecnicosReferencia','tipoViolencia','violenciaSexual','outrasViolencias'];
export const IMPORT_FIELDS=['dadosPlanilha','historicoPlanilha','origemImportacao'];
export const ACTIVITY_FIELDS=['schema','kind','responsavel','observacao','situacao','tipo','dataConclusao','data','hora','descricao','prazo','prioridade'];
export class SparkError extends Error {constructor(message){super(message);this.code='spark/validation';}}
export function identityFields(number) {
  if(typeof number!=='string'||!number.match(/^[A-Za-z0-9_-]{1,100}$/))throw new SparkError('Novos prontuários devem usar letras sem acento, números, hífen ou sublinhado.');
  const identidade=caseIdentity(number);
  return {identidade,prefixoNumerico:/^[0-9]+$/.test(number)?number.slice(0,number.length-identidade.length):''};
}
export function validateInput(data, imported=false) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw new SparkError('Dados inválidos.');
  const allowed=new Set([...CASE_FIELDS,...(imported?IMPORT_FIELDS:[])]);
  for(const [key,value] of Object.entries(data))if(!allowed.has(key)||typeof value!=='string'||value.length>20000)throw new SparkError('Campo não permitido, tipo ou tamanho inválido.');
  if(!data.numeroProntuario?.trim()||data.numeroProntuario.length>100)throw new SparkError('Informe um prontuário válido.');
  if(dateValue(data.dataEntrada)!==data.dataEntrada)throw new SparkError('Informe uma data de entrada existente no calendário.');
  if(data.dataOficioEnc&&dateValue(data.dataOficioEnc)!==data.dataOficioEnc)throw new SparkError('Informe uma data de ofício válida.');
}
export function auditFor(previous,uid,stamp,existed=false) {
  return {schema:2,criacaoVerificada:previous?.criacaoVerificada??!existed,
    criadoPor:previous?.criadoPor??(existed?'desconhecido':uid),criadoEmMs:previous?.criadoEmMs??(existed?0:stamp),
    atualizadoPor:uid,atualizadoEmMs:stamp,revisao:(previous?.revisao??0)+1};
}
export function activityForDisplay(value) {
  if(!value?.auditoria)return value;
  const a=value.auditoria;
  return {...value,revisao:a.revisao,criadoPor:a.criadoPor,criadoEm:a.criadoEmMs?new Date(a.criadoEmMs).toISOString():'',atualizadoPor:a.atualizadoPor,atualizadoEm:new Date(a.atualizadoEmMs).toISOString()};
}
export function casesWithActivities(records,activities) {
  return records.map(record=>{
    const data={...record.data};
    for(const [field,value] of Object.entries(activities[record.key]||{}))data[field]=JSON.stringify(activityForDisplay(value));
    return {...record,data};
  });
}
