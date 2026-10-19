const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const excluded=new Set(['node_modules','.git','vendor','fixtures']);
let checked=0;
function visit(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    if(excluded.has(entry.name))continue;
    const file=path.join(folder,entry.name);
    if(entry.isDirectory())visit(file);
    else if(/\.(?:js|cjs|mjs)$/.test(entry.name)){
      const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
      if(result.status!==0){process.stderr.write(result.stderr||'Syntax check failed');process.exit(1);}
      checked++;
    }
  }
}
visit(root);console.log(`Syntax checked: ${checked} JavaScript files.`);
