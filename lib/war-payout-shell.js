// Payout-specific composition. Window behavior belongs to the shared UI factory;
// calculation fields and reviewed credit operations remain owned by the script.
function mountWarPayoutShell({staging,themeClient,onClose,onSelect,onVisibilityChange,onDestroy,readLayout,writeLayout}) {
  const doc=staging.ownerDocument,win=doc.defaultView,$=id=>staging.querySelector('#twpc-'+id);
  const make=(tag,text)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
  const details=(title,...children)=>{const element=make('details');element.append(make('summary',title),...children.filter(Boolean));return element;};
  const calculator=$('calculator-panel'),credits=$('credit-panel'),raffle=$('raffle-panel'),settings=make('div');
  settings.id='twpc-settings-panel';settings.className='twpc-settings';
  const rates=$('rate-hits').closest('section'),connection=$('connection');
  settings.append(connection,rates.querySelector('details'),$('remember-rates'));
  connection.open=true;
  settings.append(details('How payouts work',make('p','Only attacks against the selected enemy count. Loss pay is for enemy attacks that defeat your members. Review available-log counts before paying.')));
  settings.append(details('Draft and export notes',$('table-note')));
  const warSection=$('war').closest('section');
  const warDetails=details('War details',$('coverage'));warDetails.id='twpc-war-details';warDetails.querySelector('summary').id='twpc-war-counts';warSection.append(warDetails);
  $('list-wars').textContent='Sync wars';$('load').textContent='Refresh';$('load').title='Scan this war again. Saved counts are replaced only after a successful scan.';
  const stockFooter=make('div');stockFooter.className='twpc-stock-footer';
  const stockTotals=make('div');stockTotals.className='twpc-stock-totals';
  const stockActions=make('div');stockActions.className='twpc-stock-actions';
  const review=make('button','Review payouts →');review.id='twpc-review';review.type='button';review.className='twpc-primary';
  stockActions.append(review);stockFooter.append(stockTotals,stockActions);
  const movable=[$('total').parentElement,$('balance').parentElement,$('csv'),$('copy')].map(node=>{const home=doc.createComment('payout control home');node.before(home);return {node,home};});
  let stockMode=null,releaseTheme=null;
  function syncStockLayout(theme){
    const stock=theme?.layout==='stock';if(stockMode===stock)return;stockMode=stock;
    movable.forEach(({node,home},index)=>{if(stock)(index<2?stockTotals:stockActions).append(node);else home.after(node);});
    if(stock)stockActions.append(review);
  }
  const ui=createTornScriptUI({doc,win,id:'war-payout-calculator',title:'War payout calculator',surface:'floating',applyTheme:applyScriptUiTheme,
    themeClient,ownsThemeClient:false,readLayout,writeLayout,onSelect,onClose,onVisibilityChange,onDestroy(){releaseTheme?.();onDestroy?.();},
    sections:[{id:'calculator',label:'Calculate',node:calculator,footer:stockFooter},{id:'credits',label:'Pay members',node:credits},{id:'settings',label:'Settings',node:settings,headerAction:'⚙'},{id:'raffle',label:'Raffle',node:raffle}],
  });
  review.addEventListener('click',()=>ui.select('credits'));
  syncStockLayout(themeClient?.get?.());
  if(themeClient?.subscribe)releaseTheme=themeClient.subscribe(syncStockLayout);
  const root=ui.root;root.id='twpc-dialog';
  const navButtons=Array.from(ui.nav.children);
  for(const [index,id]of ['twpc-tab-calculator','twpc-tab-credits','twpc-settings-toggle','twpc-tab-raffle'].entries()){
    navButtons[index].id=id;
    const page=ui.content.children[index];page.id='twpc-page-'+index;navButtons[index].setAttribute('aria-controls',page.id);
  }
  root.querySelector('[aria-label="Collapse or expand"]').id='twpc-collapse';
  root.querySelector('[aria-label="Close window"]').id='twpc-close';
  staging.remove();
  return {ui,root,showSettings(){ui.select('settings');connection.open=true;}};
}

function warPayoutShellCss(){return `
#twpc-dialog{--twpc-bg:var(--tsui-background);--twpc-surface:var(--tsui-surface);--twpc-line:var(--tsui-border);--twpc-accent:var(--tsui-accent);--twpc-text:var(--tsui-text);--twpc-muted:var(--tsui-muted)}
#twpc-dialog .tsui-title{font-size:15px}#twpc-dialog:not([data-tsui-layout=stock]) .tsui-controls button{padding:5px 7px;font-size:12px}#twpc-dialog .tsui-content{container-type:inline-size}
#twpc-dialog .twpc-content{padding:0}#twpc-dialog .twpc-content>section,#twpc-dialog #twpc-credit-panel>section{padding:14px;background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);margin-bottom:12px}
#twpc-dialog h3{font-size:12px;letter-spacing:.7px;text-transform:uppercase;color:var(--tsui-accent);margin:0 0 12px}#twpc-dialog p{color:var(--tsui-muted);font-size:.92em;margin:8px 0;overflow-wrap:anywhere}
#twpc-dialog label{display:flex;flex-direction:column;gap:6px;font-size:.92em;color:var(--tsui-text);min-width:0}#twpc-dialog input,#twpc-dialog select{width:100%;min-width:0;min-height:38px;font-variant-numeric:tabular-nums}
#twpc-dialog input[type=checkbox]{width:20px;min-height:20px;flex:none;accent-color:var(--tsui-accent)}#twpc-dialog .twpc-checkbox{flex-direction:row;align-items:center;gap:8px;margin:12px 0}
#twpc-dialog .twpc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}#twpc-dialog .twpc-two{grid-template-columns:repeat(2,minmax(0,1fr))}#twpc-dialog .twpc-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
#twpc-dialog .twpc-primary{background:var(--tsui-accent);color:var(--tsui-on-accent);border-color:var(--tsui-accent)}#twpc-dialog button:disabled{opacity:.5;cursor:default}
#twpc-dialog details{border-top:1px solid var(--tsui-border);padding:10px 0}#twpc-dialog summary{cursor:pointer;color:var(--tsui-accent);min-height:32px;display:list-item;font-weight:600}#twpc-dialog details .twpc-grid{margin-top:10px}
#twpc-dialog .twpc-summary{background:var(--tsui-raised);border:1px solid var(--tsui-border);border-left:3px solid var(--tsui-accent);border-radius:var(--tsui-radius);padding:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}
#twpc-dialog .twpc-summary small{display:block;color:var(--tsui-muted)}#twpc-dialog .twpc-summary strong{color:var(--tsui-accent);font-size:20px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}#twpc-dialog #twpc-balance{color:var(--tsui-success)}
#twpc-dialog .twpc-rate-box{background:var(--tsui-raised);border-left:3px solid var(--tsui-accent);padding:12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}#twpc-dialog #twpc-est-rate{font-size:26px;font-weight:bold;color:var(--tsui-accent)}
#twpc-dialog .twpc-cache-row{display:grid;grid-template-columns:2fr 1fr 2fr auto;gap:8px;align-items:end;margin:8px 0}#twpc-dialog .twpc-cache-state{padding:8px;border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);color:var(--tsui-accent)}#twpc-dialog .twpc-cache-state.twpc-live{color:var(--tsui-warning)}
#twpc-dialog .twpc-table-scroll{max-width:100%;max-height:320px;overflow:auto;border:1px solid var(--tsui-border);border-radius:var(--tsui-radius)}#twpc-dialog table{font-variant-numeric:tabular-nums}#twpc-dialog th,#twpc-dialog td{white-space:nowrap;text-align:right;font-size:12px;padding:9px}#twpc-dialog th:first-child,#twpc-dialog td:first-child{text-align:left}#twpc-dialog th{position:sticky;top:0;background:var(--tsui-raised);color:var(--tsui-muted)}#twpc-dialog tbody tr:nth-child(even){background:var(--tsui-raised)}#twpc-dialog .twpc-pay{color:var(--tsui-accent);font-weight:bold}
#twpc-dialog .twpc-warning,#twpc-dialog #twpc-balance.twpc-warning,#twpc-dialog #twpc-validation{color:var(--tsui-error)}#twpc-dialog #twpc-validation:empty,#twpc-dialog #twpc-status:empty{display:none}#twpc-dialog #twpc-credit-summary{color:var(--tsui-accent)}#twpc-dialog #twpc-credit-next{white-space:normal}
#twpc-dialog .twpc-raffle-results{padding-left:26px;margin:12px 0}#twpc-dialog .twpc-raffle-results li{padding:8px 4px;color:var(--tsui-muted);overflow-wrap:anywhere}#twpc-dialog .twpc-raffle-results strong{color:var(--tsui-accent)}#twpc-dialog #twpc-raffle-summary{font-weight:bold;color:var(--tsui-accent)}#twpc-dialog #twpc-raffle-draw{flex:1;min-width:130px}
@container(max-width:500px){#twpc-dialog .twpc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#twpc-dialog .twpc-cache-row{grid-template-columns:1fr 1fr}#twpc-dialog .twpc-cache-row label:first-child{grid-column:1/-1}}
@media(max-width:600px){#twpc-dialog input,#twpc-dialog select{font-size:16px;min-height:44px}#twpc-dialog summary{min-height:44px}#twpc-dialog .twpc-content>section,#twpc-dialog #twpc-credit-panel>section{padding:10px}#twpc-dialog .twpc-grid{gap:8px}}
#twpc-dialog:not([data-tsui-layout=stock]) .tsui-section-footers{display:none}
#twpc-dialog[data-tsui-layout=stock] .tsui-title{font-size:13px}
#twpc-dialog[data-tsui-layout=stock] .twpc-content>section,#twpc-dialog[data-tsui-layout=stock] #twpc-credit-panel>section{border:0;border-bottom:1px solid var(--tsui-border);border-radius:0;background:transparent;padding:0 0 12px;margin:0 0 12px}
#twpc-dialog[data-tsui-layout=stock] h3{font-size:10px;letter-spacing:1.2px;color:var(--tsui-muted);margin-bottom:10px}
#twpc-dialog[data-tsui-layout=stock] label{font-size:11px;gap:5px}
#twpc-dialog[data-tsui-layout=stock] input,#twpc-dialog[data-tsui-layout=stock] select{font-size:13px;min-height:36px;padding:7px}
#twpc-dialog[data-tsui-layout=stock] .twpc-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
#twpc-dialog[data-tsui-layout=stock] .twpc-actions{gap:6px;margin:8px 0}
#twpc-dialog[data-tsui-layout=stock] p{font-size:11px;line-height:1.5}
#twpc-dialog[data-tsui-layout=stock] summary{font-size:11px;min-height:28px;font-weight:400}
#twpc-dialog[data-tsui-layout=stock] .twpc-summary{padding:9px 10px;margin:10px 0;border-left:2px solid var(--tsui-success);background:var(--tsui-surface);grid-template-columns:1fr}
#twpc-dialog[data-tsui-layout=stock] .twpc-summary>div:has(#twpc-summary-profit),#twpc-dialog[data-tsui-layout=stock] .twpc-summary>div:has(#twpc-summary-cut){display:none}
#twpc-dialog[data-tsui-layout=stock] .twpc-summary>div:has(#twpc-pool){display:flex;justify-content:space-between;align-items:center;gap:10px}
#twpc-dialog[data-tsui-layout=stock] #twpc-pool{font:13px Consolas,monospace;color:var(--tsui-success)}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-totals{display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:10px}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-totals small{display:block;color:var(--tsui-muted);font-size:10px;margin-bottom:4px}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-totals strong{font:21px/1.2 Consolas,monospace;color:var(--tsui-accent);overflow-wrap:anywhere}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-totals>div:last-child{text-align:right}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-totals>div:last-child strong{font-size:16px}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-actions{display:flex;flex-wrap:wrap;gap:6px}
#twpc-dialog[data-tsui-layout=stock] .twpc-stock-actions button{font-size:11px;padding:6px;min-height:36px}
#twpc-dialog[data-tsui-layout=stock] #twpc-review{flex:1}
#twpc-dialog[data-tsui-layout=stock] #twpc-csv{font-size:0}#twpc-dialog[data-tsui-layout=stock] #twpc-csv:after{content:'Export';font-size:11px}
#twpc-dialog[data-tsui-layout=stock] #twpc-copy{font-size:0}#twpc-dialog[data-tsui-layout=stock] #twpc-copy:after{content:'Copy';font-size:11px}
#twpc-dialog[data-tsui-layout=stock] th,#twpc-dialog[data-tsui-layout=stock] td{font-size:11px;padding:9px 6px}
@media(max-width:600px),(pointer:coarse){#twpc-dialog[data-tsui-layout=stock] input,#twpc-dialog[data-tsui-layout=stock] select{font-size:16px;min-height:44px}#twpc-dialog[data-tsui-layout=stock] summary,#twpc-dialog[data-tsui-layout=stock] .twpc-stock-actions button{min-height:44px}#twpc-dialog[data-tsui-layout=stock] .twpc-stock-totals strong{font-size:23px}}
`;}
