'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');let passed=0;
function run(args){const result=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:120000});if(result.status!==0){process.stderr.write(result.stdout||'');process.stderr.write(result.stderr||'');throw new Error('Failed: node '+args.join(' '));}passed++;}
try{
 for(const file of fs.readdirSync(path.join(root,'lib')).filter(file=>/^war-payout-.*\.(?:cjs|js)$/.test(file)))run(['--check','lib/'+file]);
 run(['--check','Torn_War_Payout_Calculator.user.js']);
 for(const file of ['domain','api','cache','credits','raffle'])run(['test/war-payout-'+file+'.test.cjs']);
 if(process.argv.includes('--browser')){
  for(const file of ['calculator','member-credits','native-credit','readiness','cache','shared-ui','cancel','raffle'])run(['test/browser/war-payout-'+file+'.cjs']);
  run(['test/browser/war-payout-readiness.cjs','--lock-errors']);
 }
 console.log('PASS '+passed+' payout syntax, contract'+(process.argv.includes('--browser')?' and real Brave browser':'')+' checks');
}catch(error){console.error(error.message);process.exitCode=1;}
