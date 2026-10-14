const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeScriptUiTheme,resolveScriptUiTheme,applyScriptUiTheme,scriptUiThemeCss} = require('../src/script-hub-theme.cjs');

test('canonical preferences are bounded, allowlisted, independent, and immutable',()=>{
  const raw={version:1,layout:'workbench',palette:'torn',mode:'light',density:'compact',radius:99,fontScale:99,
    colors:{light:{accent:'#abc',apiKey:'discard',text:'url(evil)'},dark:{accent:'#123456'}},secret:'discard'};
  const theme=normalizeScriptUiTheme(raw);
  assert.deepEqual(theme,{version:1,layout:'workbench',palette:'torn',mode:'light',density:'compact',radius:18,fontScale:1.35,colors:{light:{accent:'#aabbcc'},dark:{accent:'#123456'}}});
  theme.colors.light.accent='#000000';assert.equal(raw.colors.light.accent,'#abc');
  assert.deepEqual(normalizeScriptUiTheme({version:99,layout:'torn'}),normalizeScriptUiTheme());
  for(const bad of [null,[],42,'x',{layout:'x',palette:'x',mode:'x',density:'x',radius:'9',fontScale:NaN}])assert.deepEqual(normalizeScriptUiTheme(bad),normalizeScriptUiTheme());
  assert.equal(normalizeScriptUiTheme({radius:-1,fontScale:0}).radius,0);
  assert.equal(normalizeScriptUiTheme({fontScale:0}).fontScale,.85);
  const inherited=Object.create({layout:'torn',colors:{dark:{text:'#000000'}}});
  assert.deepEqual(normalizeScriptUiTheme(inherited),normalizeScriptUiTheme());
  assert.ok(JSON.stringify(normalizeScriptUiTheme({colors:{dark:Object.fromEntries(Array.from({length:10000},(_,i)=>['x'+i,'#ffffff']))}})).length<2048);
});

test('all palettes resolve independent layout, separate appearances and readable accent text',()=>{
  for(const palette of ['frostbite','workbench','torn'])for(const dark of [false,true]){
    const a=resolveScriptUiTheme({palette,layout:'frostbite'},dark),b=resolveScriptUiTheme({palette,layout:'workbench'},dark);
    assert.deepEqual(a.colors,b.colors);assert.equal(a.mode,dark?'dark':'light');
    assert.equal(Object.keys(a.colors).length,19);assert.ok(a.contrast.onAccent>=4.5);
    assert.ok(a.contrast.text>=4.5);assert.ok(a.contrast.muted>=4.5);
    for(const color of Object.values(a.colors))assert.match(color,/^#[0-9a-f]{6}$/);
  }
  assert.equal(resolveScriptUiTheme({mode:'dark',colors:{light:{accent:'#fff'},dark:{accent:'#000'}}},false).colors.accent,'#000000');
  assert.equal(resolveScriptUiTheme({mode:'light',colors:{light:{accent:'#fff'},dark:{accent:'#000'}}},true).colors.accent,'#ffffff');
  const low=resolveScriptUiTheme({colors:{light:{text:'#ffffff',background:'#ffffff',surface:'#ffffff'}}});
  assert.equal(low.colors.text,'#ffffff');assert.ok(low.contrast.flags.includes('text'));
});
test('Workbench uses the approved violet and graphite palette',()=>{
  const roles=['background','surface','raised','text','muted','border','accent'];
  assert.deepEqual(roles.map(role=>resolveScriptUiTheme({palette:'workbench'},false).colors[role]),['#e9e9f0','#ffffff','#f3f2f8','#302c40','#666078','#d3cede','#7051a2']);
  assert.deepEqual(roles.map(role=>resolveScriptUiTheme({palette:'workbench'},true).colors[role]),['#202028','#2a2933','#34323f','#edeaf5','#b7b0c7','#4a4559','#c4a6f5']);
});

test('apply changes only owned tokens/attributes, preserving live DOM and draft state',()=>{
  const values={},attrs={},node={style:{setProperty:(key,value)=>values[key]=value},setAttribute:(key,value)=>attrs[key]=value};
  Object.defineProperty(node,'innerHTML',{set(){throw Error('must preserve DOM');}});
  const resolved=applyScriptUiTheme(node,{layout:'torn',density:'compact',radius:0,fontScale:1.2},true);
  assert.equal(values['--tsui-accent'],resolved.colors.accent);assert.equal(values['--tsui-on-accent'],resolved.colors.onAccent);
  assert.equal(values['--tsui-radius'],'0px');assert.equal(values['--tsui-font-scale'],'1.2');
  assert.deepEqual(attrs,{'data-tsui-layout':'torn','data-tsui-density':'compact','data-tsui-mode':'dark'});
  const css=scriptUiThemeCss();assert.match(css,/\.tsui-surface/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/44px/);
});
