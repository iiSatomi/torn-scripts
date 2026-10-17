function warContractsStyles(){return `
.wch-root.tsui-root{font-size:calc(13px * var(--tsui-font-scale,1))}
.wch-root.tsui-root .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr) auto auto;overflow:hidden}
.wch-root.tsui-root .tsui-header{padding:5px 10px;min-height:40px;flex-wrap:nowrap;gap:6px}
.wch-root.tsui-root .tsui-theme-mark,.wch-root.tsui-root .tsui-drag-strip{display:none}
.wch-root.tsui-root .tsui-title{font-size:1em;min-width:0;padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wch-root.tsui-root .tsui-controls{width:auto;flex:none;flex-wrap:nowrap;overflow:visible;gap:4px}
.wch-root.tsui-root .tsui-header-actions{display:flex;gap:4px}
.wch-root.tsui-root .tsui-controls>button,.wch-root.tsui-root .tsui-header-actions>button{min-height:30px;min-width:30px;width:auto;padding:4px 7px;font-size:12px}
.wch-root.tsui-root .tsui-window-options-toggle{display:block}
.wch-root.tsui-root .tsui-controls>[aria-label="Collapse or expand"]{font-size:0}
.wch-root.tsui-root .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▴';font-size:16px}
.wch-root.tsui-root[data-tsui-collapsed=true] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▾'}
.wch-root.tsui-root .tsui-window-options{display:none;position:absolute;right:8px;top:calc(100% + 3px);z-index:5;width:180px;max-height:min(260px,60dvh);overflow:auto;padding:6px;background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:5px;box-shadow:0 6px 20px #0005}
.wch-root.tsui-root .tsui-window-options[data-open=true]{display:flex;flex-direction:column;gap:4px}
.wch-root.tsui-root .tsui-window-options button{text-align:left}
.wch-root.tsui-root .wch-context{grid-row:1;grid-column:1;margin:0;padding:7px 12px;border-bottom:1px solid var(--tsui-border);color:var(--tsui-muted);font-size:12px;overflow-wrap:anywhere}
.wch-root.tsui-root .tsui-nav{grid-row:2;grid-column:1;flex-direction:row;gap:0;flex-wrap:nowrap;padding:0 10px;border-right:0;border-bottom:1px solid var(--tsui-border);background:var(--tsui-surface)}
.wch-root.tsui-root .tsui-nav button{flex:none;padding:8px 12px;min-height:36px;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--tsui-muted)}
.wch-root.tsui-root .tsui-nav button[aria-current=page]{color:var(--tsui-accent);border-bottom-color:var(--tsui-accent)}
.wch-root.tsui-root .tsui-nav [data-tsui-header-action=true]{display:none}
.wch-root.tsui-root .tsui-content{grid-column:1;grid-row:3;padding:12px;overflow:auto}
.wch-root.tsui-root .tsui-settings,.wch-root.tsui-root .tsui-inspector{display:none}
.wch-root.tsui-root .wch-page{gap:10px;max-width:none}
.wch-root.tsui-root .wch-page h2{font-size:16px}.wch-root.tsui-root .wch-page h3{font-size:14px}
.wch-root.tsui-root button,.wch-root.tsui-root input,.wch-root.tsui-root select{min-height:32px}
.wch-root.tsui-root input,.wch-root.tsui-root select,.wch-root.tsui-root textarea{font-size:13px;padding:6px 8px}
.wch-root.tsui-root textarea{min-height:80px}
.wch-root.tsui-root .wch-field{gap:4px;font-size:12px}
.wch-root.tsui-root .wch-toolbar,.wch-root.tsui-root .wch-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.wch-root.tsui-root .wch-toolbar>.wch-field{flex:1;max-width:330px;min-width:140px}
.wch-root.tsui-root .wch-actions{justify-content:flex-start}
.wch-root.tsui-root .wch-form{gap:10px}.wch-root.tsui-root .wch-grid{gap:10px}
.wch-root.tsui-root .wch-note{padding:8px 10px}
.wch-root.tsui-root .wch-loadout{padding:0 8px}.wch-root.tsui-root .wch-loadout p{padding-bottom:10px}
.wch-root.tsui-root summary{min-height:32px;font-weight:400}
.wch-root.tsui-root .wch-match-table{width:100%;table-layout:fixed;border-collapse:collapse;background:var(--tsui-surface)}
.wch-root.tsui-root .wch-match-table th,.wch-root.tsui-root .wch-match-table td{padding:5px 8px;border-bottom:1px solid var(--tsui-border);text-align:left;overflow-wrap:anywhere}
.wch-root.tsui-root .wch-match-table th{font-size:11px;font-weight:400;color:var(--tsui-muted)}
.wch-root.tsui-root .wch-match-table th:first-child{width:34%}.wch-root.tsui-root .wch-match-table th:last-child{width:90px}
.wch-root.tsui-root .wch-match-table td:last-child{text-align:right}
.wch-root.tsui-root tr.wch-match{display:table-row;padding:0;border:0;background:transparent}
.wch-root.tsui-root input[type=checkbox]{min-height:20px;width:20px;padding:0}
.wch-root.tsui-root .wch-match-table tr[data-selected=true] td{background:var(--tsui-selection)}
.wch-root.tsui-root .wch-match-table a{color:var(--tsui-accent);font-weight:600;text-decoration:none}
.wch-root.tsui-root .wch-level{color:var(--tsui-muted);font-size:11px;margin-left:6px;white-space:nowrap}
.wch-root.tsui-root .wch-number{font-variant-numeric:tabular-nums}
.wch-root.tsui-root .wch-match-detail{border:1px solid var(--tsui-border);border-radius:5px;background:var(--tsui-surface);padding:10px}
.wch-root.tsui-root .wch-match-detail>.wch-row{justify-content:space-between;gap:8px}
.wch-root.tsui-root .wch-match-detail a{color:var(--tsui-accent);font-weight:600}
.wch-root.tsui-root .wch-match-detail details{border:0;padding:0}
.wch-root.tsui-root .wch-match-detail summary{font-size:12px;color:var(--tsui-accent)}
.wch-root.tsui-root .wch-list{gap:0}
.wch-root.tsui-root .wch-match-table+.wch-match-detail{margin-top:10px}
.wch-root.tsui-root .wch-list>p{margin-bottom:8px}
.wch-root.tsui-root details.wch-contract{padding:0 8px;border:0;border-bottom:1px solid var(--tsui-border);border-radius:0;background:var(--tsui-surface);display:block}
.wch-root.tsui-root .wch-contract>summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;list-style:none;min-height:47px;padding:8px 0}
.wch-root.tsui-root .wch-contract>summary::-webkit-details-marker{display:none}
.wch-root.tsui-root .wch-contract>summary:after{content:'▸';color:var(--tsui-muted)}
.wch-root.tsui-root .wch-contract[open]>summary:after{content:'▾'}
.wch-root.tsui-root .wch-contract-pair{flex:1;min-width:100px;color:var(--tsui-accent);font-weight:600;overflow-wrap:anywhere}
.wch-root.tsui-root .wch-contract>p,.wch-root.tsui-root .wch-contract>.wch-row{padding-bottom:8px}
.wch-root.tsui-root .wch-tag{font-size:11px;padding:2px 5px;border:0;color:var(--tsui-muted)}
.wch-root.tsui-root .wch-summary{line-height:1.5}.wch-root.tsui-root .wch-status{padding:7px 12px;font-size:12px}
.wch-root.tsui-root .wch-connection-state,.wch-root.tsui-root .wch-war{padding:10px;gap:5px}
.wch-root.tsui-root .wch-war-fields{gap:8px}
@media(max-width:600px),(pointer:coarse){
 .wch-root.tsui-root .tsui-header{padding:5px 8px}
 .wch-root.tsui-root .tsui-controls>button,.wch-root.tsui-root .tsui-header-actions>button{min-width:44px;min-height:44px;padding:4px}
 .wch-root.tsui-root .tsui-nav button{flex:1;padding:8px;min-height:44px}
 .wch-root.tsui-root .tsui-content{padding:10px;overflow:auto}
 .wch-root.tsui-root button,.wch-root.tsui-root input,.wch-root.tsui-root select,.wch-root.tsui-root summary{min-height:44px}
 .wch-root.tsui-root input,.wch-root.tsui-root select,.wch-root.tsui-root textarea{font-size:16px}
 .wch-root.tsui-root .wch-fit-col{display:none}
 .wch-root.tsui-root .wch-match-table th:first-child{width:42%}
 .wch-root.tsui-root .wch-match-table th:last-child{width:82px}
 .wch-root.tsui-root .wch-match-table th,.wch-root.tsui-root .wch-match-table td{padding:5px}
 .wch-root.tsui-root .wch-level{display:block;margin-left:0}
 .wch-root.tsui-root .wch-match-detail>.wch-row>button{white-space:normal}
 .wch-root.tsui-root .wch-contract>summary{gap:4px 8px}
 .wch-root.tsui-root .wch-contract-pair{min-width:calc(100% - 24px)}
 .wch-root.tsui-root .wch-contract>summary:after{margin-left:auto}
}
.wch-root .wch-page{display:flex;flex-direction:column;min-width:0;margin:auto}
.wch-root .wch-page p{margin:0;line-height:1.5}.wch-root .wch-page h2,.wch-root .wch-page h3{margin:0}
.wch-root .wch-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.wch-root .wch-row>*{min-width:0}
.wch-root .wch-field{display:flex;flex-direction:column;min-width:0}
.wch-root input,.wch-root select,.wch-root textarea{max-width:100%;width:100%;border:1px solid var(--tsui-border);border-radius:5px;background:var(--tsui-input,var(--tsui-surface));color:var(--tsui-text);box-sizing:border-box;font:inherit}
.wch-root textarea{resize:vertical}.wch-root input[type=checkbox]{accent-color:var(--tsui-accent);flex:none}
.wch-root .wch-check{flex-direction:row;align-items:flex-start;line-height:1.5}
.wch-root .wch-note{background:var(--tsui-raised);border:1px solid var(--tsui-border);border-radius:5px;line-height:1.5}
.wch-root .wch-muted{font-size:12px;color:var(--tsui-muted)}.wch-root .wch-contract a{color:var(--tsui-accent)}
.wch-root .wch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.wch-root .wch-list,.wch-root .wch-form{display:flex;flex-direction:column}
.wch-root .wch-connection-state,.wch-root .wch-war{border:1px solid var(--tsui-border);border-radius:5px;display:flex;flex-direction:column;background:var(--tsui-raised)}
.wch-root .wch-connection-state{border-left:3px solid var(--tsui-accent)}
.wch-root .wch-war-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:6px 0 0}.wch-root .wch-war-fields dt{font-size:12px;color:var(--tsui-muted)}.wch-root .wch-war-fields dd{margin:4px 0 0;font-weight:600;overflow-wrap:anywhere}
.wch-root details{border:1px solid var(--tsui-border);border-radius:5px;padding:0 10px}.wch-root summary{align-content:center;cursor:pointer}
.wch-root details[open]>.wch-form,.wch-root .wch-privacy p{padding:8px 0 12px}.wch-root .wch-privacy{font-size:12px;color:var(--tsui-muted)}
.wch-root .wch-summary{white-space:pre-wrap;overflow-wrap:anywhere}.wch-root .wch-status{margin:0;border-top:1px solid var(--tsui-border);background:var(--tsui-surface);line-height:1.5;overflow-wrap:anywhere}
.wch-root [data-error=true]{color:var(--tsui-error)}.wch-root [hidden]{display:none!important}.wch-root button:disabled{cursor:default;opacity:.55}
@media(max-width:600px){.wch-root .wch-grid,.wch-root .wch-war-fields{grid-template-columns:1fr}}
`;}
