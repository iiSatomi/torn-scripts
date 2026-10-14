// Original, bundled vector artwork. Colors inherit theme roles; no remote assets or user data.
function appendScriptUiHeaderArt(doc,header) {
  const mark=doc.createElement('span');mark.className='tsui-theme-mark';mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<svg class="tsui-frost-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 3v26M5 9l22 14M5 23L27 9M12 6l4 4 4-4M12 26l4-4 4 4M5 14l5-1-1-5M23 24l-1-5 5-1M5 18l5 1-1 5M23 8l-1 5 5 1"/><path d="m16 11 4 2v6l-4 2-4-2v-6z"/></svg><svg class="tsui-workbench-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="5" width="24" height="22" rx="3"/><path d="M4 11h24M12 11v16M8 8h1m3 0h1m3 0h1M16 16l3 3-3 3m6 0h3"/></svg><svg class="tsui-torn-mark" viewBox="0 0 32 32" fill="currentColor"><path d="M3 26h26v3H3zm2-9h5v8H5zm7-10h8v18h-8zm10 6h5v12h-5zM14 3h4v3h-4z"/><path d="M14 10h1v2h-1zm3 0h1v2h-1zm-3 5h1v2h-1zm3 0h1v2h-1z" fill="var(--tsui-raised)"/></svg>';
  const scene=doc.createElement('span');scene.className='tsui-theme-scene';scene.setAttribute('aria-hidden','true');
  scene.innerHTML='<svg viewBox="0 0 300 72" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="currentColor"><path d="m0 72 52-38 30 18 49-45 41 35 27-18 46 34 55-42v56z" fill="currentColor" opacity=".09" stroke="none"/><path d="m0 72 52-38 30 18 49-45 41 35 27-18 46 34 55-42M97 39l34-32 5 35 22 15m-70-2 43-48 41 35m-120-8 7 30m140-40 11 39" opacity=".45"/><path d="M260 6v18m-8-14 16 10m-16 0 16-10M224 8v8m-4-6 8 4m-8 0 8-4" opacity=".7"/></svg>';
  header.prepend(mark);header.append(scene);
}
function scriptUiIdentityCss(scope) {
  return `${scope} .tsui-theme-mark{display:none;flex:none;width:30px;height:30px;color:var(--tsui-accent);pointer-events:none}
${scope} .tsui-theme-mark svg{display:none;width:100%;height:100%}
${scope}[data-tsui-layout] .tsui-theme-mark{display:block}
${scope}[data-tsui-layout=frostbite] .tsui-frost-mark,${scope}[data-tsui-layout=workbench] .tsui-workbench-mark,${scope}[data-tsui-layout=torn] .tsui-torn-mark{display:block}
${scope} .tsui-theme-scene{display:none;position:absolute;inset:0 0 0 auto;width:min(44%,300px);overflow:hidden;color:var(--tsui-accent);opacity:.45;pointer-events:none;z-index:-1}
${scope} .tsui-theme-scene svg{width:100%;height:100%}
${scope}[data-tsui-layout=frostbite] .tsui-theme-scene{display:block}
${scope}[data-tsui-layout=frostbite] .tsui-header,${scope}[data-tsui-layout=frostbite] .tsh-header{isolation:isolate}
${scope}[data-tsui-layout=torn] .tsui-theme-mark{width:22px;height:22px}
@media(max-width:600px){${scope} .tsui-theme-mark{width:24px;height:24px}${scope} .tsui-theme-scene{opacity:.28;width:38%}}`;
}
module.exports={appendScriptUiHeaderArt,scriptUiIdentityCss};
