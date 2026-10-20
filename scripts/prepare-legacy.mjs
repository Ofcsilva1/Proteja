// Offline preparation only: no SDK, credentials, network calls or database writes.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {caseIdentity} from '../case-save.js';
export function prepareLegacy(root) {
  if(!root||typeof root!=='object'||!root.casos||typeof root.casos!=='object'||Array.isArray(root.casos))throw new Error('Forneça uma cópia revisada do nó casos.');
  const identities=new Map(),patch={},issues=[];
  for(const [key,record] of Object.entries(root.casos)) {
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(key)||!record||typeof record!=='object'||Array.isArray(record)||typeof record.numeroProntuario!=='string'||!record.numeroProntuario.trim()) {issues.push({key,reason:'Registro sem identidade ou chave suportada; revisão manual obrigatória.'});continue;}
    const id=caseIdentity(record.numeroProntuario);
    if(!/^[A-Z0-9_-]{1,100}$/.test(id)){issues.push({key,reason:'Identidade não representável no índice seguro; revisão manual obrigatória.'});continue;}
    if(identities.has(id))throw new Error('Há prontuários equivalentes em chaves diferentes. Não libere novos cadastros.');
    identities.set(id,key);
    const existing=root.identidades?.[id];
    if(existing&&existing!==key)throw new Error('O índice existente conflita com um caso. Não publique este preparo.');
    if(!existing)patch[`identidades/${id}`]=key;
    if(!root.legadoProtegido?.[key])patch[`legadoProtegido/${key}`]=structuredClone(record);
    // A reviewer must still approve this artifact; it cannot be submitted by a client.
    patch[`securityPolicy/editableCases/${key}`]=true;
  }
  for(const [id,key] of Object.entries(root.identidades||{}))if(identities.get(id)!==key)throw new Error('O índice contém uma entrada sem correspondência. Revisão manual obrigatória.');
  patch['securityPolicy/identityRegistryReady']=issues.length===0;
  return {reviewRequired:true,recordCount:identities.size,issues,patch};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input,output]=process.argv.slice(2);
  if(!input||!output||path.resolve(input)===path.resolve(output))throw new Error('Uso: node scripts/prepare-legacy.mjs copia-local.json preparo-novo.json');
  const result=prepareLegacy(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')));
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(`Preparo offline criado: ${result.recordCount} registros; ${result.issues.length} itens exigem revisão. Nenhuma publicação executada.`);
}
