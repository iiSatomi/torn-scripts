'use strict';
function createBankerHttp(env){
  const paths=new Set(['/v1/identity','/v1/requests','/v1/requests/resolve']);
  const messages={AUTH:'The Torn key could not be verified.',FACTION:'This account is not in the configured faction.',FORBIDDEN:'This account is not authorized for that request.',DISABLED:'The faction request service is disabled.',CONFIG:'The faction request service needs administrator setup.',EXPIRED:'This request link has expired.',NOT_FOUND:'This request is unavailable.',ID_CONFLICT:'This request ID has different content. Review the previous request.',COOLDOWN:'Please wait before sending another request.',ATTEMPT_LIMIT:'Too many connection attempts. Wait a minute.',CAPACITY:'The faction request service needs administrator maintenance.',TORN_UNAVAILABLE:'Torn verification is temporarily unavailable.',TORN_RESPONSE:'Torn verification is temporarily unavailable.',BODY_SIZE:'The request was too large.',NO_BALANCE:'You have no whole-dollar faction balance available to request.',OVER_BALANCE:'The requested amount exceeds your available faction balance.',BALANCE_PERMISSION:'Your Torn API key needs User money permission to check your faction balance. Update the key in Script Hub or Connection.',BALANCE_UNAVAILABLE:'Your faction balance could not be verified. Nothing was sent. Try again later.'};
  let current=null;
  function abort(){current?.();}
  function post(endpoint,key,path,body){
    if(current)return Promise.reject(new Error('Another request is running.'));
    if(!paths.has(path)||!/^https:\/\//.test(endpoint)||!/^[A-Za-z0-9]{16}$/.test(key))return Promise.reject(new Error('Configure a valid relay and personal Torn key first.'));
    return new Promise((resolve,reject)=>{
      let finished=false,timer=null,handle=null,controller=null;
      const finish=(error,data)=>{if(finished)return;finished=true;clearTimeout(timer);current=null;error?reject(error):resolve(data);};
      const stop=message=>{finish(new Error(message));try{handle?.abort?.();controller?.abort();}catch(_){}};
      current=()=>stop('Request cancelled. A submitted request may already have reached Discord.');
      timer=setTimeout(()=>stop('Connection timed out. Check the same request before trying again.'),35000);
      const options={method:'POST',url:endpoint+path,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},data:JSON.stringify(body),timeout:35000,anonymous:true,redirect:'error',
        onload(response){
          if(finished)return;
          try{
            if(response.finalUrl&&new URL(response.finalUrl).origin!==new URL(endpoint).origin)throw new Error('Relay redirect was refused.');
            if(typeof response.responseText!=='string'||response.responseText.length>16384)throw new Error('The relay returned an invalid response.');
            let data;try{data=JSON.parse(response.responseText);}catch(_){throw new Error('The relay returned an invalid response.');}
            if(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true||response.status<200||response.status>=300){const error=new Error(messages[data?.error?.code]||'The request service is temporarily unavailable.');error.code=Object.hasOwn(messages,data?.error?.code)?data.error.code:'UNAVAILABLE';error.retryAfter=Number.isInteger(data?.retryAfter)?Math.min(3600,Math.max(0,data.retryAfter)):0;finish(error);return;}
            finish(null,data);
          }catch(error){finish(error);}
        },
        onerror(){finish(new Error('Connection failed. Check the same request before trying again.'));},
        ontimeout(){stop('Connection timed out. Check the same request before trying again.');},
        onabort(){finish(new Error('Request cancelled.'));},
      };
      try{
        const gm=typeof env.GM_xmlhttpRequest==='function'?env.GM_xmlhttpRequest:typeof env.GM?.xmlHttpRequest==='function'?env.GM.xmlHttpRequest.bind(env.GM):null;
        if(gm){handle=gm(options);handle?.catch?.(()=>options.onerror());}
        else if(typeof env.PDA_httpPost==='function')Promise.resolve(env.PDA_httpPost(options.url,options.headers,options.data)).then(options.onload,options.onerror);
        else if(typeof env.fetch==='function'){
          controller=new AbortController();env.fetch(options.url,{method:'POST',headers:options.headers,body:options.data,credentials:'omit',redirect:'error',signal:controller.signal}).then(async r=>options.onload({status:r.status,responseText:await r.text(),finalUrl:r.url}),options.onerror).catch(options.onerror);
        }else finish(new Error('No supported HTTP transport. Enable userscript HTTP permissions or update Torn PDA.'));
      }catch(_){options.onerror();}
    });
  }
  return {post,abort};
}
module.exports={createBankerHttp};
