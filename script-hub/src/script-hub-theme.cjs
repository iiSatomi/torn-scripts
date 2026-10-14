// Public appearance data only. These functions are bundled into userscripts.
function normalizeScriptUiTheme(raw) {
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)?object[key]:undefined;
  raw=record(raw);if(own(raw,'version')!==undefined&&own(raw,'version')!==1)raw={};
  const choice=(key,allowed,fallback)=>allowed.includes(own(raw,key))?own(raw,key):fallback;
  const bounded=(key,min,max,fallback)=>typeof own(raw,key)==='number'&&Number.isFinite(own(raw,key))?Math.max(min,Math.min(max,own(raw,key))):fallback;
  const colors={light:{},dark:{}};
  const roles=['background','surface','raised','text','muted','border','accent','success','warning','error','focus','selection','chart1','chart2','chart3','chart4','chart5','chart6'];
  for(const mode of ['light','dark']){
    const input=record(own(record(own(raw,'colors')),mode));
    for(const role of roles){const value=own(input,role);if(typeof value==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value))colors[mode][role]=(value.length===4?'#'+[...value.slice(1)].map(c=>c+c).join(''):value).toLowerCase();}
  }
  return {version:1,layout:choice('layout',['frostbite','workbench','torn'],'frostbite'),palette:choice('palette',['frostbite','workbench','torn'],'frostbite'),
    mode:choice('mode',['system','dark','light'],'system'),density:choice('density',['comfortable','compact'],'comfortable'),
    radius:bounded('radius',0,18,null),fontScale:bounded('fontScale',.85,1.35,1),colors};
}

function resolveScriptUiTheme(raw, dark=false) {
  const theme=normalizeScriptUiTheme(raw),mode=theme.mode==='system'?(dark?'dark':'light'):theme.mode;
  // Each palette owns color roles only; layout defaults never select a palette.
  const bases={
    frostbite:{light:['#edf4fa','#ffffff','#e4edf6','#172b40','#4b6075','#bdcedd','#2563a8'],dark:['#0b1421','#111f31','#1a2c42','#e7f0fa','#a4b8cc','#3e546d','#69b5ff']},
    workbench:{light:['#e9e9f0','#ffffff','#f3f2f8','#302c40','#666078','#d3cede','#7051a2'],dark:['#202028','#2a2933','#34323f','#edeaf5','#b7b0c7','#4a4559','#c4a6f5']},
    torn:{light:['#e9e9e9','#ffffff','#dddddd','#222222','#555555','#bbbbbb','#416c38'],dark:['#181818','#242424','#333333','#eeeeee','#bbbbbb','#555555','#91be71']}
  };
  const [background,surface,raised,text,muted,border,accent]=bases[theme.palette][mode];
  const states=mode==='dark'?{success:'#83d99a',warning:'#f4ca68',error:'#ff9696',focus:'#b3d8ff',selection:'#2e4866'}:{success:'#23743c',warning:'#865600',error:'#b42328',focus:'#175fc4',selection:'#c5ddf5'};
  const chart=mode==='dark'?['#78b6ff','#e8b86a','#b29bff','#6ad0bf','#ed99bb','#b1ce78']:['#2866ae','#946000','#7547b5','#187c70','#ad426f','#657c24'];
  const colors={background,surface,raised,text,muted,border,accent,...states,...Object.fromEntries(chart.map((value,i)=>['chart'+(i+1),value])),...theme.colors[mode]};
  const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  colors.onAccent=ratio('#ffffff',colors.accent)>=ratio('#000000',colors.accent)?'#ffffff':'#000000';
  const acrossSurfaces=role=>Math.min(...['background','surface','raised'].map(key=>ratio(colors[role],colors[key])));
  const contrast={text:acrossSurfaces('text'),muted:acrossSurfaces('muted'),onAccent:ratio(colors.onAccent,colors.accent),flags:[]};
  for(const role of ['text','muted','onAccent'])if(contrast[role]<4.5)contrast.flags.push(role);
  if(ratio(colors.focus,colors.surface)<3)contrast.flags.push('focus');
  return {...theme,mode,colors,contrast};
}

function applyScriptUiTheme(node, raw, dark=false) {
  const resolved=resolveScriptUiTheme(raw,dark);
  for(const [role,value]of Object.entries(resolved.colors))node.style.setProperty('--tsui-'+role.replace(/[A-Z]/g,char=>'-'+char.toLowerCase()),value);
  const defaults={frostbite:12,workbench:6,torn:3};
  node.style.setProperty('--tsui-radius',(resolved.radius===null?defaults[resolved.layout]:resolved.radius)+'px');
  node.style.setProperty('--tsui-font-scale',String(resolved.fontScale));
  node.style.setProperty('--tsui-space',resolved.density==='compact'?'6px':'10px');
  node.style.setProperty('--tsui-control-height',resolved.density==='compact'?'32px':'38px');
  node.setAttribute('data-tsui-layout',resolved.layout);node.setAttribute('data-tsui-density',resolved.density);node.setAttribute('data-tsui-mode',resolved.mode);
  return resolved;
}

function scriptUiThemeCss() {
  return `.tsui-surface{box-sizing:border-box;color:var(--tsui-text);background:var(--tsui-background);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);font-size:calc(14px * var(--tsui-font-scale,1));color-scheme:light;accent-color:var(--tsui-accent)}
.tsui-surface[data-tsui-mode="dark"]{color-scheme:dark}
.tsui-surface *{box-sizing:border-box}.tsui-surface ::selection{background:var(--tsui-selection);color:var(--tsui-text)}
.tsui-surface :is(button,input,select,textarea){font:inherit;color:var(--tsui-text);background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:calc(var(--tsui-radius) / 2);min-height:var(--tsui-control-height);padding:var(--tsui-space)}
.tsui-surface button{cursor:pointer}.tsui-surface :disabled{cursor:default;opacity:.6}.tsui-surface :focus-visible{outline:2px solid var(--tsui-focus);outline-offset:2px}
.tsui-surface .tsui-primary{color:var(--tsui-on-accent);background:var(--tsui-accent)}.tsui-surface .tsui-muted{color:var(--tsui-muted)}
@media(pointer:coarse),(max-width:600px){.tsui-surface :is(button,input,select,textarea){min-height:44px}.tsui-surface :is(input,select,textarea){font-size:max(16px,1em)}}
@media(prefers-reduced-motion:reduce){.tsui-surface,.tsui-surface *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
}
module.exports = {normalizeScriptUiTheme,resolveScriptUiTheme,applyScriptUiTheme,scriptUiThemeCss};
