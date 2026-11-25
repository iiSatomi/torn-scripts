// Runs entirely in this userscript's private closure. The Hub only opens its menu.
/* Detached report renderer. No API, HTML from Torn, payout mutations or storage. */
const WarPayoutSheet = (() => {
  const integer=(x,min=0)=>Number.isSafeInteger(x)&&x>=min;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clean=(value,limit=120)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,limit):'';
  const number=value=>value.toLocaleString('en-US');
  const money=value=>'$'+number(value);
  const extra=[['losses','Enemy losses'],['assists','Assists'],['stalemates','Stalemates'],['defends','Successful defends']];
  const statusNames={pending:'Pending',crediting:'In progress',credited:'Credited',skipped:'Skipped','needs-review':'Needs review'};
  const valid=value=>{if(!value)throw new Error('A valid payout calculation or locked run is required.');};
  function build({scope,result,rows,kind,opponent}){
    const locked=kind==='locked',live=kind==='live'||kind==='live-estimate',estimate=kind==='estimate'||kind==='live-estimate';
    valid(locked||live||estimate||kind==='draft');
    valid(scope&&['warId','factionId','opponentId','start','end'].every(key=>integer(scope[key],1))&&scope.end>=scope.start&&scope.factionId!==scope.opponentId);
    valid(result&&['profit','cut','pool','total'].every(key=>integer(result[key]))&&Number.isSafeInteger(result.leftover)&&result.cut<=result.profit&&result.pool===result.profit-result.cut&&result.leftover===result.pool-result.total);
    valid(result.rates&&['hits',...extra.map(([key])=>key)].every(key=>integer(result.rates[key])));
    valid(Array.isArray(rows)&&rows.length>0&&rows.length<=1000);
    const enabled=extra.filter(([key])=>result.rates[key]>0), ids=new Set();
    const totals={hits:0n,amount:0n,credited:0n,creditedCount:0,...Object.fromEntries(enabled.map(([key])=>[key,0n]))};
    const entries=rows.map(row=>{
      const amount=locked?row?.amount:row?.payout;
      valid(row&&integer(row.id,1)&&!ids.has(row.id)&&integer(amount)&&integer(row.hits)&&enabled.every(([key])=>integer(row[key])));
      if(locked)valid(typeof row.status==='string'&&Object.hasOwn(statusNames,row.status));
      ids.add(row.id);totals.hits+=BigInt(row.hits);totals.amount+=BigInt(amount);
      for(const [key]of enabled)totals[key]+=BigInt(row[key]);
      if(locked&&row.status==='credited'){totals.credited+=BigInt(amount);totals.creditedCount++;}
      return {name:clean(row.name)||'Player '+row.id,amount,hits:row.hits,status:locked?row.status:null,extras:enabled.map(([key])=>row[key])};
    });
    valid(totals.amount===BigInt(result.total));
    const heading='Faction #'+scope.factionId+' vs '+(clean(opponent)||'faction #'+scope.opponentId);
    const label=locked?'Locked payout snapshot':kind==='live-estimate'?'Live estimate draft':live?'Live payout draft':estimate?'Planning estimate draft':'War payout draft';
    const detail=locked?'Locked amounts and credit statuses from this device. Only rows marked Credited count toward the credited subtotal.':live?'Available counts so far. This is a draft, not a record of payments.':estimate?'Estimated cache proceeds and loaded member counts. This is a draft, not a record of payments.':'Actual-profit calculator draft. This is not a record of payments.';
    const tct=stamp=>new Date(stamp*1000).toISOString().slice(0,16).replace('T',' ');
    const time=tct(scope.start)+' to '+tct(scope.end)+' TCT'+(live?' (through available data)':'');
    const lines=[
      [estimate?'Estimated cache proceeds':'War profit',money(result.profit)],
      ['Faction cut',money(result.cut)],['Available for payout',money(result.pool)],
      [locked?'Locked payouts':'Calculated payouts',money(result.total)],
      [result.leftover<0?'Funding shortfall':'Leftover',money(Math.abs(result.leftover)),result.leftover<0],
      ['Eligible hits in this sheet',number(totals.hits)],['Pay per hit',money(result.rates.hits)],
      ...enabled.map(([key,text])=>['Rate: '+text,money(result.rates[key])])
    ];
    if(locked)lines.push(['Recorded credited',money(totals.credited)],['Members marked credited',number(totals.creditedCount)+' / '+number(entries.length)]);
    const headers=['Member','Attacks','Pay per hit',...enabled.map(([,text])=>text),...(locked?['Status']:[]),'Total pay'];
    const memberRows=entries.map(row=>'<tr><th scope="row">'+esc(row.name)+'</th><td>'+number(row.hits)+'</td><td>'+money(result.rates.hits)+'</td>'+
      row.extras.map(value=>'<td>'+number(value)+'</td>').join('')+(locked?'<td class="state state-'+row.status+'">'+statusNames[row.status]+'</td>':'')+
      '<td class="amount">'+money(row.amount)+'</td></tr>').join('');
    const foot='<tr><th scope="row">Total</th><td>'+number(totals.hits)+'</td><td></td>'+enabled.map(([key])=>'<td>'+number(totals[key])+'</td>').join('')+(locked?'<td></td>':'')+'<td class="amount">'+money(result.total)+'</td></tr>';
    const style=`
      *{box-sizing:border-box}body{margin:0;background:#0b1827;color:#edf5ff;font:15px/1.48 system-ui,sans-serif}
      main{width:min(100% - 24px,960px);margin:24px auto 40px}.hero{padding:22px 26px;background:#102a44;color:white;border-top:4px solid #5db9de;border-radius:14px}
      h1{margin:5px 0 7px;font-size:clamp(1.36rem,3.6vw,2.35rem);line-height:1.15}.tag{display:inline-block;padding:4px 8px;border-radius:4px;background:#d5f0ef;color:#143b42;font-size:.74rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
      .hero p{margin:.3rem 0;color:#d6e4ef}.card{margin-top:17px;padding:18px;border:1px solid #3b546d;background:#13263a;border-radius:12px}h2{margin:0 0 10px;color:#9edbf4;font-size:1.08rem}
      .scroll{overflow-x:auto}.scroll:focus-visible{outline:2px solid #13688d;outline-offset:2px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:.92rem}
      th,td{padding:8px 10px;text-align:right;vertical-align:top;border-bottom:1px solid #314a61}thead th{background:#254664;color:#eff8ff;font-size:.78rem;white-space:normal}
      th:first-child{text-align:left}tbody th{min-width:110px;overflow-wrap:anywhere}td.amount{font-weight:700;white-space:nowrap;color:#8ae7d4}tbody tr:nth-child(even){background:#192f47}tfoot th,tfoot td{background:#173a55;color:white!important;font-weight:bold}
      .state{font-weight:650;white-space:nowrap}.state-credited{color:#8de8cb}.state-needs-review,.state-crediting,.warn{color:#ffb78b}.state-skipped{color:#a5b8c9}
      dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:8px}.fact{padding:8px 12px;background:#1b344b;border-left:3px solid #6eaec8}
      .fact dt{font-size:.8rem;color:#b9d7ed}.fact dd{margin:2px 0 0;font-size:1.02rem;font-weight:750}footer{padding:14px 4px 0;color:#abc4d7;font-size:.79rem}footer p{margin:0 0 .35rem}
      @media(max-width:500px){main{margin-top:12px}.hero,.card{padding:13px}th,td{padding:7px 5px}.classic{table-layout:fixed;font-size:12px}.classic th:first-child{width:26%;min-width:0}.classic th:nth-child(2){width:15%}.classic th:nth-child(3){width:29.5%}.classic th:nth-child(4){width:29.5%}.classic td{overflow-wrap:anywhere;white-space:normal}}
      @media print{body{background:white;color:black}main{width:100%;margin:0}.hero,.card{border:1px solid #999;border-radius:0;color:black;background:white;box-shadow:none}.hero p,.fact dt,h2,td.amount,.state,.warn,footer{color:#222!important}thead th,tfoot th,tfoot td,.fact,tbody tr:nth-child(even){background:#eef3f7;color:#111!important}thead{display:table-header-group}tfoot th,tfoot td{background:#e0ecf4;color:#111!important}tr{break-inside:avoid}.fact{break-inside:avoid}.scroll{overflow:visible}}
    `;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'+
      '<title>'+esc(label+' | War #'+scope.warId)+'</title><style>'+style+'</style></head><body><main>'+
      '<header class="hero"><span class="tag">'+esc(label)+'</span><h1>'+esc(heading)+'</h1>'+
      '<p>Ranked war #'+scope.warId+' &middot; '+esc(time)+'</p><p>'+esc(detail)+'</p></header>'+
      '<section class="card"><h2 id="members">Member payouts</h2><div class="scroll" role="region" aria-labelledby="members" tabindex="0"><table'+(headers.length===4?' class="classic"':'')+'>'+
      '<thead><tr>'+headers.map(title=>'<th scope="col">'+esc(title)+'</th>').join('')+'</tr></thead><tbody>'+memberRows+'</tbody><tfoot>'+foot+'</tfoot></table></div></section>'+
      '<section class="card"><h2>War summary</h2><dl>'+lines.map(([title,value,warn])=>'<div class="fact"><dt>'+esc(title)+'</dt><dd'+(warn?' class="warn"':'')+'>'+esc(value)+'</dd></div>').join('')+'</dl></section>'+
      '<footer><p>Counts are for attacks against the selected war opponent. Torn API attack-log completeness is unverified.</p><p>Only amounts tracked in the calculator are shown; separate expenses or donations are not inferred.</p></footer></main></body></html>';
  }

  async function deliver({doc,env,html,fileName,stillCurrent}){
    if(!stillCurrent())return false;
    const win=doc.defaultView;
    const initialBridge=env.flutter_inappwebview;
    const manager=env.GM_info?.scriptHandler||env.GM?.info?.scriptHandler;
    const pda=!!(initialBridge||env.__PDA_platformReadyPromise||env.PDA_storage||env.PDA_getTabState||env.PDA_httpGet||env.__tornpda)||manager==='Torn PDA';
    if(pda){
      await env.__PDA_platformReadyPromise;
      if(!stillCurrent())return false;
      const bridge=env.flutter_inappwebview||win.flutter_inappwebview;
      if(typeof bridge?.callHandler!=='function')throw new Error('HTML share unavailable.');
      let binary='';
      for(const byte of new TextEncoder().encode(html))binary+=String.fromCharCode(byte);
      const reply=await bridge.callHandler('shareFile',{base64Data:win.btoa(binary),fileName});
      if(!stillCurrent())return false;
      if(reply?.status!=='success')throw new Error('HTML share not acknowledged.');
      return 'native';
    }
    const url=win.URL.createObjectURL(new win.Blob([html],{type:'text/html;charset=utf-8'})),link=doc.createElement('a');
    try{link.href=url;link.download=fileName;doc.body.append(link);link.click();return true;}
    finally{link.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);}
  }
  async function copyForForum(doc,html){
    const win=doc.defaultView, clipboard=win.navigator.clipboard;
    if(typeof win.ClipboardItem!=='function'||typeof clipboard?.write!=='function')throw new Error('Formatted copy unavailable.');
    const detached=new win.DOMParser().parseFromString(html,'text/html');
    const title=detached.querySelector('h1').textContent, kind=detached.querySelector('.tag').textContent;
    const details=[...detached.querySelectorAll('.hero p')].map(p=>p.textContent);
    const foot=[...detached.querySelectorAll('footer p')].map(p=>p.textContent);
    const table=[...detached.querySelectorAll('tr')].map(tr=>({group:tr.parentElement.tagName,cells:[...tr.cells].map(cell=>cell.textContent)}));
    const summary=[...detached.querySelectorAll('dl .fact')].map(div=>({group:'NOTE',cells:[div.firstElementChild.textContent,div.lastElementChild.textContent]}));
    const fmtTable=rows=>'<table style="border-collapse:collapse;width:100%;"><tbody>'+rows.map((row,index)=>{
      const high=row.group==='THEAD'||row.group==='TFOOT';
      const bg=high?'#213e5b':index%2?'#15283c':'#192d43';
      return '<tr>'+row.cells.map(cell=>'<td style='+JSON.stringify('background:'+bg+';color:#f1f7ff;border:1px solid #385771;padding:5px 9px;')+'>'+esc(cell)+'</td>').join('')+'</tr>';
    }).join('')+'</tbody></table>';
    const fragment='<p><strong>'+esc(title)+'</strong></p><p>'+esc(kind)+'</p>'+details.map(v=>'<p>'+esc(v)+'</p>').join('')+fmtTable(table)+'<p><strong>War summary</strong></p>'+fmtTable(summary)+foot.map(v=>'<p>'+esc(v)+'</p>').join('');
    const plain=[title,kind,...details,'',...table.map(row=>row.cells.join('\t')),'','War summary',...summary.map(row=>row.cells.join(': ')),...foot].join('\n');
    const item=new win.ClipboardItem({'text/html':new win.Blob([fragment],{type:'text/html'}),'text/plain':new win.Blob([plain],{type:'text/plain'})});
    return clipboard.write([item]);
  }
  return {build,deliver,copyForForum};
})();

/* Render the already-sanitized sheet projection, not the browser viewport. */
const WarPayoutSheetPng = (() => {
  const maxHeight=4096;
  const tooWide=()=>Object.assign(new Error('This sheet needs more width than the compact forum PNG. Download the regular PNG or full HTML sheet instead.'),{compactFit:true});
  const tooTall=compact=>Object.assign(new Error(compact?'This payout sheet is too tall for a compact forum PNG. Try the regular PNG or download the full HTML sheet instead.':'This payout sheet is too tall for a single PNG. Download the full HTML sheet instead.'),{compactFit:compact});
  function fonts(ctx,size,heavy=false){ctx.font=(heavy?'700 ':'400 ')+size+'px system-ui, sans-serif';}
  function wrap(ctx,text,space){
    const words=String(text??'').trim().split(/\s+/), rows=[];
    let line='';
    for(const word of words){
      if(!word)continue;
      const candidate=line?line+' '+word:word;
      if(ctx.measureText(candidate).width<=space){line=candidate;continue;}
      if(line){rows.push(line);line='';}
      if(ctx.measureText(word).width<=space){line=word;continue;}
      for(const symbol of word){
        if(line&&ctx.measureText(line+symbol).width>space){rows.push(line);line='';}
        line+=symbol;
      }
    }
    if(line||!rows.length)rows.push(line);
    return rows;
  }
  function project(doc,html){
    const page=new doc.defaultView.DOMParser().parseFromString(html,'text/html');
    const content=selector=>[...page.querySelectorAll(selector)].map(node=>node.textContent);
    return {
      title:content('.hero h1')[0],kind:content('.hero .tag')[0],meta:content('.hero p'),
      header:content('thead tr th'),body:[...page.querySelectorAll('tbody tr')].map(tr=>[...tr.cells].map(c=>c.textContent)),
      total:content('tfoot tr > *'),
      facts:[...page.querySelectorAll('dl .fact')].map(f=>({label:f.firstElementChild.textContent,value:f.lastElementChild.textContent,warn:f.lastElementChild.classList.contains('warn')})),
      foot:content('footer p'),
    };
  }
  async function render(doc,html,compact){
    const width=compact?720:1120,left=compact?24:32,inside=width-2*left;
    const titleSize=compact?34:35,bodySize=compact?22:18,headSize=compact?22:17,cellLine=compact?24:22;
    const metaSize=compact?21:17,metaLine=compact?25:24;
    const factLabel=compact?20:15,factValue=compact?23:20, factLabelLine=compact?22:19,factValueLine=25;
    const footSize=compact?20:15,footLine=compact?23:21;
    const data=project(doc,html), cols=data.header.length;
    if(!data.title||!data.kind||cols<4||cols>9||!data.body.length||data.total.length!==cols||data.body.some(row=>row.length!==cols))throw new Error('A complete payout sheet is required.');
    if(data.body.length>maxHeight/(compact?32:30))throw tooTall(compact);
    const canvas=doc.createElement('canvas');
    canvas.width=width;canvas.height=1;
    const ctx=canvas.getContext('2d');if(!ctx||typeof canvas.toBlob!=='function')throw new Error('PNG is not available in this browser. Download the HTML sheet instead.');
    const weights=cols===4?[.38,.16,.21,.25]:[.235,...Array(cols-2).fill(.58/(cols-2)),.185];
    let widths=weights.map((weight,i)=>i===cols-1?inside-weights.slice(0,-1).reduce((sum,x)=>sum+Math.floor(x*inside),0):Math.floor(inside*weight));
    if(compact){
      const minimum=data.header.map((label,i)=>i===0?(cols===4?150:116):i===cols-1?110:label==='Status'?88:label==='Attacks'?63:label==='Pay per hit'?85:47);
      fonts(ctx,headSize,true);
      data.header.forEach((label,i)=>{
        for(const word of label.split(/\s+/))minimum[i]=Math.max(minimum[i],Math.ceil(ctx.measureText(word).width)+20);
      });
      for(const row of [...data.body,data.total])row.forEach((value,i)=>{
        if(value[0]!=='$')return;
        fonts(ctx,bodySize,i===cols-1||row===data.total);
        minimum[i]=Math.max(minimum[i],Math.ceil(ctx.measureText(value).width)+20);
      });
      const spare=inside-minimum.reduce((sum,w)=>sum+w,0);
      if(spare<0)throw tooWide();
      widths=minimum.map((w,i)=>w+Math.floor(spare*(i===0?.55:i===cols-1?.17:.28/(cols-2))));
      widths[0]+=inside-widths.reduce((sum,w)=>sum+w,0);
    }
    if(!compact){
      // Whole dollar amounts must stay together. Borrow from columns with
      // room above their readability floors instead of wrapping digits.
      const minimum=data.header.map((label,i)=>i===0?160:label==='Status'?100:55);
      fonts(ctx,headSize,true);
      data.header.forEach((label,i)=>{
        for(const word of label.split(/\s+/))minimum[i]=Math.max(minimum[i],Math.ceil(ctx.measureText(word).width)+20);
      });
      for(const row of [...data.body,data.total])row.forEach((value,i)=>{
        if(value[0]!=='$')return;
        fonts(ctx,bodySize,i===cols-1||row===data.total);
        minimum[i]=Math.max(minimum[i],Math.ceil(ctx.measureText(value).width)+20);
      });
      if(minimum.reduce((sum,w)=>sum+w,0)>inside)throw new Error('This sheet needs more width than a single PNG. Download the full HTML sheet instead.');
      for(let i=0;i<cols;i++){
        let need=minimum[i]-widths[i];
        while(need>0){
          let donor=0;
          for(let j=1;j<cols;j++)if(widths[j]-minimum[j]>widths[donor]-minimum[donor])donor=j;
          const transfer=Math.min(need,widths[donor]-minimum[donor]);
          widths[donor]-=transfer;widths[i]+=transfer;need-=transfer;
        }
      }
    }
    function tableRow(values,size,heavy=false){
      fonts(ctx,size,heavy);
      const cells=values.map((value,i)=>{fonts(ctx,size,heavy||i===cols-1);return wrap(ctx,value,widths[i]-20);});
      return {cells,height:Math.max(compact?32:30,8+Math.max(...cells.map(lines=>lines.length))*cellLine)};
    }
    const header=tableRow(data.header,headSize,true), total=tableRow(data.total,bodySize,true);
    const rows=data.body.map(values=>tableRow(values,bodySize));
    fonts(ctx,titleSize,true);const title=wrap(ctx,data.title,inside-48);
    fonts(ctx,metaSize);const meta=data.meta.map(line=>wrap(ctx,line,inside-48));
    const bannerHeight=80+title.length*42+meta.reduce((sum,lines)=>sum+lines.length*metaLine,0);
    const tableHeight=header.height+rows.reduce((sum,row)=>sum+row.height,0)+total.height;
    let lanes=2;
    if(compact){fonts(ctx,factValue,true);if(data.facts.some(({value})=>ctx.measureText(value).width>(inside-14)/2-28))lanes=1;}
    const laneWidth=Math.floor((inside-(lanes-1)*14)/lanes);
    const facts=data.facts.map(fact=>{
      fonts(ctx,factLabel);const label=wrap(ctx,fact.label,laneWidth-28);
      fonts(ctx,factValue,true);const value=wrap(ctx,fact.value,laneWidth-28);
      return {...fact,label,value,height:18+label.length*factLabelLine+value.length*factValueLine};
    });
    const factRows=[];
    for(let i=0;i<facts.length;i+=lanes){const pair=facts.slice(i,i+lanes);factRows.push({pair,height:Math.max(...pair.map(f=>f.height))});}
    const factsHeight=factRows.reduce((sum,row)=>sum+row.height+8,0);
    fonts(ctx,footSize);const foot=data.foot.map(line=>wrap(ctx,line,inside));
    const height=32+bannerHeight+56+tableHeight+64+factsHeight+foot.reduce((n,lines)=>n+lines.length*footLine+4,0)+31;
    if(height>maxHeight)throw tooTall(compact);
    canvas.height=height;
    const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
    const text=(content,x,y,color,size,{heavy=false,align='left',line=22}={})=>{
      fonts(ctx,size,heavy);ctx.textAlign=align;ctx.textBaseline='top';ctx.fillStyle=color;
      content.forEach((value,index)=>ctx.fillText(value,x,y+index*line));
    };
    rect(0,0,width,height,'#0b1827');
    rect(left,32,inside,bannerHeight,'#102a44');rect(left,32,inside,5,'#5db9de');
    text([data.kind.toUpperCase()],left+24,49,'#8ce5d7',compact?20:15,{heavy:true});
    text(title,left+24,76,'#ffffff',titleSize,{heavy:true,line:42});
    let y=82+title.length*42;
    for(const list of meta){text(list,left+24,y,'#d6e4ef',metaSize,{line:metaLine});y+=list.length*metaLine;}
    y=32+bannerHeight+20;
    text(['Member payouts'],left,y,'#9edbf4',23,{heavy:true});
    y+=36;
    function paintTable(row,color,foreground,heavy=false){
      rect(left,y,inside,row.height,color);
      let x=left;
      row.cells.forEach((cell,i)=>{
        const ink=i===cols-1&&color!=='#254664'?'#8ae7d4':foreground;
        text(cell,i===0?x+10:x+widths[i]-10,y+5,ink,heavy&&color==='#254664'?headSize:bodySize,{heavy:heavy||i===cols-1,align:i===0?'left':'right',line:cellLine});
        x+=widths[i];
      });
      rect(left,y+row.height-1,inside,1,'#314a61');
      y+=row.height;
    }
    paintTable(header,'#254664','#eff8ff',true);
    rows.forEach((row,i)=>paintTable(row,i%2?'#192f47':'#13263a','#edf5ff'));
    paintTable(total,'#173a55','#ffffff',true);
    y+=23;text(['War summary'],left,y,'#9edbf4',23,{heavy:true});y+=37;
    for(const {pair,height:band} of factRows){
      pair.forEach((fact,i)=>{
        const x=left+i*(laneWidth+14);rect(x,y,laneWidth,band,'#1b344b');rect(x,y,4,band,'#6eaec8');
        text(fact.label,x+14,y+7,'#b9d7ed',factLabel,{line:factLabelLine});
        text(fact.value,x+14,y+9+fact.label.length*factLabelLine,fact.warn?'#ffb78b':'#edf5ff',factValue,{heavy:true,line:factValueLine});
      });
      y+=band+8;
    }
    y+=4;
    for(const line of foot){text(line,left,y,'#abc4d7',footSize,{line:footLine});y+=line.length*footLine+4;}
    try{
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.type==='image/png'?resolve(blob):reject(new Error('PNG could not be created. Download the HTML sheet instead.')),'image/png'));
    }finally{canvas.width=0;canvas.height=0;}
  }
  // One PNG chooser lane. A stale render can be replaced; an issued native
  // call owns the lane until it settles, regardless of the open section.
  let pngNativeJob=null;
  function outcome(value,locked){
    if(value==='busy')return 'Another PNG is already opening or sharing. Try again after it finishes.';
    const label=locked?'Locked payout PNG':'Payout PNG';
    return value==='native'?label+' handed to the PDA share menu.':label+' download started.';
  }
  async function deliver({doc,env,html,fileName,stillCurrent,compact=false}){
    if(!stillCurrent())return false;
    const win=doc.defaultView;
    const manager=String(env.GM_info?.scriptHandler??'').trim();
    const pda=!!(win.flutter_inappwebview||env.flutter_inappwebview||win.__PDA_platformReadyPromise||env.__PDA_platformReadyPromise||env.PDA_storage||env.PDA_getTabState||env.PDA_httpGet||env.__tornpda)||manager==='Torn PDA';
    const unavailable=()=>new Error('The PNG share could not be confirmed in PDA. Try copying the forum image or downloading the PNG on desktop.');
    if(pda){
      if(pngNativeJob&&(pngNativeJob.issued||pngNativeJob.owner()))return 'busy';
      const job={owner:stillCurrent,issued:false};pngNativeJob=job;
      const owns=()=>pngNativeJob===job&&stillCurrent();
      try{
        const blob=await render(doc,html,compact);
        if(!owns())return false;
        try{
        await (win.__PDA_platformReadyPromise??env.__PDA_platformReadyPromise);
        if(!owns())return false;
        const bytes=new Uint8Array(await blob.arrayBuffer());
        if(!owns())return false;
        let binary='';
        for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
        const bridge=win.flutter_inappwebview??env.flutter_inappwebview;
        if(typeof bridge?.callHandler!=='function')throw unavailable();
        job.issued=true;
        const reply=await bridge.callHandler('shareFile',{base64Data:win.btoa(binary),fileName});
        if(!owns())return false;
        if(reply?.status!=='success')throw unavailable();
        return 'native';
      }catch(_){if(!owns())return false;throw unavailable();} }
      finally{if(pngNativeJob===job)pngNativeJob=null;}
    }
    const blob=await render(doc,html,compact);
    if(!stillCurrent())return false;
    const url=win.URL.createObjectURL(blob),link=doc.createElement('a');
    try{link.href=url;link.download=fileName;doc.body.append(link);link.click();return 'desktop';}
    finally{link.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);}
  }
  function message(error){
    const detail=error?.message||'';
    return /^(This payout sheet is too tall|This sheet needs more width|PNG is not available|PNG could not be created|The PNG share could not (?:open|be confirmed in PDA))/.test(detail)?detail:'Could not prepare the payout PNG. Download the HTML sheet instead.';
  }
  // Preparation is asynchronous; writing the already prepared Blob starts in
  // the second trusted click so it never depends on retaining user activation.
  function createClipboard({doc,button,readSource,note,readNote,locked=false}){
    const win=doc.defaultView;
    const idle='Copy forum image';
    const readyLabel='Copy image now';
    const unavailable='Image clipboard unavailable here. Download the forum PNG instead.';
    const failed='Could not copy the image. Download the forum PNG instead.';
    let task=null,lastNote='';
    const say=value=>{lastNote=value;note(value);};
    function invalidate(){
      task=null;button.textContent=idle;
      if(lastNote&&readNote()===lastNote)note('');
      lastNote='';
    }
    const owns=value=>task===value&&!button.disabled&&value.source.current();
    function retireIfStale(){if(task&&!owns(task))invalidate();}
    function clipboard(){
      const api=win.navigator.clipboard,Item=win.ClipboardItem;
      if(typeof api?.write!=='function'||typeof Item!=='function'||(typeof Item.supports==='function'&&Item.supports('image/png')===false))return null;
      return {api,Item};
    }
    async function prepare(next){
      try{
        const html=next.source.html();
        let blob;
        try{blob=await render(doc,html,true);}
        catch(error){
          if(!error?.compactFit)throw error;
          if(!owns(next))return;
          next.wide=true;
          blob=await render(doc,html,false);
        }
        if(!owns(next))return;
        next.blob=blob;next.phase='ready';button.textContent=readyLabel;
        say(next.wide?'Full-size image ready. The compact image does not fit. Tap Copy image now.':'Forum PNG ready. Tap the copy button to put the image on your clipboard.');
      }catch(error){
        if(!owns(next))return;
        invalidate();say(message(error));
      }
    }
    function beginCopy(active,api,Item){
      active.phase='copying';button.textContent='Copying image...';
      try{
        if(!owns(active)){invalidate();return;}
        const item=new Item({'image/png':active.blob});
        if(!owns(active)){invalidate();return;}
        const result=api.write([item]);
        if(typeof result?.then!=='function')throw new Error('Image clipboard did not acknowledge.');
        Promise.resolve(result).then(()=>{
          if(!owns(active))return;
          invalidate();say('Forum PNG copied. Paste the image where you want to share it.');
        },()=>{
          if(!owns(active))return;
          invalidate();say(active.wide?'Could not copy the image. Download the full-size PNG under other sheet formats.':failed);
        });
      }catch(_){if(owns(active)){invalidate();say(active.wide?'Could not copy the image. Download the full-size PNG under other sheet formats.':failed);}}
    }
    button.addEventListener('click',event=>{
      if(!event.isTrusted||button.disabled)return;
      retireIfStale();
      if(task&&task.phase!=='ready')return;
      let capability;
      try{capability=clipboard();}catch(_){}
      if(!capability){invalidate();say(unavailable);return;}
      if(task){beginCopy(task,capability.api,capability.Item);return;}
      const source=readSource();if(!source?.current())return;
      const next={source,phase:'preparing',blob:null};task=next;
      button.textContent='Preparing image...';
      say('Preparing the forum PNG. Nothing is copied yet.');
      void prepare(next);
    });
    return {invalidate,retireIfStale};
  }
  return {deliver,message,createClipboard,outcome};
})();
