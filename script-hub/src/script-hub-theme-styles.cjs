function hubThemeStyles() {
  return `
  #tsh-dialog[data-tsui-layout]{background:var(--tsui-surface);color:var(--tsui-text);border-color:var(--tsui-border);border-radius:var(--tsui-radius,10px);font-size:calc(13px * var(--tsui-font-scale,1));--tsh-accent:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] :is(button,input,select,textarea){font:inherit;color:var(--tsui-text);border-color:var(--tsui-border)!important;border-radius:var(--tsui-radius,7px);background:var(--tsui-raised)}
  #tsh-dialog[data-tsui-layout] :is(input,select,textarea){background:var(--tsui-surface)!important;color:var(--tsui-text)!important}
  #tsh-dialog[data-tsui-layout] :is(.tsh-header,.tsh-hub-nav){background:var(--tsui-raised);color:var(--tsui-text);border-color:var(--tsui-border)}
  #tsh-dialog[data-tsui-layout] :is(h2,h3,h4){color:var(--tsui-text)}
  #tsh-dialog[data-tsui-layout] :is(.tsh-primary,.tsh-action,.tsh-forget,.tsh-more,.tsh-settings-script,.tsh-settings-page,.tsh-native-settings,.tsh-pin,.tsh-key-provider,.tsh-key-provider button,.tsh-preference-transfer button,.tsh-back,.tsh-hub-tab,.tsh-window-button,.tsh-resize-handle){background:var(--tsui-raised);color:var(--tsui-text);border-color:var(--tsui-border)}
  #tsh-dialog[data-tsui-layout] :is(.tsh-primary,.tsh-settings-script):hover{background:var(--tsui-selection);border-color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] :is(.tsh-count,.tsh-icon,.tsh-form-save){color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] :is(.tsh-intro,.tsh-subtitle,.tsh-page-title,.tsh-form-help,.tsh-form-description,.tsh-empty,.tsh-state,.tsh-script-heading p,.tsh-form-section h4){color:var(--tsui-muted)}
  #tsh-dialog[data-tsui-layout] :is(.tsh-status,.tsh-settings-message){color:var(--tsui-warning)}
  #tsh-dialog[data-tsui-layout] .tsh-discard-confirm{background:var(--tsui-raised);color:var(--tsui-text);border-color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] button[aria-selected=true],#tsh-dialog[data-tsui-layout] button[aria-pressed=true]{background:var(--tsui-selection);color:var(--tsui-accent);border-color:var(--tsui-accent)!important}
  #tsh-dialog[data-tsui-layout] :focus-visible{outline:2px solid var(--tsui-focus);outline-offset:2px}
  #tsh-dialog[data-tsui-layout] .tsh-theme-save{background:var(--tsui-accent);color:var(--tsui-on-accent)}
  #tsh-dialog .tsh-theme-section{border-top:1px solid var(--tsui-border);padding:16px 0}
  #tsh-dialog .tsh-themes h4{margin:0 0 8px;font-size:13px}
  #tsh-dialog .tsh-themes p{font-size:12px;line-height:1.5}
  #tsh-dialog .tsh-theme-layouts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 18px}
  #tsh-dialog .tsh-theme-layout{display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:0;padding:10px;text-align:left;border:1px solid var(--tsui-border)}
  #tsh-dialog .tsh-theme-layout small{font-size:11px;color:var(--tsui-muted);white-space:normal}
  #tsh-dialog .tsh-theme-layout strong{font-size:12px}
  #tsh-dialog .tsh-theme-diagram{height:48px;display:grid;grid-template-columns:18px 1fr;gap:5px;padding:6px;border:1px solid var(--tsui-border);border-radius:4px;background:var(--tsui-surface)}
  #tsh-dialog .tsh-theme-diagram span{background:var(--tsui-selection);border-radius:2px}
  #tsh-dialog .tsh-theme-diagram span:nth-child(3){display:none}
  #tsh-dialog [data-layout=workbench] .tsh-theme-diagram{grid-template-columns:1fr 18px;grid-template-rows:7px 1fr}
  #tsh-dialog [data-layout=workbench] .tsh-theme-diagram span:first-child{grid-column:1/-1}
  #tsh-dialog [data-layout=workbench] .tsh-theme-diagram span:nth-child(3){display:block}
  #tsh-dialog [data-layout=torn] .tsh-theme-diagram{grid-template-columns:1fr;grid-template-rows:7px 1fr}
  #tsh-dialog .tsh-theme-fields,#tsh-dialog .tsh-theme-colors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  #tsh-dialog .tsh-theme-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--tsui-muted);min-width:0}
  #tsh-dialog .tsh-theme-field :is(select,input){width:100%;min-width:0;padding:8px}
  #tsh-dialog .tsh-theme-color{display:flex;gap:9px;align-items:center;padding:9px;border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);font-size:12px;min-width:0}
  #tsh-dialog .tsh-theme-color input{width:30px;height:34px;padding:0;border:0;flex:none}
  #tsh-dialog .tsh-theme-color label{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
  #tsh-dialog .tsh-theme-color .tsh-theme-color-reset{padding:4px;min-width:28px;flex:none}
  #tsh-dialog .tsh-theme-color code{display:block;background:transparent;color:var(--tsui-muted);font:11px Consolas,monospace;margin-top:4px}
  #tsh-dialog .tsh-theme-advanced{padding:12px 0;color:var(--tsui-muted)}
  #tsh-dialog .tsh-theme-advanced summary{cursor:pointer;min-height:28px}
  #tsh-dialog .tsh-theme-advanced>.tsh-theme-fields{margin-top:12px}
  #tsh-dialog .tsh-theme-actions,#tsh-dialog .tsh-theme-transfer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
  #tsh-dialog .tsh-themes button{padding:8px 10px;min-height:34px}
  #tsh-dialog .tsh-theme-dirty{margin-right:auto;font-size:12px;color:var(--tsui-muted)}
  #tsh-dialog .tsh-theme-message{color:var(--tsui-warning)}
  #tsh-dialog .tsh-theme-preset-name,#tsh-dialog .tsh-theme-presets{min-width:0;max-width:100%;padding:8px}
  #tsh-dialog .tsh-theme-import{width:100%;max-width:100%;padding:8px}
  #tsh-dialog .tsh-appearance-inspector{display:none;padding:14px;border-left:1px solid var(--tsui-border);background:var(--tsui-raised);font-size:12px;min-width:0}
  #tsh-dialog .tsh-appearance-inspector p{color:var(--tsui-muted);line-height:1.5}
  #tsh-dialog[data-tsui-layout=frostbite]{display:grid;grid-template-columns:124px minmax(0,1fr);align-content:start}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-header{grid-column:1/-1;grid-row:1}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav{grid-column:1;grid-row:2/8;flex-direction:column;position:static;align-self:stretch;justify-content:flex-start;border-right:1px solid var(--tsui-border);padding:12px 8px}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav button{flex:none;text-align:left}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-toolbar{grid-column:2;grid-row:2}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-intro{grid-column:2;grid-row:3}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-grid{grid-column:2;grid-row:4}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-actions{grid-column:2;grid-row:5}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-settings-view{grid-column:2;grid-row:2/7;min-width:0}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-status{grid-column:2;grid-row:7}
  #tsh-dialog[data-tsui-layout=workbench]{display:grid;grid-template-columns:minmax(0,1fr) 160px;align-content:start}
  #tsh-dialog[data-tsui-layout=workbench]>:is(.tsh-header,.tsh-hub-nav){grid-column:1/-1}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-header{grid-row:1}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav{grid-row:2;position:static;background:var(--tsui-background)}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav button{border-radius:5px 5px 0 0;background:transparent}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav button[aria-selected=true]{background:var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-toolbar{grid-column:1;grid-row:3}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-intro{grid-column:1;grid-row:4}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-grid{grid-column:1;grid-row:5}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-actions{grid-column:1;grid-row:6}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-status{grid-column:1;grid-row:7}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-settings-view{grid-column:1;grid-row:3/7;min-width:0}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-appearance-inspector{display:block;grid-column:2;grid-row:3/8}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-header{border-top:3px solid var(--tsui-accent)}
  #tsh-dialog[data-tsui-density=compact] .tsh-theme-section{padding:10px 0}
  #tsh-dialog[data-tsui-density=compact] .tsh-theme-color{padding:6px}
  @media(max-width:600px),(max-height:500px){
    #tsh-dialog[data-tsui-layout]{display:block}
    #tsh-dialog[data-tsui-layout]>.tsh-hub-nav{display:flex;flex-direction:row;position:static;padding:7px;border-right:0}
    #tsh-dialog[data-tsui-layout]>.tsh-hub-nav button{flex:1;min-width:0;padding:7px 5px;font-size:12px}
    #tsh-dialog[data-tsui-layout]>.tsh-appearance-inspector{display:none}
    #tsh-dialog .tsh-themes :is(button,summary){min-height:44px}
    #tsh-dialog .tsh-themes :is(input,select){font-size:16px}
    #tsh-dialog .tsh-theme-layout{padding:8px}
    #tsh-dialog .tsh-theme-layout small{display:none}
    #tsh-dialog .tsh-theme-fields{grid-template-columns:1fr}
    #tsh-dialog .tsh-theme-actions{justify-content:flex-start}
  }
  @media(prefers-reduced-motion:reduce){#tsh-dialog[data-tsui-layout] *{scroll-behavior:auto;transition:none}}
  `;
}
module.exports = { hubThemeStyles };
