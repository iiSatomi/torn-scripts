function hubThemeStyles() {
  return (typeof scriptUiIdentityCss==='function'?scriptUiIdentityCss('#tsh-dialog'):'')+`
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
  #tsh-dialog[data-tsui-layout] button:disabled{opacity:.55;cursor:default}
  #tsh-dialog[data-tsui-layout] .tsh-tile:focus-within{border-color:var(--tsui-focus)}
  #tsh-dialog[data-tsui-layout] .tsh-tile-controls button:focus-visible{outline-offset:-3px}
  #tsh-dialog[data-tsui-layout] .tsh-pin[aria-pressed=true]{color:var(--tsui-accent);background:var(--tsui-selection);font-weight:700}
  #tsh-dialog[data-tsui-layout] .tsh-state{display:flex;align-items:center;justify-content:inherit;gap:5px;line-height:1.4}
  #tsh-dialog[data-tsui-layout] .tsh-tile[data-active=true] .tsh-state:before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}
  #tsh-dialog[data-tsui-layout] .tsh-tile[data-active=false] .tsh-state:before{content:'↗';font-size:12px}
  #tsh-dialog[data-tsui-layout] .tsh-header{isolation:isolate}
  #tsh-dialog[data-tsui-layout] .tsh-header h2{position:relative;font-size:16px;letter-spacing:-.025em;line-height:1.2}
  #tsh-dialog[data-tsui-layout] .tsh-header>:is(.tsh-count,button){position:relative;z-index:1}
  #tsh-dialog[data-tsui-layout] .tsui-theme-mark{display:flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] .tsui-theme-mark>:is(.tsui-frost-mark,.tsui-workbench-mark,.tsui-torn-mark){display:none;width:100%;height:100%}
  #tsh-dialog[data-tsui-layout] .tsui-theme-scene{display:none;pointer-events:none}
  #tsh-dialog[data-tsui-layout] .tsh-nav-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:17px;height:17px;vertical-align:middle}
  #tsh-dialog[data-tsui-layout] .tsh-hub-tab{display:flex;align-items:center;justify-content:center;gap:7px}
  #tsh-dialog[data-tsui-layout] .tsh-primary .tsh-icon{flex:none;color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] .tsh-primary:hover .tsh-icon{color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout] :is(.tsh-script-heading,.tsh-form-section){border-color:var(--tsui-border)}
  #tsh-dialog[data-tsui-layout] .tsh-settings-script small{color:var(--tsui-muted)}
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
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-header{grid-column:1/-1;grid-row:1;min-height:76px;padding:14px 18px;background:linear-gradient(115deg,var(--tsui-surface),var(--tsui-raised));gap:11px}
  #tsh-dialog[data-tsui-layout=frostbite] .tsui-theme-mark>.tsui-frost-mark{display:block}
  #tsh-dialog[data-tsui-layout=frostbite] .tsui-theme-mark{width:37px;height:37px}
  #tsh-dialog[data-tsui-layout=frostbite] .tsui-theme-scene{display:block;position:absolute;inset:0 82px 0 auto;width:200px;max-width:46%;height:100%;color:var(--tsui-accent);opacity:.23;z-index:-1;overflow:hidden}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-count{padding:5px 8px;border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);background:var(--tsui-surface);font-size:11px;white-space:nowrap}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav{grid-column:1;grid-row:2/8;flex-direction:column;position:static;align-self:stretch;justify-content:flex-start;border-right:1px solid var(--tsui-border);border-bottom:0;padding:14px 8px;background:var(--tsui-background);gap:6px}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav button{flex:none;justify-content:flex-start;text-align:left;padding:10px 8px;border-color:var(--tsui-background)!important;background:var(--tsui-background)}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav button[aria-selected=true]{border-color:var(--tsui-border)!important;box-shadow:inset 3px 0 0 var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-toolbar{grid-column:2;grid-row:2}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-intro{grid-column:2;grid-row:3}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-grid{grid-column:2;grid-row:4}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-actions{grid-column:2;grid-row:5}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-settings-view{grid-column:2;grid-row:2/7;min-width:0}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-status{grid-column:2;grid-row:7}
  #tsh-dialog[data-tsui-layout=frostbite]>.tsh-grid{grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:12px;padding:16px}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-tile{border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);background:var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-primary{flex:1;min-height:112px;padding:14px 8px 10px;gap:8px;border:0;background:linear-gradient(150deg,var(--tsui-surface),var(--tsui-raised));box-shadow:none;border-radius:var(--tsui-radius) var(--tsui-radius) 0 0}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-primary .tsh-icon{width:43px;height:43px;padding:8px;border:1px solid var(--tsui-border);border-radius:calc(var(--tsui-radius) * .8);background:var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-primary .tsh-name{font-weight:600}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-tile-controls{justify-content:flex-start;gap:0;margin:0;border-top:1px solid var(--tsui-border);border-radius:0 0 var(--tsui-radius) var(--tsui-radius)}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-tile-controls button{margin:0;background:transparent;border:0;border-radius:0;min-height:32px}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-tile-controls .tsh-pin{min-width:36px;border-radius:0 0 0 var(--tsui-radius)}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-tile-controls .tsh-more{flex:1;border-left:1px solid var(--tsui-border);border-radius:0 0 var(--tsui-radius) 0}
  #tsh-dialog[data-tsui-layout] .tsh-tile-controls button:hover{background:var(--tsui-selection);color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-primary:focus-visible{outline-offset:-3px}
  #tsh-dialog[data-tsui-layout=frostbite] .tsh-settings-script{padding:12px;background:var(--tsui-surface);border-radius:var(--tsui-radius)}
  #tsh-dialog[data-tsui-layout=workbench]{display:grid;grid-template-columns:minmax(0,1fr) 160px;align-content:start}
  #tsh-dialog[data-tsui-layout=workbench]>:is(.tsh-header,.tsh-hub-nav){grid-column:1/-1}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-header{grid-row:1;min-height:52px;padding:10px 14px;background:var(--tsui-background);gap:10px}
  #tsh-dialog[data-tsui-layout=workbench] .tsui-theme-mark>.tsui-workbench-mark{display:block}
  #tsh-dialog[data-tsui-layout=workbench] .tsui-theme-mark{width:28px;height:28px}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-header h2{font-family:Consolas,"SFMono-Regular",monospace;font-size:14px;letter-spacing:-.04em}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav{grid-row:2;position:static;background:var(--tsui-background);padding:0 12px;gap:0}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav button{border-radius:var(--tsui-radius) var(--tsui-radius) 0 0;background:var(--tsui-background);border-bottom:0;border-top:2px solid var(--tsui-background);padding:10px 14px;font-size:12px;color:var(--tsui-muted)}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav button[aria-selected=true]{background:var(--tsui-surface);border-top-color:var(--tsui-accent)!important;border-left-color:var(--tsui-border)!important;border-right-color:var(--tsui-border)!important}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-toolbar{grid-column:1;grid-row:3}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-intro{grid-column:1;grid-row:4}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-grid{grid-column:1;grid-row:5}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-actions{grid-column:1;grid-row:6}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-status{grid-column:1;grid-row:7}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-settings-view{grid-column:1;grid-row:3/7;min-width:0}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-appearance-inspector{display:block;grid-column:2;grid-row:3/8;background:var(--tsui-background);padding:16px 12px;box-shadow:inset 3px 0 0 var(--tsui-raised)}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-appearance-inspector h4{font:600 11px Consolas,"SFMono-Regular",monospace;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--tsui-border);padding-bottom:10px;margin:0 0 10px}
  #tsh-dialog[data-tsui-layout=workbench]>.tsh-grid{grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:9px;padding:14px}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-tile{border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);background:var(--tsui-raised);overflow:hidden}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-primary{display:grid;grid-template-columns:26px minmax(0,1fr);align-content:center;gap:8px 10px;min-height:84px;padding:12px;text-align:left;border:0;border-radius:0;background:var(--tsui-surface);box-shadow:none}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-primary .tsh-icon{width:26px;height:26px;grid-row:1/3}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-primary .tsh-name{font-size:12px;font-weight:600}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-primary .tsh-state{grid-column:2;font:10px Consolas,"SFMono-Regular",monospace}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-tile-controls{gap:0;margin:0;border-top:1px solid var(--tsui-border)}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-tile-controls button{margin:0;border:0;border-radius:0;background:var(--tsui-raised)}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-tile-controls .tsh-pin{border-right:1px solid var(--tsui-border)}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-settings-script{background:var(--tsui-surface);border-left:3px solid var(--tsui-border);border-radius:var(--tsui-radius)}
  #tsh-dialog[data-tsui-layout=workbench] .tsh-settings-script:hover{border-left-color:var(--tsui-accent)}
  #tsh-dialog[data-tsui-layout=torn]{background:var(--tsui-background);box-shadow:inset 0 0 0 2px var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-header{min-height:44px;padding:6px 10px;gap:8px;border-top:2px solid var(--tsui-accent);border-bottom:1px solid var(--tsui-border);background:linear-gradient(var(--tsui-raised),var(--tsui-surface));box-shadow:inset 0 1px 0 var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=torn] .tsui-theme-mark>.tsui-torn-mark{display:block}
  #tsh-dialog[data-tsui-layout=torn] .tsui-theme-mark{width:24px;height:24px}
  #tsh-dialog[data-tsui-layout=torn] .tsh-header h2{font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:.035em;text-transform:uppercase}
  #tsh-dialog[data-tsui-layout=torn] .tsh-count{font-size:11px;font-variant-numeric:tabular-nums;padding:2px 6px;border:1px solid var(--tsui-border);background:var(--tsui-background);border-radius:var(--tsui-radius)}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-hub-nav{position:static;padding:4px 7px;gap:3px;background:var(--tsui-raised);box-shadow:inset 0 1px 0 var(--tsui-surface);border-bottom:1px solid var(--tsui-border)}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-hub-nav button{flex:1;padding:5px 8px;min-height:30px;border-radius:var(--tsui-radius);background:var(--tsui-surface);font-size:11px;font-weight:700}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-toolbar{padding:9px 10px 0}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-intro{margin:8px 10px 0;font-size:11px}
  #tsh-dialog[data-tsui-layout=torn]>.tsh-grid{grid-template-columns:minmax(0,1fr);gap:0;margin:10px;padding:0;border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);background:var(--tsui-surface);box-shadow:inset 0 0 0 2px var(--tsui-background)}
  #tsh-dialog[data-tsui-layout=torn] .tsh-tile{flex-direction:row;align-items:stretch;gap:0;border-bottom:1px solid var(--tsui-border);padding:2px}
  #tsh-dialog[data-tsui-layout=torn] .tsh-tile:last-child{border-bottom:0}
  #tsh-dialog[data-tsui-layout=torn] .tsh-tile:nth-child(even){background:var(--tsui-raised)}
  #tsh-dialog[data-tsui-layout=torn] .tsh-primary{flex:1;min-width:0;display:grid;grid-template-columns:22px minmax(0,1fr) auto;min-height:38px;gap:8px;align-content:center;padding:7px 9px;border:0;border-radius:var(--tsui-radius);background:none;box-shadow:none;text-align:left}
  #tsh-dialog[data-tsui-layout=torn] .tsh-primary .tsh-icon{width:22px;height:22px}
  #tsh-dialog[data-tsui-layout=torn] .tsh-primary .tsh-name{font-size:12px;font-weight:600}
  #tsh-dialog[data-tsui-layout=torn] .tsh-state{font-size:10px;white-space:nowrap}
  #tsh-dialog[data-tsui-layout=torn] .tsh-tile-controls{flex:none;margin:0;align-items:center;gap:3px;padding:0 4px;border-left:1px solid var(--tsui-border)}
  #tsh-dialog[data-tsui-layout=torn] .tsh-tile-controls button{margin:0;min-height:28px;background:var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=torn] .tsh-tile-controls .tsh-more{padding:5px 8px}
  #tsh-dialog[data-tsui-layout=torn] .tsh-empty{padding:10px}
  #tsh-dialog[data-tsui-layout=torn] :is(.tsh-settings-view,.tsh-actions){padding:10px}
  #tsh-dialog[data-tsui-layout=torn] :is(.tsh-settings-view>h3,.tsh-actions>h3,.tsh-form-section>h3,.tsh-form-section>legend){width:100%;padding:6px 8px;margin:0 0 8px;border:1px solid var(--tsui-border);background:linear-gradient(var(--tsui-raised),var(--tsui-surface));font-size:12px;box-shadow:inset 0 1px 0 var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=torn] .tsh-settings-script{min-height:40px;margin:0;padding:7px 9px;border-radius:var(--tsui-radius);background:var(--tsui-surface);box-shadow:inset 0 0 0 1px var(--tsui-background)}
  #tsh-dialog[data-tsui-layout=torn] .tsh-settings-script+.tsh-settings-script{border-top:0}
  #tsh-dialog[data-tsui-layout=torn] .tsh-settings-page{margin:0 0 4px;background:var(--tsui-surface);min-height:34px;padding:7px 9px}
  #tsh-dialog[data-tsui-layout=torn] .tsh-form-section{margin-top:10px;padding-bottom:10px;gap:9px}
  #tsh-dialog[data-tsui-density=compact] .tsh-theme-section{padding:10px 0}
  #tsh-dialog[data-tsui-density=compact] .tsh-theme-color{padding:6px}
  @media(min-width:601px) and (min-height:501px){
    #tsh-dialog[data-tsui-layout=frostbite][data-tsui-density=compact]>.tsh-grid{gap:8px;padding:12px}
    #tsh-dialog[data-tsui-layout=frostbite][data-tsui-density=compact] .tsh-primary{min-height:106px;padding:10px 6px;gap:7px}
    #tsh-dialog[data-tsui-layout=workbench][data-tsui-density=compact]>.tsh-grid{gap:6px;padding:10px}
    #tsh-dialog[data-tsui-layout=workbench][data-tsui-density=compact] .tsh-primary{min-height:68px;padding:9px}
    #tsh-dialog[data-tsui-layout=torn][data-tsui-density=compact] .tsh-primary{min-height:32px;padding:4px 7px}
  }
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
    #tsh-dialog[data-tsui-layout=frostbite]>.tsh-header{min-height:66px;padding:10px 12px}
    #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav{border-bottom:1px solid var(--tsui-border);gap:4px}
    #tsh-dialog[data-tsui-layout=frostbite]>.tsh-hub-nav button{justify-content:center;flex-wrap:wrap;gap:5px}
    #tsh-dialog[data-tsui-layout=frostbite]>.tsh-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px}
    #tsh-dialog[data-tsui-layout=frostbite] .tsh-primary{min-height:116px;padding:12px 6px 9px}
    #tsh-dialog[data-tsui-layout=workbench]>.tsh-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px}
    #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav{padding:4px 6px 0}
    #tsh-dialog[data-tsui-layout=workbench]>.tsh-hub-nav button{padding:8px 5px;gap:5px}
    #tsh-dialog[data-tsui-layout=workbench] .tsh-primary{min-height:88px;padding:10px;gap:6px 8px}
    #tsh-dialog[data-tsui-layout=torn]>.tsh-grid{grid-template-columns:minmax(0,1fr);gap:0}
    #tsh-dialog[data-tsui-layout=torn] .tsh-primary{grid-template-columns:22px minmax(0,1fr);min-height:44px;padding:7px}
    #tsh-dialog[data-tsui-layout=torn] .tsh-primary .tsh-state{grid-column:2;font-size:10px}
    #tsh-dialog[data-tsui-layout=torn] .tsh-tile-controls{padding:0 2px}
    #tsh-dialog[data-tsui-layout] :is(.tsh-hub-nav button,.tsh-tile-controls button,.tsh-settings-script,.tsh-settings-page){min-height:44px}
  }
  @media(pointer:coarse){#tsh-dialog[data-tsui-layout][data-tsui-density] :is(.tsh-hub-nav button,.tsh-primary,.tsh-tile-controls button,.tsh-settings-script,.tsh-settings-page){min-height:44px}}
  #tsh-dialog .tsh-theme-layouts{grid-template-columns:repeat(2,minmax(0,1fr))}
  #tsh-dialog .tsh-theme-stock-preset{margin-top:12px}
  #tsh-dialog [data-layout=stock] .tsh-theme-diagram{grid-template-columns:1fr;grid-template-rows:6px 1fr;border-radius:2px}
  #tsh-dialog[data-tsui-layout=stock]{display:block;font-family:Arial,Helvetica,sans-serif}
  #tsh-dialog[data-tsui-layout=stock] .tsui-theme-mark{display:none}
  #tsh-dialog[data-tsui-layout=stock]>.tsh-header{position:relative;padding:24px 10px 7px;gap:7px;background:var(--tsui-raised);min-height:58px}
  #tsh-dialog[data-tsui-layout=stock]>.tsh-header:before{content:'⠿ drag';position:absolute;left:0;right:0;top:0;height:18px;font:10px/18px Consolas,monospace;text-align:center;letter-spacing:2px;background:var(--tsui-selection);color:var(--tsui-muted);border-bottom:1px solid var(--tsui-border)}
  #tsh-dialog[data-tsui-layout=stock] .tsh-header h2{font-size:13px;color:var(--tsui-accent);letter-spacing:0}
  #tsh-dialog[data-tsui-layout=stock] .tsh-count{font-size:10px;color:var(--tsui-muted)}
  #tsh-dialog[data-tsui-layout=stock] .tsh-window-button{font-size:0;width:30px;padding:4px;min-height:30px}
  #tsh-dialog[data-tsui-layout=stock] .tsh-window-lock:before{content:'◇';font-size:16px}#tsh-dialog[data-tsui-layout=stock] .tsh-window-reset:before{content:'↺';font-size:16px}
  #tsh-dialog[data-tsui-layout=stock]>.tsh-hub-nav{position:static;padding:0 10px;gap:14px;background:var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=stock]>.tsh-hub-nav button{border:0!important;border-bottom:2px solid transparent!important;border-radius:0;padding:9px 2px;color:var(--tsui-muted);background:transparent;font-size:12px}
  #tsh-dialog[data-tsui-layout=stock]>.tsh-hub-nav button[aria-selected=true]{border-bottom-color:var(--tsui-accent)!important;color:var(--tsui-accent);background:transparent}
  #tsh-dialog[data-tsui-layout=stock]>.tsh-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;padding:12px}
  #tsh-dialog[data-tsui-layout=stock] .tsh-tile{border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);overflow:hidden;background:var(--tsui-surface)}
  #tsh-dialog[data-tsui-layout=stock] .tsh-primary{min-height:70px;padding:10px;border:0;display:grid;grid-template-columns:20px minmax(0,1fr);gap:5px 8px;text-align:left;align-content:center;background:transparent;box-shadow:none}
  #tsh-dialog[data-tsui-layout=stock] .tsh-primary .tsh-icon{width:20px;height:20px;grid-row:1/3}
  #tsh-dialog[data-tsui-layout=stock] .tsh-name{font-size:12px;font-weight:600}#tsh-dialog[data-tsui-layout=stock] .tsh-state{grid-column:2;font-size:10px}
  #tsh-dialog[data-tsui-layout=stock] .tsh-tile-controls{margin:0;gap:0;border-top:1px solid var(--tsui-border)}
  #tsh-dialog[data-tsui-layout=stock] .tsh-tile-controls button{margin:0;border:0;border-radius:0;background:var(--tsui-background)}
  #tsh-dialog[data-tsui-layout=stock] :is(.tsh-settings-view,.tsh-actions){padding:12px}
  #tsh-dialog[data-tsui-layout=stock] .tsh-settings-script{padding:9px;border-radius:var(--tsui-radius);background:var(--tsui-surface)}
  @media(max-width:600px),(max-height:500px){#tsh-dialog[data-tsui-layout=stock]>.tsh-header{padding-top:8px;min-height:52px}#tsh-dialog[data-tsui-layout=stock]>.tsh-header:before{display:none}#tsh-dialog[data-tsui-layout=stock] .tsh-window-button{width:44px;min-height:44px}#tsh-dialog[data-tsui-layout=stock]>.tsh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#tsh-dialog[data-tsui-layout=stock]>.tsh-hub-nav{gap:5px;padding:0 7px}#tsh-dialog[data-tsui-layout=stock]>.tsh-hub-nav button{padding:8px 4px;min-height:44px;gap:4px}}
  @media(prefers-reduced-motion:reduce){#tsh-dialog[data-tsui-layout] *{scroll-behavior:auto;transition:none}}
  `;
}
module.exports = { hubThemeStyles };
