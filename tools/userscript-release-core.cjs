'use strict';
const crypto=require('node:crypto');
const base='https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/';
const scripts=[
 {id:'script-hub',state:'script-hub/release.json',file:'script-hub/dist/Torn_Script_Hub.user.js',builder:'script-hub/tools/build-script-hub.cjs',args:['--hub-only']},
 {id:'war-payout',state:'lib/war-payout-release.json',file:'Torn_War_Payout_Calculator.user.js',builder:'tools/build-war-payout-calculator.cjs',args:[]},
].map(script=>({...script,meta:script.file.replace(/\.user\.js$/,'.meta.js'),downloadURL:base+script.file,updateURL:base+script.file.replace(/\.user\.js$/,'.meta.js')}));
function versionParts(version){
 if(typeof version!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))throw new Error('Expected a numeric major.minor.patch version');
 const parts=version.split('.').map(Number);if(parts.some(part=>!Number.isSafeInteger(part)||part>1000000))throw new Error('Release version exceeds supported bounds');return parts;
}
function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;}
function readState(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid release state');
 versionParts(value.version);
 if(value.releasedVersion!==null){versionParts(value.releasedVersion);if(compareVersions(value.version,value.releasedVersion)<0)throw new Error('Release version cannot move backwards');}
 if(value.payloadSha256!==null&&(typeof value.payloadSha256!=='string'||! /^[0-9a-f]{64}$/.test(value.payloadSha256)))throw new Error('Invalid release payload hash');
 if((value.releasedVersion===null)!==(value.payloadSha256===null))throw new Error('Release version and hash must be recorded together');
 return {version:value.version,releasedVersion:value.releasedVersion,payloadSha256:value.payloadSha256};
}
function metadataFile(source){
 if(typeof source!=='string'||!source.startsWith('// ==UserScript=='))throw new Error('Missing userscript metadata');
 const end=source.indexOf('// ==/UserScript==');if(end<0)throw new Error('Unterminated userscript metadata');
 const metadata=source.slice(0,end+'// ==/UserScript=='.length).replace(/\r\n/g,'\n');
 if([...metadata.matchAll(/^\/\/\s*@version\s+(\S+)/gm)].length!==1)throw new Error('Metadata must have one version');
 return metadata+'\n';
}
function payloadHash(source){
 const metadata=metadataFile(source),end=source.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length;
 const header=metadata.replace(/^(\/\/\s*@version\s+)\S+/m,'$1<RELEASE_VERSION>');
 const body=source.slice(end).replace(/\r\n/g,'\n').replace(/^const WAR_PAYOUT_RELEASE_VERSION = "[0-9.]+";$/m,'const WAR_PAYOUT_RELEASE_VERSION = "<RELEASE_VERSION>";');
 return crypto.createHash('sha256').update(header+body).digest('hex');
}
function assertDistribution(source,script,version){
 const metadata=metadataFile(source);
 for(const [field,expected]of [['version',version],['updateURL',script.updateURL],['downloadURL',script.downloadURL]]){
  const matches=[...metadata.matchAll(new RegExp('^//\\s*@'+field+'\\s+(\\S+)','gm'))];
  if(matches.length!==1||matches[0][1]!==expected)throw new Error(script.id+' '+field+' does not match its release contract');
 }
 if(script.id==='war-payout'){
  const match=source.match(/^const WAR_PAYOUT_RELEASE_VERSION = ("[0-9.]+");$/m);
  if(!match||JSON.parse(match[1])!==version)throw new Error('Payout registration version differs from metadata');
 }
}
function planRelease(raw,source){
 const state=readState(raw),hash=payloadHash(source);
 const changed=hash!==state.payloadSha256||state.version!==state.releasedVersion;
 let version=state.version;
 if(changed&&state.releasedVersion!==null&&compareVersions(version,state.releasedVersion)===0){const parts=versionParts(version);parts[2]++;version=parts.join('.');versionParts(version);}
 return {changed,version,releasedVersion:version,payloadSha256:hash};
}
module.exports={scripts,readState,compareVersions,planRelease,payloadHash,metadataFile,assertDistribution};
