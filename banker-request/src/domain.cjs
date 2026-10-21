'use strict';
const BankerRequestDomain=(()=>{
  const maxAmount=1_000_000_000_000;
  const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
  const id=value=>Number.isSafeInteger(value)&&value>0;
  function parseCents(value){
    const text=String(value).trim().replace(/^\$\s*/,'').replace(/\u2212/g,'-');
    if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))throw new Error('Balance is unreadable.');
    const [whole,fraction='']=text.replace(/[-,]/g,'').split('.');
    const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
    if(cents>BigInt(Number.MAX_SAFE_INTEGER)*100n)throw new Error('Balance exceeds the supported limit.');
    return text.startsWith('-')?-cents:cents;
  }
  function parseAmount(value){
    const text=String(value).trim().replace(/^\$\s*/,'');
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))throw new Error('Enter a positive whole dollar amount.');
    const amount=Number(text.replace(/,/g,''));
    if(!Number.isSafeInteger(amount)||amount<=0||amount>maxAmount)throw new Error('Amount must be between $1 and $1,000,000,000,000.');
    return amount;
  }
  function validateEndpoint(value){
    let url;try{url=new URL(String(value).trim());}catch(_){throw new Error('Enter your HTTPS Cloudflare relay address.');}
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||host.endsWith('.localhost')||host.endsWith('.local')||['localhost','www.torn.com','torn.com','api.torn.com','discord.com','discordapp.com'].includes(host))throw new Error('Use a public HTTPS relay origin without a path, credentials or query.');
    return url.origin;
  }
  function parseRequestLink(location){
    try{const url=new URL(location.href);if(url.origin!=='https://www.torn.com'||url.pathname!=='/factions.php'||url.searchParams.get('step')!=='your')return null;const args=new URLSearchParams(url.hash.replace(/^#\/?/,''));const tokens=args.getAll('bankRequest');return args.get('tab')==='controls'&&tokens.length===1&&uuid(tokens[0])?tokens[0]:null;}catch(_){return null;}
  }
  function readRequest(raw,now=Date.now()){
    if(!raw||!uuid(raw.token)||!uuid(raw.requestId)||!id(raw.userId)||!id(raw.factionId)||typeof raw.name!=='string'||!raw.name.length||raw.name.length>80||!['amount','full'].includes(raw.kind)||!['sent','uncertain','failed','pending'].includes(raw.status)||!Number.isSafeInteger(raw.createdAt)||!Number.isSafeInteger(raw.expiresAt)||raw.createdAt>now+60000||raw.expiresAt<=now||raw.expiresAt<=raw.createdAt)throw new Error('This request is invalid or expired.');
    if(raw.kind==='amount'&&(!id(raw.amount)||raw.amount>maxAmount))throw new Error('Request amount is invalid.');
    return {token:raw.token,requestId:raw.requestId,userId:raw.userId,name:raw.name,factionId:raw.factionId,kind:raw.kind,amount:raw.kind==='amount'?raw.amount:null,createdAt:raw.createdAt,expiresAt:raw.expiresAt,status:raw.status};
  }
  function payoutPlan(raw,snapshot,now=Date.now()){
    const request=readRequest(raw,now);
    if(request.status!=='sent')throw new Error('Delivery is not confirmed. Review this request manually.');
    if(!snapshot||snapshot.userId!==request.userId||snapshot.factionId!==request.factionId)throw new Error('Recipient or faction does not match the request.');
    if(typeof snapshot.balanceCents!=='bigint'||snapshot.balanceCents<=0n)throw new Error('A positive current member balance is required.');
    if(!Number.isFinite(snapshot.observedAt)||snapshot.observedAt>now||now-snapshot.observedAt>30000)throw new Error('The balance check is stale. Check it again.');
    const amount=request.kind==='full'?Number(snapshot.balanceCents/100n):request.amount;
    if(!Number.isSafeInteger(amount)||amount<1||amount>maxAmount||BigInt(amount)*100n>snapshot.balanceCents)throw new Error('Request exceeds the available member balance or supported limit.');
    return {amount,balanceCents:snapshot.balanceCents,afterCents:snapshot.balanceCents-BigInt(amount)*100n,userId:request.userId,factionId:request.factionId};
  }
  function money(value){return '$'+Number(value).toLocaleString('en-US');}
  return {maxAmount,uuid,parseAmount,parseCents,validateEndpoint,parseRequestLink,readRequest,payoutPlan,money};
})();
module.exports=BankerRequestDomain;
