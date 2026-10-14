// Public window geometry only; no script settings or credential state.
function normalizeHubWindowPreferences(raw) {
  const modes=['last','center','top-left','top-right','bottom-left','bottom-right','custom','fit'];
  const profile=(value,mobile)=>{
    value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const integer=(key,max,fallback)=>Number.isInteger(value[key])&&value[key]>=0&&value[key]<=max?value[key]:fallback;
    return {mode:modes.includes(value.mode)?value.mode:mobile?'fit':'last',
      x:integer('x',16384,null),y:integer('y',16384,null),
      width:integer('width',4096,0),height:integer('height',4096,0),locked:value.locked===true};
  };
  return {desktop:profile(raw?.desktop,false),mobile:profile(raw?.mobile,true)};
}
function resolveHubWindowRect(profile,viewport,natural) {
  const vw=Math.max(1,Number(viewport.width)||1),vh=Math.max(1,Number(viewport.height)||1);
  const gap=Math.min(12,vw/4,vh/4),maxWidth=vw-gap*2,maxHeight=vh-gap*2;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const fit=profile.mode==='fit';
  const width=fit?maxWidth:clamp(profile.width||natural.width||510,Math.min(280,maxWidth),maxWidth);
  const height=fit?maxHeight:clamp(profile.height||natural.height||180,Math.min(180,maxHeight),maxHeight);
  let x=(vw-width)/2,y=(vh-height)/2;
  if(['last','custom'].includes(profile.mode)){
    if(Number.isFinite(profile.x))x=profile.x;
    if(Number.isFinite(profile.y))y=profile.y;
  }
  if(profile.mode.endsWith('left')||fit)x=gap;
  if(profile.mode.endsWith('right'))x=vw-gap-width;
  if(profile.mode.startsWith('top')||fit)y=gap;
  if(profile.mode.startsWith('bottom'))y=vh-gap-height;
  return {x:clamp(x,gap,vw-gap-width),y:clamp(y,gap,vh-gap-height),width,height};
}
function createHubWindowController({doc,win,getPreferences,onChange}) {
  let node=null,header=null,grip=null,lock=null,resetButton=null,gesture=null,frame=null,observer=null;
  let signature='',profileName='',lastRect=null,sessionOrigin=null;
  const disposers=[];
  const viewport=()=>({width:win.innerWidth,height:win.innerHeight});
  const kind=()=>win.innerWidth<=600||win.innerHeight<=500?'mobile':'desktop';
  const profiles=()=>normalizeHubWindowPreferences(getPreferences());
  const listen=(target,name,callback,options)=>{target.addEventListener(name,callback,options);disposers.push(()=>target.removeEventListener(name,callback,options));};
  function control(label,cls,click){const button=doc.createElement('button');button.type='button';button.className=cls;button.textContent=label;button.addEventListener('click',click);return button;}
  function enabled(){const profile=profiles()[kind()];return !!node&&!node.hidden&&!profile.locked&&profile.mode!=='fit';}
  function updateControls(){
    if(!node)return;const profile=profiles()[kind()],allowed=!profile.locked&&profile.mode!=='fit';
    lock.textContent=profile.locked?'Unlock':'Lock';lock.setAttribute('aria-pressed',String(profile.locked));lock.setAttribute('aria-label',profile.locked?'Unlock hub window layout':'Lock hub window layout');
    header.tabIndex=allowed?0:-1;header.style.touchAction=allowed?'none':'';
    header.classList.toggle('tsh-window-draggable',allowed);grip.hidden=!allowed;
    node.classList.toggle('tsh-window-manipulable',allowed);
    const headerHeight=header.getBoundingClientRect().height;if(headerHeight>0)node.style.setProperty('--tsh-header-height',headerHeight+'px');
    if(lastRect){const offset=kind()==='mobile'?48:32;grip.style.left=(lastRect.x+lastRect.width-offset)+'px';grip.style.top=(lastRect.y+lastRect.height-offset)+'px';}
  }
  function apply(rect,explicit=false){
    if(!node)return;const profile=profiles()[kind()];
    node.style.inset='auto';node.style.margin='0';node.style.left=rect.x+'px';node.style.top=rect.y+'px';
    node.style.width=rect.width+'px';node.style.height=explicit||profile.height||profile.mode==='fit'?rect.height+'px':'auto';
    node.style.maxHeight=Math.max(1,win.innerHeight-24)+'px';node.style.minHeight=Math.min(180,Math.max(1,win.innerHeight-24))+'px';
    lastRect=rect;updateControls();
  }
  function reflow(){
    if(!node||node.hidden||gesture)return;
    // Measuring natural height temporarily expands a resized window. Browsers
    // clamp its scroll offsets during that measurement, even if the final size
    // is unchanged (for example when Torn adds an unrelated page element).
    const scrollTop=node.scrollTop,scrollLeft=node.scrollLeft;
    const profile=profiles()[kind()];
    // Let a default-height window grow with pages, then keep all bounds reachable.
    node.style.height='auto';
    node.style.width=Math.min(profile.width||740,Math.max(1,win.innerWidth-24))+'px';
    node.style.maxHeight=Math.max(1,win.innerHeight-24)+'px';
    const bounds=node.getBoundingClientRect();
    const openingProfile=sessionOrigin?.name===kind()&&profile.mode!=='fit'?{...profile,mode:'custom',x:sessionOrigin.x,y:sessionOrigin.y}:profile;
    const rect=resolveHubWindowRect(openingProfile,viewport(),{width:bounds.width,height:bounds.height});
    sessionOrigin={name:kind(),x:rect.x,y:rect.y};apply(rect);
    node.scrollTop=scrollTop;node.scrollLeft=scrollLeft;
  }
  function schedule(){if(frame!==null||!node||node.hidden||gesture)return;frame=win.requestAnimationFrame(()=>{frame=null;reflow();});}
  function saveRect(rect,resized){
    const next=profiles(),name=kind();
    next[name]={...next[name],x:Math.round(rect.x),y:Math.round(rect.y),
      ...(!resized?{mode:'last'}:{width:Math.round(rect.width),height:Math.round(rect.height)})};
    onChange(next);reflow();
  }
  function rectChanged(before,after){return ['x','y','width','height'].some(key=>before[key]!==after[key]);}
  function release(commit){
    if(!gesture)return false;const previous=gesture;gesture=null;
    win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);win.removeEventListener('pointercancel',cancel);
    previous.target.removeEventListener('lostpointercapture',lostCapture);
    try{if(previous.target.hasPointerCapture?.(previous.pointerId))previous.target.releasePointerCapture(previous.pointerId);}catch(_){}
    if(commit){if(rectChanged(previous.start,previous.rect))saveRect(previous.rect,previous.resized);}else apply(previous.start,true);
    node?.classList.remove('tsh-window-moving');return true;
  }
  function cancel(event){if(!gesture||event.pointerId===gesture.pointerId)release(false);}function lostCapture(){release(false);}
  function start(event,resized){
    if(!enabled()||gesture||event.button!==0||event.isPrimary===false)return;
    if(!resized&&event.target.closest('button,a,input,select,textarea'))return;
    const bounds=node.getBoundingClientRect(),target=resized?grip:header;
    gesture={pointerId:event.pointerId,target,resized,start:{x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height},rect:null,x:event.clientX,y:event.clientY};
    gesture.rect={...gesture.start};event.preventDefault();target.focus({preventScroll:true});node.classList.add('tsh-window-moving');
    win.addEventListener('pointermove',move);win.addEventListener('pointerup',up);win.addEventListener('pointercancel',cancel);target.addEventListener('lostpointercapture',lostCapture);
    try{target.setPointerCapture(event.pointerId);}catch(_){}
  }
  function move(event){
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,start=gesture.start;
    const raw={mode:'custom',x:start.x+(gesture.resized?0:dx),y:start.y+(gesture.resized?0:dy),width:Math.max(1,start.width+(gesture.resized?dx:0)),height:Math.max(1,start.height+(gesture.resized?dy:0))};
    gesture.rect=resolveHubWindowRect(raw,viewport(),start);apply(gesture.rect,true);event.preventDefault();
  }
  function up(event){if(gesture&&event.pointerId===gesture.pointerId)release(true);}
  function key(event,resized){
    if(!enabled()||event.target!==(resized?grip:header)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const amount=event.shiftKey?50:10,dx=event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0,dy=event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0;
    const r=node.getBoundingClientRect();
    const rect=resolveHubWindowRect({mode:'custom',x:r.left+(resized?0:dx),y:r.top+(resized?0:dy),width:r.width+(resized?dx:0),height:r.height+(resized?dy:0)},viewport(),{width:r.width,height:r.height});
    apply(rect,true);if(rectChanged(r,rect))saveRect(rect,resized);event.preventDefault();event.stopPropagation();
  }
  function reset(){
    release(false);sessionOrigin=null;const next=profiles();next[kind()]=normalizeHubWindowPreferences()[kind()];onChange(next);reflow();
  }
  function update(){
    const next=JSON.stringify(profiles()),name=kind();
    if(next!==signature||name!==profileName){release(false);sessionOrigin=null;signature=next;profileName=name;reflow();}
    updateControls();
  }
  function stop(){
    release(false);for(const dispose of disposers.splice(0))dispose();observer?.disconnect();observer=null;
    if(frame!==null)win.cancelAnimationFrame(frame);frame=null;
    grip?.remove();lock?.remove();resetButton?.remove();node=header=grip=lock=resetButton=null;lastRect=sessionOrigin=null;signature='';
    doc.getElementById('tsh-window-style')?.remove();
  }
  function mount(dialog){
    if(node===dialog){schedule();return;}stop();node=dialog;header=node.querySelector('.tsh-header');
    header.classList.add('tsh-drag-handle');header.setAttribute('aria-label','Move hub window with arrow keys. Hold Shift for larger steps.');
    lock=control('Lock','tsh-window-button tsh-window-lock',()=>{release(false);const next=profiles(),name=kind();next[name].locked=!next[name].locked;onChange(next);});
    resetButton=control('Reset','tsh-window-button tsh-window-reset',reset);resetButton.title='Reset position, size and lock for this screen layout';
    resetButton.setAttribute('aria-label','Reset hub window position and size');
    const close=node.querySelector('.tsh-close');header.insertBefore(lock,close);header.insertBefore(resetButton,close);
    grip=control('◢','tsh-resize-handle',()=>{});grip.setAttribute('aria-label','Resize hub window with arrow keys or drag');node.append(grip);
    listen(header,'pointerdown',event=>start(event,false));listen(grip,'pointerdown',event=>start(event,true));
    listen(header,'keydown',event=>key(event,false));listen(grip,'keydown',event=>key(event,true));
    listen(win,'resize',()=>{release(false);sessionOrigin=null;update();schedule();});
    if(typeof win.ResizeObserver==='function'){observer=new win.ResizeObserver(schedule);observer.observe(node);}
    if(!doc.getElementById('tsh-window-style')){
      const style=doc.createElement('style');style.id='tsh-window-style';style.textContent=`
        #tsh-dialog .tsh-header{gap:7px}#tsh-dialog .tsh-header h2{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #tsh-dialog .tsh-window-draggable{cursor:move;user-select:none}#tsh-dialog .tsh-window-moving{user-select:none}
        #tsh-dialog .tsh-window-button{min-height:32px;padding:5px 7px;border:1px solid #555;border-radius:4px;background:#353535;color:#ddd}
        #tsh-dialog .tsh-window-lock[aria-pressed=true]{border-color:var(--tsh-accent);color:var(--tsh-accent)}
        #tsh-dialog.tsh-window-manipulable{padding-bottom:30px}
        #tsh-dialog .tsh-resize-handle{position:fixed;z-index:2147483003;width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:3px;background:#353535;color:#ccc;font-size:22px;cursor:nwse-resize;touch-action:none}
        #tsh-dialog.tsh-theme-light .tsh-window-button,#tsh-dialog.tsh-theme-light .tsh-resize-handle{background:#ddd;color:#222}
        #tsh-dialog .tsh-drag-handle:focus-visible{outline:2px solid var(--tsh-accent);outline-offset:-3px}
        @media(max-width:600px),(max-height:500px){#tsh-dialog .tsh-count{display:none}#tsh-dialog .tsh-window-button{min-height:44px}#tsh-dialog .tsh-close{width:44px;height:44px}#tsh-dialog .tsh-resize-handle{width:44px;height:44px;min-height:44px}}
      `;(doc.head||doc.documentElement).append(style);
    }
    update();
  }
  return {mount,update,open:()=>{sessionOrigin=null;reflow();},close:()=>release(false),cancelInteraction:()=>release(false),reset,stop};
}
module.exports = { normalizeHubWindowPreferences, resolveHubWindowRect, createHubWindowController };
