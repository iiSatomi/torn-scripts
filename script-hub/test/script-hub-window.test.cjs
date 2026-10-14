const assert=require('node:assert/strict');
const {normalizeHubWindowPreferences,resolveHubWindowRect}=require('../src/script-hub-window.cjs');
const defaults=normalizeHubWindowPreferences();
assert.equal(defaults.desktop.mode,'last');assert.equal(defaults.mobile.mode,'fit');
const invalid=normalizeHubWindowPreferences({desktop:{mode:'bad',x:Infinity,y:-99,width:'500',height:999999,locked:'yes',secret:'discard'}});
assert.deepEqual(invalid,defaults);assert.equal(JSON.stringify(invalid).includes('secret'),false);
const viewport={width:1000,height:800};
assert.deepEqual(resolveHubWindowRect({...defaults.desktop,mode:'center'},viewport,{width:500,height:300}),{x:250,y:250,width:500,height:300});
const remembered=resolveHubWindowRect({...defaults.desktop,x:900,y:750,width:700,height:600},viewport,{width:500,height:300});
assert.deepEqual(remembered,{x:288,y:188,width:700,height:600});
const corner=resolveHubWindowRect({...defaults.desktop,mode:'bottom-right'},viewport,{width:500,height:300});
assert.deepEqual(corner,{x:488,y:488,width:500,height:300});
const fit=resolveHubWindowRect(defaults.mobile,{width:390,height:844},{width:500,height:300});
assert.deepEqual(fit,{x:12,y:12,width:366,height:820});
for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390],[240,180]]){
  const rect=resolveHubWindowRect({...defaults.desktop,mode:'custom',x:9999,y:9999,width:4096,height:4096},{width,height},{width:500,height:300});
  assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);
}
console.log('PASS window preference sanitization, presets, remembered/custom bounds and viewport recovery');
