const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const configHome=fs.mkdtempSync(path.join(os.tmpdir(),'proteja-demo-cli-'));
const env={...process.env,XDG_CONFIG_HOME:configHome,GCLOUD_PROJECT:'demo-proteja-security',CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'};
delete env.GOOGLE_APPLICATION_CREDENTIALS;delete env.FIREBASE_TOKEN;delete env.DEBUG;
const result=spawnSync(process.execPath,[require.resolve('firebase-tools/lib/bin/firebase.js'),'emulators:exec','--project','demo-proteja-security','--config','firebase.emulator.json','--only','auth,database,functions','node tests/emulator/security.mjs'],{cwd:root,env,stdio:'inherit'});
// Only remove the exact temporary directory created above.
if(path.dirname(configHome)===os.tmpdir()&&path.basename(configHome).startsWith('proteja-demo-cli-'))fs.rmSync(configHome,{recursive:true,force:true});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
