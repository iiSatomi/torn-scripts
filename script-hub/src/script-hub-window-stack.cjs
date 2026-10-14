// DOM attributes coordinate independently bundled windows; no callbacks or data cross worlds.
function scriptUiFloatingOwner(doc,node) {
  let owner=null;
  for(let current=node;current&&current!==doc.body&&current!==doc.documentElement;current=current.parentElement){
    if(doc.defaultView.getComputedStyle(current).position==='fixed')owner=current;
  }
  return owner;
}
function scriptUiFloatingWindows(doc) {
  const nodes=new Set(doc.querySelectorAll('[data-tsui-kit="1"][data-tsui-surface="floating"],#tsh-dialog,[data-tsui-stack-window="1"]'));
  for(const root of doc.querySelectorAll('.tsui-legacy-surface')){const owner=scriptUiFloatingOwner(doc,root);if(owner)nodes.add(owner);}
  return Array.from(nodes)
    .filter(node=>!node.hidden&&node.isConnected&&node.getClientRects().length)
    .sort((a,b)=>{
      const rank=node=>{const value=Number(node.getAttribute('data-tsui-stack'));return Number.isSafeInteger(value)&&value>=0&&value<1000000?value:0;};
      return rank(a)-rank(b);
    });
}
function focusScriptUiWindow(doc,node) {
  const windows=scriptUiFloatingWindows(doc),index=windows.indexOf(node);
  if(index!==-1){windows.splice(index,1);windows.push(node);}
  windows.forEach((entry,i)=>{entry.setAttribute('data-tsui-stack',String(i));entry.style.zIndex=String(2147481000+i*2);});
  return windows.length;
}
module.exports={scriptUiFloatingOwner,scriptUiFloatingWindows,focusScriptUiWindow};
