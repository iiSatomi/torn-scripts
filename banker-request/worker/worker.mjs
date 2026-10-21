// One faction-scoped SQLite Durable Object. Never log requests, keys or upstream bodies.
const ORIGIN = 'https://www.torn.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Fixed whole-dollar ceiling bounds accidental requests independently of deployment configuration.
const HOUR = 3600000, RETAIN = 24 * HOUR, MAX_AMOUNT = 1000000000000;
const PATHS = new Set(['/v1/identity', '/v1/requests', '/v1/requests/resolve']);
class Fault extends Error {
  constructor(status, code, message, retryAfter) { super(message); Object.assign(this, {status, code, retryAfter}); }
}
const fail = (status, code, message, retryAfter) => { throw new Fault(status, code, message, retryAfter); };
function response(request, data, status = 200) {
  const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Strict-Transport-Security':'max-age=31536000', Vary:'Origin'};
  if (request.headers.get('Origin') === ORIGIN) Object.assign(headers, {'Access-Control-Allow-Origin':ORIGIN, 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Max-Age':'600'});
  if (data.retryAfter) headers['Retry-After'] = String(data.retryAfter);
  return new Response(JSON.stringify(data), {status, headers});
}
function errorResponse(request, e) {
  return e instanceof Fault ? response(request, {ok:false,error:{code:e.code,message:e.message},...(e.retryAfter ? {retryAfter:e.retryAfter} : {})}, e.status) : response(request,{ok:false,error:{code:'UNAVAILABLE',message:'Relay temporarily unavailable.'}},503);
}
function verificationFailure(e) {
  if(e instanceof Fault)return e.code;
  const message=String(e?.message||'');
  if(/redirect/i.test(message))return 'REDIRECT';
  if(/different request|I\/O|outside.*request/i.test(message))return 'IO_CONTEXT';
  if(/stream|reader|body/i.test(message))return 'STREAM';
  if(/abort|timeout/i.test(message))return 'TIMEOUT';
  if(/fetch|network|connect|resolve|ssl|certificate/i.test(message))return 'NETWORK';
  return 'OTHER';
}
function config(env) {
  if (env.ENABLED !== 'true') fail(503,'DISABLED','Relay is disabled.');
  const factionId = Number(env.FACTION_ID);
  const parseIds = (value, pattern, maximum = 100) => {
    if (typeof value !== 'string' || !value || value.length > 2200) fail(503,'CONFIG','Relay configuration unavailable.');
    const ids = value.split(',').map(x => x.trim());
    if (ids.length > maximum || ids.some(id => !pattern.test(id))) fail(503,'CONFIG','Relay configuration unavailable.');
    return [...new Set(ids)];
  };
  const bankers = parseIds(env.BANKER_IDS,/^[1-9][0-9]{0,9}$/).map(Number);
  // Ten role mentions leave ample room under Discord's 2,000-character content limit.
  const roles = parseIds(env.DISCORD_ROLE_IDS,/^[1-9][0-9]{16,19}$/,10);
  if (!Number.isSafeInteger(factionId) || factionId <= 0) fail(503,'CONFIG','Relay configuration unavailable.');
  let webhook;
  try { webhook = new URL(env.DISCORD_WEBHOOK); } catch { fail(503,'CONFIG','Relay configuration unavailable.'); }
  if (webhook.protocol !== 'https:' || webhook.hostname !== 'discord.com' || webhook.port || webhook.username || webhook.password || webhook.search || webhook.hash || !/^\/api\/webhooks\/[0-9]{17,20}\/[A-Za-z0-9_-]{1,200}$/.test(webhook.pathname)) fail(503,'CONFIG','Relay configuration unavailable.');
  webhook.searchParams.set('wait','true');
  return {factionId,bankers,roles,webhook:String(webhook)};
}
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), x=>x.toString(16).padStart(2,'0')).join('');
}
// Cancellation belongs to an untrusted stream: never wait for it or expose its rejection.
function cancelQuietly(source) {
  try { Promise.resolve(source?.cancel()).catch(()=>{}); } catch { /* best effort only */ }
}
async function readJson(source, limit, timeout) {
  if (Number(source.headers.get('Content-Length')) > limit) fail(413,'BODY_SIZE','Body is too large.');
  const reader = source.body?.getReader();
  if (!reader) fail(400,'BODY','Expected a JSON object.');
  const chunks=[]; let size=0; let timer;
  const deadline=timeout ? new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Fault(408,'BODY_TIMEOUT','Request body timed out.'));cancelQuietly(reader);},timeout);}) : null;
  try {
    while(true) { const {done,value}=await (deadline ? Promise.race([reader.read(),deadline]) : reader.read()); if(done)break; size+=value.byteLength; if(size>limit) { cancelQuietly(reader); fail(413,'BODY_SIZE','Body is too large.'); } chunks.push(value); }
  } finally { clearTimeout(timer);try {reader.releaseLock();} catch { /* do not mask the original failure */ } }
  const buffer=new Uint8Array(size); let offset=0; for(const c of chunks){buffer.set(c,offset);offset+=c.byteLength;}
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));} catch {fail(400,'BODY','Expected valid JSON.');}
}
function validate(path, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400,'BODY','Expected a JSON object.');
  const allowed = path === '/v1/identity' ? [] : path.endsWith('/resolve') ? ['token'] : ['requestId','kind','amount'];
  if (Object.keys(body).some(k=>!allowed.includes(k))) fail(400,'FIELDS','Unsupported request fields.');
  if (path.endsWith('/resolve')) { if(typeof body.token !== 'string' || !UUID.test(body.token)) fail(400,'TOKEN','Invalid request token.'); body.token=body.token.toLowerCase(); }
  else if(path === '/v1/requests') {
    if(typeof body.requestId !== 'string' || !UUID.test(body.requestId)) fail(400,'REQUEST_ID','Invalid request ID.');
    body.requestId=body.requestId.toLowerCase();
    if(body.kind !== 'amount' && body.kind !== 'full') fail(400,'KIND','Invalid request kind.');
    if(body.kind === 'full' ? Object.hasOwn(body,'amount') : !Number.isSafeInteger(body.amount) || body.amount<=0 || body.amount>MAX_AMOUNT) fail(400,'AMOUNT','Invalid whole-dollar amount.');
  }
}
async function upstream(url, init, timeout = 6000) {
  const controller = new AbortController(); let timer;
  // Timeout includes body parsing, rather than just arrival of response headers.
  try {
    return await Promise.race([
      // Workers must return redirects as responses; never forward verification headers.
      (async()=>{ const result=await fetch(url,{...init,redirect:'manual',signal:controller.signal}); if(!result.ok) { cancelQuietly(result.body); return {status:result.status}; } return {status:result.status,json:await readJson(result,32768)}; })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeout);})
    ]);
  } finally {clearTimeout(timer);}
}
function freshState() {return {ips:{},attempts:[],identities:{},members:{},notifications:[],requests:{}};}
function prune(s,now) {
  for(const [id,entry] of Object.entries(s.ips)) if(entry.every(t=>t<=now-60000)) delete s.ips[id];
  for(const [id,entry] of Object.entries(s.identities)) if(entry.until<=now) delete s.identities[id];
  for(const [id,time] of Object.entries(s.members)) if(time<=now-60000) delete s.members[id];
  for(const [token,r] of Object.entries(s.requests)) if(r.createdAt<=now-RETAIN) delete s.requests[token];
  s.attempts=s.attempts.filter(t=>t>now-60000);
  s.notifications=s.notifications.filter(t=>t>now-HOUR);
}
export class BankerRelay {
  constructor(ctx,env) {
    this.ctx=ctx; this.env=env; this.tail=Promise.resolve(); this.pending=0;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS relay_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    // Never delete idempotency tombstones: an old request ID can never become a new ping.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS request_ids (id TEXT PRIMARY KEY, owner INTEGER NOT NULL, token TEXT NOT NULL, fingerprint TEXT NOT NULL)');
  }
  fetch(request) {
    if(this.pending>=32) return Promise.resolve(response(request,{ok:false,error:{code:'BUSY',message:'Relay is busy.'},retryAfter:5},503));
    this.pending++;
    const job=this.tail.then(()=>this.handle(request)).catch(e=>errorResponse(request,e));
    this.tail=job.then(()=>{this.pending--;},()=>{this.pending--;});
    return job;
  }
  load() { const rows=this.ctx.storage.sql.exec('SELECT data FROM relay_state WHERE id=1').toArray(); return rows.length ? JSON.parse(rows[0].data) : freshState(); }
  save(s) {this.ctx.storage.sql.exec('INSERT INTO relay_state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(s));}
  async handle(request) {
    const url=new URL(request.url), origin=request.headers.get('Origin');
    if(url.protocol!=='https:') fail(400,'HTTPS','HTTPS is required.');
    if(origin && origin!==ORIGIN) fail(403,'ORIGIN','Origin is not allowed.');
    if(!PATHS.has(url.pathname) || url.search) fail(404,'ROUTE','Unknown route.');
    if(request.method==='OPTIONS') return response(request,{ok:true});
    if(request.method!=='POST') fail(405,'METHOD','POST is required.');
    const cfg=config(this.env), now=Date.now(), s=this.load(); prune(s,now);
    // Hash the platform-provided connecting IP; client-forwarded headers are never consulted.
    const ip=await digest(request.headers.get('CF-Connecting-IP') || 'missing');
    const attempts=(s.ips[ip] || []).filter(t=>t>now-60000);
    if(attempts.length>=10 || s.attempts.length>=30) {this.save(s);fail(429,'ATTEMPT_LIMIT','Too many attempts.',60);}
    attempts.push(now);s.ips[ip]=attempts;s.attempts.push(now);this.save(s);
    if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type') || '')) fail(415,'CONTENT_TYPE','JSON is required.');
    const body=await readJson(request,1024,2000);validate(url.pathname,body);
    const match=/^Bearer ([A-Za-z0-9]{16})$/.exec(request.headers.get('Authorization') || '');
    if(!match) fail(401,'AUTH','A valid Torn API key is required.');
    const hash=await digest(match[1]);let user=s.identities[hash]?.user;
    if(!user) {
      let basic,faction,stage='basic';
      try {
        const options={headers:{Authorization:'ApiKey '+match[1],Accept:'application/json'}};
        basic=await upstream('https://api.torn.com/v2/user/basic',options);
        if(basic.status!==200 || basic.json?.error) fail(401,'AUTH','Torn identity verification failed.');
        stage='faction';faction=await upstream('https://api.torn.com/v2/user/faction',options);
        if(faction.status!==200 || faction.json?.error) fail(401,'AUTH','Torn identity verification failed.');
      } catch(e) {console.warn('banker-verify',stage,verificationFailure(e));if(e instanceof Fault && e.code==='AUTH') throw e;fail(502,'TORN_UNAVAILABLE','Torn verification is unavailable.');}
      const profile=basic.json?.profile, factionId=faction.json?.faction?.id;
      if(!Number.isSafeInteger(profile?.id) || profile.id<=0 || typeof profile.name!=='string' || profile.name.length<1 || profile.name.length>100) {console.warn('banker-verify','profile-shape',!!profile,typeof profile?.id,typeof profile?.name);fail(502,'TORN_RESPONSE','Torn verification is unavailable.');}
      if(factionId!==cfg.factionId) fail(403,'FACTION','Configured faction membership is required.');
      user={id:profile.id,name:profile.name,factionId};
      // The proof age starts at verification start, so slow upstream calls never extend the 60s bound.
      s.identities[hash]={user,until:now+60000};this.save(s);
    }
    if(user.factionId!==cfg.factionId) fail(403,'FACTION','Configured faction membership is required.');
    if(url.pathname==='/v1/identity') return response(request,{ok:true,user,banker:cfg.bankers.includes(user.id)});
    if(url.pathname.endsWith('/resolve')) {
      const r=s.requests[body.token];
      if(!r) fail(404,'NOT_FOUND','Request is unavailable.');
      if(r.expiresAt<=Date.now()) fail(410,'EXPIRED','Request has expired.');
      if(r.userId!==user.id && !cfg.bankers.includes(user.id)) fail(403,'FORBIDDEN','Request access is not allowed.');
      return response(request,{ok:true,request:r});
    }
    const fingerprint=JSON.stringify({kind:body.kind,...(body.kind==='amount'?{amount:body.amount}:{})});
    const prior=this.ctx.storage.sql.exec('SELECT owner,token,fingerprint FROM request_ids WHERE id=?',body.requestId).toArray()[0];
    if(prior) {
      if(prior.owner!==user.id) fail(403,'FORBIDDEN','Request access is not allowed.');
      if(prior.fingerprint!==fingerprint) fail(409,'ID_CONFLICT','Request ID already has different content.');
      const existing=s.requests[prior.token];
      if(!existing || existing.expiresAt<=Date.now()) fail(410,'EXPIRED','Request has expired.');
      return response(request,{ok:true,request:existing,retryAfter:Math.max(0,Math.ceil((existing.createdAt+60000-Date.now())/1000))});
    }
    const at=Date.now();
    // Include in-flight and uncertain sends in every limit; never release reservations on failure.
    const recent=s.notifications.filter(t=>t>at-60000);
    const cooldown=s.members[user.id]===undefined?0:Math.max(0,Math.ceil((s.members[user.id]+60000-at)/1000));
    if(cooldown || recent.length>=10 || s.notifications.length>=100) fail(429,'COOLDOWN','Notification limit reached.',cooldown || (recent.length>=10?Math.max(1,Math.ceil((recent[0]+60000-at)/1000)):Math.max(1,Math.ceil((s.notifications[0]+HOUR-at)/1000))));
    const count=this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM request_ids').toArray()[0].n;
    if(count>=100000) fail(503,'CAPACITY','Relay needs administrator maintenance.');
    // Read only this authenticated member's own faction money, freshly for each new request.
    // Do not retain, return or log the money response (which contains other private wealth).
    let money;
    try {
      money=await upstream('https://api.torn.com/v2/user/money?timestamp='+Math.floor(Date.now()/1000),{headers:{Authorization:'ApiKey '+match[1],Accept:'application/json'}});
    } catch {fail(502,'BALANCE_UNAVAILABLE','Your faction balance could not be verified. Try again later.');}
    if(money.status===403 || money.json?.error?.code===7) fail(403,'BALANCE_PERMISSION','Your Torn API key needs User money permission to verify your faction balance.');
    const available=money.json?.money?.faction?.money;
    if(money.status!==200 || money.json?.error || !Number.isSafeInteger(available)) fail(502,'BALANCE_UNAVAILABLE','Your faction balance could not be verified. Try again later.');
    if(available<1) fail(409,'NO_BALANCE','You have no whole-dollar faction balance available to request.');
    if(body.kind==='amount' && body.amount>available) fail(409,'OVER_BALANCE','The requested amount exceeds your available faction balance.');
    const token=crypto.randomUUID(), r={token,requestId:body.requestId,userId:user.id,name:user.name,factionId:user.factionId,kind:body.kind,...(body.kind==='amount'?{amount:body.amount}:{}),createdAt:at,expiresAt:at+2*HOUR,status:'uncertain'};
    s.requests[token]=r;s.members[user.id]=at;s.notifications.push(at);
    this.ctx.storage.transactionSync(()=>{this.ctx.storage.sql.exec('INSERT INTO request_ids(id,owner,token,fingerprint) VALUES(?,?,?,?)',body.requestId,user.id,token,fingerprint);this.save(s);});
    // Reservation and an uncertain result are durable before Discord receives anything.
    const safeName=user.name.replace(/[^A-Za-z0-9 _.-]/g,'').slice(0,100) || 'Member';
    const link=ORIGIN+'/factions.php?step=your&type=1#/tab=controls&bankRequest='+token;
    const content=cfg.roles.map(id=>'<@&'+id+'>').join(' ')+'\n'+safeName+' ['+user.id+'] requested '+(body.kind==='full'?'full faction balance':'$'+body.amount.toLocaleString('en-US'))+'.\n'+link;
    try {
      const delivery=await upstream(cfg.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[],roles:cfg.roles,users:[]}})},8000);
      if(delivery.status===200 && typeof delivery.json?.id==='string' && /^[0-9]{17,20}$/.test(delivery.json.id)) r.status='sent';
      else if(delivery.status>=400 && delivery.status<500) r.status='failed';
    } catch { /* Delivery cannot be proved: retain durable uncertain, with no retry. */ }
    this.save(s);
    return response(request,{ok:true,request:r,retryAfter:60});
  }
}
export default {
  async fetch(request,env) {
    try {
      const cfg=config(env);
      return await env.BANKER_RELAY.get(env.BANKER_RELAY.idFromName('faction:'+cfg.factionId)).fetch(request);
    } catch(e) {return errorResponse(request,e);}
  }
};
