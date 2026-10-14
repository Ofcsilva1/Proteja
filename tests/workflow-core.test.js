import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateActivity,buildActivity,parseActivity,collectActivities,filterActivities,replacementFor,isLate,todayISO,activityText,attendanceSummary} from '../workflow-core.js';
const agenda=(extra={})=>({data:'2026-10-14',hora:'09:00',responsavel:'Equipe fictícia',tipo:'Retorno',situacao:'agendado',dataConclusao:'',observacao:'Nota fictícia',...extra});
const task=(extra={})=>({descricao:'Conferir documento fictício',prazo:'2026-10-14',responsavel:'Equipe fictícia',tipo:'Documento',situacao:'aberta',prioridade:'normal',dataConclusao:'',observacao:'',...extra});
const record=(kind,data,field='entry')=>({key:'fake-case',data:{numeroProntuario:'0005',[`${kind==='agenda'?'agenda':'pendencia'}_${field}`]:buildActivity(kind,data,null,'fake-user','2026-10-14T12:00:00Z')}});
test('validates separate dates and times without guessing or date rollover',()=>{
  assert.deepEqual(validateActivity('agenda',agenda()),[]);
  for(const data of ['14/10/2026','2026-02-30','01/02/26',''])assert.ok(validateActivity('agenda',agenda({data})).length);
  for(const hora of ['24:00','10:70','9h'])assert.ok(validateActivity('agenda',agenda({hora})).length);
  assert.deepEqual(validateActivity('agenda',agenda({hora:''})),[]);
});
test('completion requires an explicit real date and reopening clears it',()=>{
  assert.ok(validateActivity('agenda',agenda({situacao:'realizado'})).length);
  assert.ok(validateActivity('tarefas',task({situacao:'concluida'})).length);
  const value=buildActivity('agenda',agenda({situacao:'realizado',dataConclusao:'2026-10-15'}),null,'u');
  const old=parseActivity('agenda',value);assert.equal(old.data,'2026-10-14');assert.equal(old.dataConclusao,'2026-10-15');
  assert.equal(JSON.parse(buildActivity('agenda',agenda({dataConclusao:'2026-10-15'}),old,'u')).dataConclusao,'');
});
test('tasks allow no deadline and never label completed or canceled items late',()=>{
  assert.deepEqual(validateActivity('tarefas',task({prazo:''})),[]);
  assert.equal(isLate('tarefas',task({prazo:'2026-10-13'}),'2026-10-14'),true);
  assert.equal(isLate('tarefas',task({prazo:'2026-10-14'}),'2026-10-14'),false);
  assert.equal(isLate('tarefas',task({prazo:'2026-10-13',situacao:'cancelada'}),'2026-10-14'),false);
  assert.equal(isLate('agenda',agenda({data:'2026-10-13'}),'2026-10-14'),true);
  assert.equal(isLate('agenda',agenda({data:'2026-10-13',situacao:'nao_compareceu'}),'2026-10-14'),false);
});
test('metadata, revisions and unknown fields are preserved during updates',()=>{
  const old={...JSON.parse(buildActivity('agenda',agenda(),null,'u1','2026-10-14T12:00:00Z')),extra:'Preservar'};
  const next=JSON.parse(buildActivity('agenda',agenda({responsavel:'Outra equipe fictícia'}),old,'u2','2026-10-15T12:00:00Z'));
  assert.equal(next.revisao,2);assert.equal(next.criadoPor,'u1');assert.equal(next.atualizadoPor,'u2');assert.equal(next.extra,'Preservar');
  assert.equal(next.criadoEm,old.criadoEm);
});
test('activities are independent fields and legacy text never becomes an event',()=>{
  const r=record('agenda',agenda());r.data.datasTexto='01/02, relato livre';r.data.outrasPendencias='Texto anterior';r.data.agenda_bad='invalid';
  const original=JSON.stringify(r);const result=collectActivities([r],'agenda');assert.equal(result.items.length,1);assert.equal(result.invalid,1);
  assert.equal(collectActivities([r],'tarefas').items.length,0);assert.equal(JSON.stringify(r),original);
  assert.equal(parseActivity('tarefas',r.data.agenda_entry),null);
});
test('exact case filters, responsible, date range, late and seven-day windows combine',()=>{
  const items=collectActivities([record('agenda',agenda(),'a'),record('agenda',agenda({data:'2026-10-20'}),'b'),record('agenda',agenda({data:'2026-10-21'}),'c')],'agenda').items;
  assert.equal(filterActivities(items,'agenda',{numero:'05',periodo:'semana'},'2026-10-14').length,2);
  assert.equal(filterActivities(items,'agenda',{numero:'5',responsavel:'fictícia',de:'2026-10-20',ate:'2026-10-20'},'2026-10-14').length,1);
  assert.equal(filterActivities(items,'agenda',{numero:'15'},'2026-10-14').length,0);
  assert.equal(filterActivities(collectActivities([record('tarefas',task({prazo:''}))],'tarefas').items,'tarefas',{periodo:'sem_prazo'}).length,1);
});
test('compare-and-set permits a new item or current edit and rejects stale edits',()=>{
  assert.equal(replacementFor(null,null,'new'),'new');assert.equal(replacementFor('old','old','next'),'next');
  assert.equal(replacementFor('newer','old','next'),undefined);assert.equal(replacementFor('existing',null,'next'),undefined);
});
test('rejects malformed, unsupported or oversized records and keeps export text readable',()=>{
  assert.equal(parseActivity('agenda','null'),null);assert.equal(parseActivity('agenda','{}'),null);assert.equal(parseActivity('agenda','invalid'),null);
  assert.throws(()=>buildActivity('agenda',agenda({observacao:'x'.repeat(4001)}),null,'u'),/4.000/);
  const text=activityText(record('agenda',agenda()),'agenda');assert.match(text,/2026-10-14 09:00/);assert.match(text,/Equipe fictícia/);assert.match(text,/Agendado/);
});
test('today follows the organizational calendar across UTC midnight',()=>{
  assert.equal(todayISO(new Date('2026-10-15T01:00:00Z')),'2026-10-14');
});
test('case list summarizes attendance without replacing or inferring the old narrative',()=>{
  const r=record('agenda',agenda({data:'2026-10-15'}));r.data.datasTexto='Relato anterior: data incompleta 01/02';
  const text=attendanceSummary(r,'2026-10-14');assert.match(text,/Próximo: 15\/10\/2026 às 09:00/);assert.match(text,/Histórico anterior disponível/);
  assert.equal(r.data.datasTexto,'Relato anterior: data incompleta 01/02');
  assert.equal(attendanceSummary({key:'fake',data:{datasTexto:'01/02'}},'2026-10-14'),'Histórico anterior disponível');
});
