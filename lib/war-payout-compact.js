// Compact Frostbite presentation. Existing inputs/actions retain
// their IDs and handlers; this module performs no API or gameplay operations.
function mountWarPayoutCompactPanel({dialog,style,onCollapse,onExpand,onClose}){
  const doc=dialog.ownerDocument,win=doc.defaultView,$=id=>dialog.querySelector('#twpc-'+id);
  const make=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const label=(id,text)=>{const e=$(id)?.labels?.[0];if(e?.firstChild?.nodeType===3)e.firstChild.textContent=text;};
  const details=(title,...children)=>{const e=make('details');e.append(make('summary',title),...children.filter(Boolean));return e;};
  style.textContent+=`
  #twpc-dialog{--twpc-bg:#08121b;--twpc-surface:#0a1620;--twpc-line:#29475c;--twpc-accent:#55b7ff;--twpc-text:#edf4fb;--twpc-muted:#99aab8;color:var(--twpc-text);background:linear-gradient(165deg,#0b1d2b,#08121b 35%);border:1px solid var(--twpc-line);border-radius:9px;position:fixed;inset:72px 20px auto auto;margin:0;width:min(340px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 84px);overflow:hidden;z-index:2147483000;font:12px/1.4 Arial,sans-serif;box-shadow:0 12px 34px #0009,0 0 0 1px #071018}
  #twpc-dialog .twpc-drag{height:18px;background:#102b3d;color:#8baec5;text-align:center;letter-spacing:3px;font-size:9px;cursor:move;touch-action:none;user-select:none;border-bottom:1px solid #29475c}
  #twpc-dialog header{position:static;padding:9px 10px;gap:6px;background:linear-gradient(120deg,#071019,#0a1d2b);border-bottom:1px solid var(--twpc-line);min-height:48px}
  #twpc-dialog h2{font-size:13px;color:#f0f7ff;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap}
  #twpc-dialog .twpc-brand{display:flex;align-items:center;gap:8px;min-width:0}
  #twpc-dialog .twpc-brand-mark{width:28px;height:28px;display:grid;place-items:center;border:1px solid #315c79;border-radius:5px;color:#8ad5ff;background:#0c2334;font-size:21px;line-height:1;flex:none}
  #twpc-dialog .twpc-brand-subtitle{color:#8ad5ff;font-size:8px;font-weight:700;letter-spacing:2px;line-height:1.4}
  #twpc-dialog header .twpc-toolbar{display:flex;gap:5px;margin-left:auto}
  #twpc-dialog header button{min-width:30px;min-height:28px;padding:2px 5px;font-size:14px}
  #twpc-dialog .twpc-window-body{max-height:min(720px,calc(100dvh - 158px));overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#315570 #08121b}
  #twpc-dialog .twpc-tabs{position:static!important;padding:9px 10px!important;background:transparent!important;gap:6px!important;margin:0!important;display:flex}
  #twpc-dialog .twpc-tabs button{flex:1;padding:5px 8px;background:#09131c;color:var(--twpc-muted);border-color:#243d50}
  #twpc-dialog .twpc-tabs button[aria-selected=true]{background:#10334f;color:#c8eaff;border-color:#387cad;box-shadow:inset 0 -2px #55b7ff}
  #twpc-dialog .twpc-content{padding:0 10px 10px}
  #twpc-dialog section{margin:0 0 8px;padding:9px;background:var(--twpc-surface);border:1px solid #233e52;border-radius:6px}#twpc-dialog section>h3{display:none}
  #twpc-dialog .twpc-section-title{color:#b8d8ee;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px;display:flex;justify-content:space-between;align-items:center}
  #twpc-dialog .twpc-section-title small{color:#80adc9;font-size:8px;letter-spacing:.5px}
  #twpc-dialog label{font-size:11px;gap:4px;font-weight:400;color:#aabccc}
  #twpc-dialog input,#twpc-dialog select,#twpc-dialog button{font:inherit;min-height:32px;border-radius:4px;border-color:var(--twpc-line)}
  #twpc-dialog input,#twpc-dialog select{background:#050d13;color:var(--twpc-text);padding:6px 8px;box-shadow:inset 0 1px 2px #0004}
  #twpc-dialog button{padding:5px 8px;background:#09131c;color:#a9d9fb;font-weight:600}
  #twpc-dialog button.twpc-primary{background:linear-gradient(#174c7c,#10355a);color:#e3f3ff;border-color:#2d7fc3}
  #twpc-dialog button:hover:not(:disabled){border-color:#55b7ff;filter:brightness(1.12)}
  #twpc-dialog button:disabled{opacity:.5}#twpc-dialog :focus-visible{outline:2px solid var(--twpc-accent);outline-offset:2px}
  #twpc-dialog .twpc-grid,#twpc-dialog .twpc-grid.twpc-two{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#twpc-dialog .twpc-grid+.twpc-grid{margin-top:8px}
  #twpc-dialog .twpc-mode-row.twpc-planning{grid-template-columns:1fr}
  #twpc-dialog .twpc-actions{gap:6px;margin-top:6px}#twpc-dialog .twpc-actions button{flex:1}
  #twpc-dialog p{font-size:11px;color:var(--twpc-muted);margin:5px 0}
  #twpc-dialog details{border-top:1px solid #233e52;padding:6px 0}#twpc-dialog summary{font-size:11px;min-height:24px;color:#8ad5ff}
  #twpc-dialog .twpc-checkbox{font-size:11px;gap:7px;margin-top:5px}#twpc-dialog input[type=checkbox]{width:17px;min-height:17px;flex:none;accent-color:#55b7ff}
  #twpc-dialog .twpc-settings{padding:8px 12px;background:#091722;border-bottom:1px solid var(--twpc-line);margin-bottom:9px}
  #twpc-dialog .twpc-settings details:first-child{border-top:0}#twpc-dialog #twpc-status{color:var(--twpc-muted)!important;font-size:10px;font-weight:400!important;line-height:1.45}
  #twpc-dialog #twpc-status:empty{display:none}
  #twpc-dialog .twpc-cache-state{color:#8ad5ff;font-size:10px;padding:5px 7px;background:#0c2538;border:1px solid #244c69;border-radius:4px;font-variant-numeric:tabular-nums}
  #twpc-dialog .twpc-cache-state.twpc-live{color:#e8c276;background:#211e15;border-color:#615235}
  #twpc-dialog .twpc-summary{margin:10px 0 6px;padding:11px;background:linear-gradient(110deg,#102c42,#0a1c2a);border:1px solid #315570;border-left:3px solid #55b7ff;border-radius:6px;grid-template-columns:1.2fr 1fr;gap:8px}
  #twpc-dialog .twpc-summary small{color:#a7c5da;font-size:10px}#twpc-dialog .twpc-summary strong{font-size:19px;color:#8ad5ff;letter-spacing:-.5px}#twpc-dialog .twpc-summary #twpc-balance{color:#51d96a;font-size:16px}
  #twpc-dialog th,#twpc-dialog td{padding:7px 5px;font-size:11px;color:var(--twpc-text);border-color:#233e52}#twpc-dialog th{background:#102536;color:#8db9d7;font-size:10px;position:sticky;top:0}
  #twpc-dialog td small{color:#99aab8}#twpc-dialog tbody tr:nth-child(even){background:#0c1c29}#twpc-dialog .twpc-pay{color:#8ad5ff}
  #twpc-dialog #twpc-players td:first-child{max-width:105px;overflow:hidden;text-overflow:ellipsis}#twpc-dialog .twpc-table-scroll{max-height:240px;overflow:auto;border-color:#29475c;background:#08121b}
  #twpc-dialog .twpc-rate-box{padding:9px;background:#0d2436;border-color:#55b7ff;gap:6px;border-radius:4px}#twpc-dialog #twpc-est-rate{font-size:22px;color:#8ad5ff}
  #twpc-dialog .twpc-warning,#twpc-dialog #twpc-validation,#twpc-dialog .twpc-summary #twpc-balance.twpc-warning{color:#ff6c77!important}
  #twpc-dialog #twpc-credit-note{color:#b5cfe1}#twpc-dialog #twpc-credit-summary{color:#8ad5ff;padding:5px 0;font-variant-numeric:tabular-nums}
  #twpc-dialog #twpc-credit-next,#twpc-dialog #twpc-credit-lock{width:100%;white-space:normal}
  #twpc-dialog #twpc-credit-members thead{display:none}#twpc-dialog #twpc-credit-members tbody{display:block}
  #twpc-dialog #twpc-credit-members tr{display:grid;grid-template-columns:1fr 1fr;padding:10px 8px;border-bottom:1px solid #29475c;gap:5px;background:#0a1620}
  #twpc-dialog #twpc-credit-members td{padding:0;border:0;white-space:normal;text-align:left}
  #twpc-dialog #twpc-credit-members td:nth-child(1){grid-column:1/-1;grid-row:1;color:#edf4fb;font-weight:600;overflow-wrap:anywhere}
  #twpc-dialog #twpc-credit-members td:nth-child(2){grid-row:3;color:var(--twpc-muted)}#twpc-dialog #twpc-credit-members td:nth-child(2)::before{content:'Hits: '}
  #twpc-dialog #twpc-credit-members td:nth-child(3){grid-row:3;text-align:right;color:var(--twpc-muted)}#twpc-dialog #twpc-credit-members td:nth-child(3)::before{content:'Losses: '}
  #twpc-dialog #twpc-credit-members td:nth-child(4){grid-row:2}#twpc-dialog #twpc-credit-members td:nth-child(5){grid-row:2;text-align:right}
  #twpc-dialog #twpc-credit-members td:nth-child(4){color:#8ad5ff;font-weight:700;font-size:14px}#twpc-dialog #twpc-credit-members td:nth-child(5){color:#e8c276;font-size:10px}
  #twpc-dialog #twpc-credit-members tr[data-status=credited] td:nth-child(5){color:#51d96a}#twpc-dialog #twpc-credit-members tr[data-status=needs-review] td:nth-child(5){color:#ff6c77}
  #twpc-dialog #twpc-credit-members td:nth-child(6){grid-row:4;grid-column:1/-1;display:flex;gap:5px}#twpc-dialog #twpc-credit-members button{flex:1;font-size:11px}
  @media(max-width:600px){#twpc-dialog{inset:12px 10px auto auto;max-height:calc(100dvh - 24px)}#twpc-dialog .twpc-window-body{max-height:calc(100dvh - 104px)}#twpc-dialog input,#twpc-dialog select{font-size:16px;min-height:38px}#twpc-dialog button{min-height:38px}#twpc-dialog header button{min-height:32px}#twpc-dialog .twpc-cache-row{grid-template-columns:1fr 1fr}}
  @media(max-height:600px){#twpc-dialog{top:12px;max-height:calc(100dvh - 24px)}#twpc-dialog .twpc-window-body{max-height:calc(100dvh - 104px)}}
  `;
  const main=$('calculator-panel'),nav=dialog.querySelector('[role=tablist]'),header=dialog.querySelector('header');
  const drag=make('div','⠿ drag');drag.className='twpc-drag';drag.id='twpc-drag';drag.tabIndex=0;drag.setAttribute('role','button');drag.setAttribute('aria-label','Move war payout panel. Use arrow keys to move.');header.before(drag);
  const title=$('title'),close=$('close');title.textContent='War payout';
  const brand=make('div');brand.className='twpc-brand';const mark=make('span','❄');mark.className='twpc-brand-mark';mark.setAttribute('aria-hidden','true');
  const brandText=make('div'),subtitle=make('div','FROSTBITE');subtitle.className='twpc-brand-subtitle';brandText.append(title,subtitle);brand.append(mark,brandText);header.replaceChildren(brand);
  const toolbar=make('div');toolbar.className='twpc-toolbar';
  const gear=make('button','⚙');gear.id='twpc-settings-toggle';gear.type='button';gear.setAttribute('aria-label','API and extra payout settings');gear.setAttribute('aria-expanded','false');gear.setAttribute('aria-controls','twpc-settings-panel');
  const collapse=make('button','▴');collapse.id='twpc-collapse';collapse.type='button';collapse.setAttribute('aria-label','Collapse war payout panel');collapse.setAttribute('aria-expanded','true');collapse.setAttribute('aria-controls','twpc-window-body');toolbar.append(gear,collapse,close);header.append(toolbar);
  const body=make('div');body.className='twpc-window-body';body.id='twpc-window-body';
  const settings=make('div');settings.id='twpc-settings-panel';settings.className='twpc-settings';settings.hidden=true;
  const connection=$('connection'),ratesSection=$('rate-hits').closest('section'),extra=ratesSection.querySelector('details');
  settings.append(connection,extra,$('remember-rates'));connection.open=true;
  const help=details('How payouts work',make('p','Only attacks against the selected war enemy count. Loss pay is for enemy attacks that defeat your players. Review available-log counts before paying.'));settings.append(help);
  body.append(nav,settings,main,$('credit-panel'));dialog.append(body);nav.classList.add('twpc-tabs');
  $('tab-calculator').textContent='Calculate';$('tab-credits').textContent='Pay members';
  gear.addEventListener('click',()=>{settings.hidden=!settings.hidden;gear.setAttribute('aria-expanded',String(!settings.hidden));if(!settings.hidden){connection.open=true;settings.scrollIntoView({block:'nearest'});}clamp();});
  let collapsed=false;
  function expand(){if(!collapsed)return;collapsed=false;body.hidden=false;collapse.textContent='▴';collapse.setAttribute('aria-expanded','true');collapse.setAttribute('aria-label','Collapse war payout panel');onExpand();clamp();}
  collapse.addEventListener('click',()=>{if(collapsed){expand();return;}collapsed=true;body.hidden=true;collapse.textContent='▾';collapse.setAttribute('aria-expanded','false');collapse.setAttribute('aria-label','Expand war payout panel');onCollapse();clamp();});
  // Preserve existing controls, but make the basic calculation a small form.
  for(const heading of main.querySelectorAll('h3'))heading.remove();
  const warSection=$('war').closest('section');warSection.querySelector('small')?.remove();
  $('list-wars').textContent='Sync wars';$('load').textContent='Refresh';$('load').title='Scan the selected war again, replacing its saved counts only when loading succeeds.';
  const warDetails=details('War details',$('coverage'));warDetails.id='twpc-war-details';warDetails.querySelector('summary').id='twpc-war-counts';warSection.append(warDetails);
  label('war','War');label('mode','Profit / estimate');label('cut-mode','Faction cut');label('cut','Cut amount');label('profit','War profit ($)');label('rate-hits','Per hit ($)');label('rate-losses','Per loss ($)');
  $('cut-mode').querySelector('[value=amount]').textContent='$ amount';$('cut-mode').querySelector('[value=percent]').textContent='% of profit';
  const moneySection=$('mode').closest('section'),moneyGrid=$('mode').parentElement.parentElement;
  const cutRow=make('div');cutRow.className='twpc-grid twpc-two';cutRow.append($('cut-mode').parentElement,$('cut-field'));
  const amountRow=make('div');amountRow.className='twpc-grid twpc-two twpc-mode-row';amountRow.append($('mode').parentElement,$('actual'));moneyGrid.replaceWith(amountRow);$('actual').style.marginTop='0';$('actual').className='';amountRow.after(cutRow);
  ratesSection.querySelector('p')?.remove();
  const estimate=$('estimate');estimate.querySelector('p')?.remove();
  const planning=details('Cache prices / expected counts',$('cache-source').parentElement,$('cache-items'),$('count-source').parentElement,$('expected'));
  $('cache-total-field').before(planning);const cacheGrid=$('cache-total-field').parentElement;cacheGrid.className='';
  // Secondary totals and export notes remain available without occupying the main view.
  const totals=main.querySelector('.twpc-summary'),totalDetail=details('Budget breakdown');
  for(const id of ['summary-profit','summary-cut','pool'])totalDetail.append($(id).parentElement);
  totals.children[0].querySelector('small').textContent='Player payouts';
  main.insertBefore(totalDetail,totals.nextSibling);
  const tableSection=$('players').closest('section');tableSection.querySelector('h3')?.remove();
  for(const [section,text]of[[warSection,'War report'],[moneySection,'Profit & faction cut'],[ratesSection,'Member rates'],[tableSection,'Payout breakdown']]){
    const heading=make('div',text);heading.className='twpc-section-title';if(section===warSection)heading.append(make('small','ENEMY ONLY'));section.prepend(heading);
  }
  const creditTitle=make('div','Member credits');creditTitle.className='twpc-section-title';$('credit-panel').querySelector('section').prepend(creditTitle);
  settings.append(details('Draft and export notes',$('table-note')));$('csv').textContent='CSV';$('copy').textContent='Copy';
  const escape=event=>{if(event.key==='Escape'&&dialog.open&&dialog.contains(doc.activeElement)){event.preventDefault();onClose();}};
  doc.addEventListener('keydown',escape);
  let moving=null,positioned=false;
  function place(left,top){const rect=dialog.getBoundingClientRect();dialog.style.left=Math.max(10,Math.min(left,win.innerWidth-rect.width-10))+'px';dialog.style.top=Math.max(10,Math.min(top,win.innerHeight-rect.height-10))+'px';dialog.style.right='auto';positioned=true;}
  function clamp(){if(!dialog.open||!positioned)return;const rect=dialog.getBoundingClientRect();place(rect.left,rect.top);}
  drag.addEventListener('pointerdown',event=>{if(event.button!==0)return;const r=dialog.getBoundingClientRect();moving={id:event.pointerId,x:event.clientX,y:event.clientY,left:r.left,top:r.top};drag.setPointerCapture(event.pointerId);event.preventDefault();});
  drag.addEventListener('pointermove',event=>{if(moving?.id===event.pointerId)place(moving.left+event.clientX-moving.x,moving.top+event.clientY-moving.y);});
  const stopMove=()=>{moving=null;};drag.addEventListener('pointerup',stopMove);drag.addEventListener('pointercancel',stopMove);drag.addEventListener('lostpointercapture',stopMove);
  drag.addEventListener('keydown',event=>{const offset={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];if(offset){event.preventDefault();const r=dialog.getBoundingClientRect();place(r.left+offset[0],r.top+offset[1]);}});
  win.addEventListener('resize',clamp);
  return{expand,clamp,showSettings(){expand();settings.hidden=false;connection.open=true;gear.setAttribute('aria-expanded','true');clamp();},destroy(){moving=null;win.removeEventListener('resize',clamp);doc.removeEventListener('keydown',escape);}};
}
