// Security policy source. Generated JSON is reviewed and exercised by the RTDB Emulator.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../database.rules.example.json',import.meta.url));
const role="root.child('access').child(auth.uid).child('role').val()";
const active="auth != null && root.child('access').child(auth.uid).child('active').val() === true";
const admin=`(${active} && ${role} === 'administrador')`;
const writer=`(${active} && (${role} === 'administrador' || ${role} === 'coordenador' || ${role} === 'tecnico'))`;
const member=`(${active} && (${role} === 'administrador' || ${role} === 'coordenador' || ${role} === 'tecnico' || ${role} === 'consulta'))`;
const child=(snapshot,key)=>`${snapshot}.child('${key}')`;
const val=(snapshot,key)=>`${child(snapshot,key)}.val()`;
const same=key=>`${val('newData',key)} === ${val('data',key)}`;
const immutable=key=>`(!${child('data',key)}.exists() || ${same(key)})`;
const required=(snapshot,keys)=>`${snapshot}.hasChildren(${JSON.stringify(keys)})`;
const iso=/^(?:[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-8]))|(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)$/;
const validDate=s=>`(${s}.isString() && !${s}.val().beginsWith('0000-') && ${s}.val().matches(${iso.toString().replaceAll('(?:','(')}))`;
const string=(max=20000)=>({'.validate':`newData.isString() && newData.val().length <= ${max}`});
const auditKeys=['schema','criacaoVerificada','criadoPor','criadoEmMs','atualizadoPor','atualizadoEmMs','revisao'];
function auditFresh(n,d,existed) {
  return `${required(n,auditKeys)} && ${val(n,'schema')} === 2 && ${val(n,'atualizadoPor')} === auth.uid && ${val(n,'atualizadoEmMs')} === now && `+
    `${val(n,'revisao')} === (${d}.exists() ? ${val(d,'revisao')} + 1 : 1) && `+
    `(${d}.exists() ? (${['criacaoVerificada','criadoPor','criadoEmMs'].map(k=>`${val(n,k)} === ${val(d,k)}`).join(' && ')}) : `+
    `(${val(n,'criacaoVerificada')} === !(${existed}) && ${val(n,'criadoPor')} === ((${existed}) ? 'desconhecido' : auth.uid) && ${val(n,'criadoEmMs')} === ((${existed}) ? 0 : now)))`;
}
const auditShape=()=>Object.fromEntries(auditKeys.map(k=>[k,{'.validate':k==='criacaoVerificada'?'newData.isBoolean()': ['schema','revisao','criadoEmMs','atualizadoEmMs'].includes(k)?'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0':'newData.isString() && newData.val().length <= 128'}]).concat([['$other',{'.validate':false}]]));
const business=['docOrigem','origemCaso','cor','detalheOrigem','detalheSituacao','nomeCriad','responsavelNome','responsavelCpf','comunicacaoViolencia','oficioViolencia','encaminhamentosSolicitados','detalheEncaminhamento','retornoSolicitado','infoRetorno','estudoCaso','piaElaborado','outrasPendencias','datasTexto','tecnicosReferencia','tipoViolencia','violenciaSexual','outrasViolencias'];
const snapshots=['dadosPlanilha','historicoPlanilha','origemImportacao'];
const legacyAudit=['criadoPor','criadoEm','atualizadoPor','atualizadoEm'];
const postRoot='newData.parent().parent()';
const quota="newData.child('quota')";
const slot=`${quota}.child('slot').val()`;
const window=`${quota}.child('inicioMs').val()`;
const oldTicket=`root.child('cotasManuais').child(auth.uid).child(${window} + '').child(${slot})`;
const newTicket=`${postRoot}.child('cotasManuais').child(auth.uid).child(${window} + '').child(${slot})`;
const identity="newData.child('identidade').val()";
const registryNew=`${postRoot}.child('identidades').child(${identity})`;
const registryOld=`root.child('identidades').child(${identity})`;
const creation=`root.child('securityPolicy/identityRegistryReady').val() === true && newData.hasChildren(['identidade','prefixoNumerico']) && !${registryOld}.exists() && ${registryNew}.val() === $caseId && `+
  `(${admin} ? !${quota}.exists() : (newData.child('origemCadastro').val() === 'manual' && ${quota}.hasChildren(['inicioMs','slot']) && ${window} <= now && now < ${window} + 3600000 && !${oldTicket}.exists() && ${newTicket}.child('caseId').val() === $caseId && ${newTicket}.child('criadoEmMs').val() === now))`;
const record={
  '.write':`${writer} && newData.exists() && (!data.exists() || data.child('auditoria/schema').val() === 2 || (root.child('securityPolicy/editableCases').child($caseId).val() === true && root.child('legadoProtegido').child($caseId).exists()))`,
  '.validate':`${required('newData',['numeroProntuario','dataEntrada','origemCadastro','auditoria'])} && (${auditFresh("newData.child('auditoria')","data.child('auditoria')",'data.exists()')}) && `+
    snapshots.concat(legacyAudit).map(immutable).join(' && ')+` && `+
    `(${child('data','identidade')}.exists() ? (${same('identidade')} && ${same('prefixoNumerico')}) : (data.exists() ? !newData.child('identidade').exists() : true)) && `+
    `(data.exists() ? (data.child('quota').exists() ? (${val('newData','quota/inicioMs')} === ${val('data','quota/inicioMs')} && ${val('newData','quota/slot')} === ${val('data','quota/slot')}) : !newData.child('quota').exists()) : (${creation}))`,
  numeroProntuario:{'.validate':"newData.isString() && newData.val().length > 0 && newData.val().length <= 100 && (data.exists() ? newData.val() === data.val() : newData.val().matches(/^[A-Za-z0-9_-]+$/))"},
  dataEntrada:{'.validate':`(${validDate('newData')}) || (data.exists() && newData.val() === data.val())`},
  dataOficioEnc:{'.validate':`newData.val() === '' || (${validDate('newData')}) || (data.exists() && newData.val() === data.val())`},
  situacaoAtual:{'.validate':"newData.isString() && (newData.val() === '' || newData.val() === 'ativo' || newData.val() === 'suspenso' || newData.val() === 'encerrado_com_protecao' || newData.val() === 'encerrado_sem_protecao' || newData.val() === 'nao_competencia' || (data.exists() && newData.val() === data.val()))"},
  origemCadastro:{'.validate':"newData.isString() && (data.exists() ? newData.val() === data.val() : (data.parent().exists() ? newData.val() === 'legado' : (newData.val() === 'manual' || ("+admin+" && newData.val() === 'planilha'))))"},
  identidade:{'.validate':"newData.isString() && newData.val().matches(/^[A-Z0-9_-]{1,100}$/) && (data.exists() ? newData.val() === data.val() : (newData.parent().child('numeroProntuario').val().matches(/^[0-9]+$/) ? (newData.val().matches(/^(0|[1-9][0-9]*)$/) && newData.parent().child('numeroProntuario').val() === newData.parent().child('prefixoNumerico').val() + newData.val()) : (newData.val() === newData.parent().child('numeroProntuario').val().toUpperCase() && newData.parent().child('prefixoNumerico').val() === '')))"},
  prefixoNumerico:{'.validate':"newData.isString() && newData.val().matches(/^0*$/) && newData.val().length <= 99"},
  auditoria:{...auditShape()},
  quota:{'.validate':"newData.hasChildren(['inicioMs','slot'])",inicioMs:{'.validate':'newData.isNumber() && newData.val() >= 0 && newData.val() % 3600000 === 0'},slot:{'.validate':"newData.isString() && newData.val().matches(/^([0-9]|[12][0-9])$/)"},$other:{'.validate':false}},
  ...Object.fromEntries(business.map(k=>[k,string()])),
  ...Object.fromEntries(snapshots.map(k=>[k,{'.validate':`newData.isString() && newData.val().length <= 20000 && (data.exists() ? newData.val() === data.val() : (!data.parent().exists() && ${admin} && newData.parent().child('origemCadastro').val() === 'planilha'))`}])),
  ...Object.fromEntries(legacyAudit.map(k=>[k,{'.validate':'data.exists() && newData.val() === data.val()'}])),
  '$other':{'.validate':'data.exists() && newData.isString() && newData.val() === data.val()'}
};
const activityKeys=['schema','kind','responsavel','observacao','situacao','tipo','dataConclusao','data','hora','descricao','prazo','prioridade','auditoria'];
const kind="newData.child('kind').val()";
const isAgenda=`${kind} === 'agenda'`;
const event={
  '.write':`${writer} && root.child('casos').child($caseId).exists() && newData.exists()`,
  '.validate':`${required('newData',['schema','kind','responsavel','observacao','situacao','tipo','dataConclusao','auditoria'])} && newData.child('schema').val() === 1 && `+
    `(($field.matches(/^agenda_[A-Za-z0-9_-]{1,100}$/) && ${isAgenda}) || ($field.matches(/^pendencia_[A-Za-z0-9_-]{1,100}$/) && ${kind} === 'tarefas')) && `+
    `(${auditFresh("newData.child('auditoria')","data.child('auditoria')",'false')}) && `+
    `(${isAgenda} ? newData.hasChildren(['data','hora']) && !newData.hasChild('descricao') && !newData.hasChild('prazo') && !newData.hasChild('prioridade') : newData.hasChildren(['descricao','prazo','prioridade']) && !newData.hasChild('data') && !newData.hasChild('hora')) && `+
    `((newData.child('situacao').val() === (${isAgenda} ? 'realizado' : 'concluida')) ? newData.child('dataConclusao').val() !== '' : newData.child('dataConclusao').val() === '')`,
  schema:{'.validate':'newData.val() === 1'},kind:{'.validate':"newData.val() === 'agenda' || newData.val() === 'tarefas'"},
  responsavel:{'.validate':'newData.isString() && newData.val().length > 0 && newData.val().length <= 120'},observacao:string(4000),
  situacao:{'.validate':"newData.isString() && (newData.parent().child('kind').val() === 'agenda' ? (newData.val() === 'agendado' || newData.val() === 'realizado' || newData.val() === 'nao_compareceu' || newData.val() === 'cancelado') : (newData.val() === 'aberta' || newData.val() === 'em_andamento' || newData.val() === 'concluida' || newData.val() === 'cancelada'))"},
  tipo:{'.validate':"newData.isString() && (newData.parent().child('kind').val() === 'agenda' ? (newData.val() === 'Atenção inicial' || newData.val() === 'Atendimento psicossocial' || newData.val() === 'Orientação jurídico-social' || newData.val() === 'Retorno' || newData.val() === 'Outro') : (newData.val() === 'Documento' || newData.val() === 'Retorno de encaminhamento' || newData.val() === 'Contato com responsável' || newData.val() === 'Outra'))"},
  data:{'.validate':validDate('newData')},hora:{'.validate':"newData.isString() && (newData.val() === '' || newData.val().matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/))"},
  dataConclusao:{'.validate':`newData.val() === '' || (${validDate('newData')})`},descricao:{'.validate':'newData.isString() && newData.val().length > 0 && newData.val().length <= 240'},
  prazo:{'.validate':`newData.val() === '' || (${validDate('newData')})`},prioridade:{'.validate':"newData.val() === 'normal' || newData.val() === 'alta'"},auditoria:{...auditShape()},$other:{'.validate':false}
};
const ticketRoot='newData.parent().parent().parent().parent()';
const ticketCase=`${ticketRoot}.child('casos').child(newData.child('caseId').val())`;
const rules={'.read':false,'.write':false,
  access:{$uid:{'.read':'auth != null && auth.uid === $uid','.write':false}},
  securityPolicy:{identityRegistryReady:{'.read':writer,'.write':false}},
  legadoProtegido:{'.read':writer,'.write':false},
  casos:{'.read':writer,'$caseId':record},
  identidades:{'.read':writer,'$identity':{'.write':`${writer} && !data.exists() && newData.isString() && !root.child('casos').child(newData.val()).exists()`,'.validate':`${postRoot}.child('casos').child(newData.val()).child('identidade').val() === $identity && ${postRoot}.child('casos').child(newData.val()).child('auditoria/criadoPor').val() === auth.uid && ${postRoot}.child('casos').child(newData.val()).child('auditoria/criadoEmMs').val() === now`}},
  cotasManuais:{$uid:{'.read':`${writer} && auth.uid === $uid`,'$window':{'$slot':{'.write':`${writer} && auth.uid === $uid && ${role} !== 'administrador' && !data.exists() && newData.exists()`,'.validate':`newData.hasChildren(['caseId','criadoEmMs','inicioMs']) && $slot.matches(/^([0-9]|[12][0-9])$/) && $window === newData.child('inicioMs').val() + '' && newData.child('inicioMs').val() <= now && now < newData.child('inicioMs').val() + 3600000 && !root.child('casos').child(newData.child('caseId').val()).exists() && ${ticketCase}.child('quota/slot').val() === $slot && ${ticketCase}.child('quota/inicioMs').val() === newData.child('inicioMs').val() && ${ticketCase}.child('auditoria/criadoPor').val() === auth.uid && ${ticketCase}.child('auditoria/criadoEmMs').val() === now`,caseId:{'.validate':"newData.isString() && newData.val().matches(/^case_[0-9a-f]{64}$/)"},criadoEmMs:{'.validate':'newData.val() === now'},inicioMs:{'.validate':'newData.isNumber() && newData.val() >= 0 && newData.val() % 3600000 === 0'},$other:{'.validate':false}}}}},
  atividades:{'.read':writer,'$caseId':{'$field':event}},
  compartilhavel:{resumo:{'.read':member,'.write':`${admin} && newData.exists()`,'.validate':"newData.hasChildren(['schema','faixa','publicadoEmMs','revisao']) && newData.child('schema').val() === 1 && newData.child('publicadoEmMs').val() === now && newData.child('revisao').val() === (data.exists() ? data.child('revisao').val() + 1 : 1)",schema:{'.validate':'newData.val() === 1'},faixa:{'.validate':'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 100000'},publicadoEmMs:{'.validate':'newData.isNumber() && newData.val() === now'},revisao:{'.validate':'newData.isNumber() && newData.val() % 1 === 0 && newData.val() > 0'},$other:{'.validate':false}}}
};
const output=JSON.stringify({rules},null,2)+'\n';
if(process.argv.includes('--check')) {
  if(fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==output)throw Error('Run node scripts/build-rules.mjs to regenerate the security policy.');
} else fs.writeFileSync(target,output);
