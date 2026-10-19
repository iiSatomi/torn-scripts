'use strict';

function createWarContractsHttp(env) {
  const pending = new Set();
  function rejection(raw, status) {
    const url = new URL(raw);
    const code = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 'unknown';
    const provider = url.hostname === 'ffscouter.com' ? 'FFScouter' : url.hostname === 'script.google.com' ? 'Contracts sheet service' :
      url.pathname.endsWith('/battlestats') ? 'Torn battle stats' : url.pathname.endsWith('/equipment') ? 'Torn equipment' :
      url.pathname.endsWith('/members') ? 'Torn faction roster' : 'Torn account verification';
    const advice = status === 429 ? 'Wait a minute before trying again.' :
      provider === 'FFScouter' && status === 401 ? 'Use a registered key at ffscouter.com. Check the assigned FFScouter key in Hub API Keys, or your personal fallback in Connection.' :
      provider === 'FFScouter' ? 'Check your key and access at ffscouter.com.' :
      provider === 'Contracts sheet service' ? 'Check the deployment address and its access permissions.' : 'Check your Torn key permissions.';
    return new Error(provider + ' rejected this request (HTTP ' + code + '). ' + advice);
  }
  function supported(raw) {
    let url; try { url = new URL(raw); } catch (_) { return false; }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) return false;
    if (url.hostname === 'api.torn.com') return /^\/v2\/(key\/info|user\/(battlestats|equipment)|faction\/[1-9]\d*\/members)$/.test(url.pathname);
    if (url.hostname === 'ffscouter.com') return url.pathname === '/api/v1/get-stats';
    return url.hostname === 'script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) && !url.search;
  }
  function json(url, options = {}) {
    if (!supported(url)) return Promise.reject(new Error('This address is not a supported service.'));
    let body; try { body = options.body === undefined ? undefined : JSON.stringify(options.body); } catch (_) { return Promise.reject(new Error('Invalid request.')); }
    if (body && body.length > 16384) return Promise.reject(new Error('The request is too large.'));
    return new Promise((resolve, reject) => {
      let finished = false, handle, timer;
      const end = (error, value) => {
        if (finished) return; finished = true; clearTimeout(timer); pending.delete(stop);
        if (error) reject(error); else resolve(value);
      };
      const stop = () => { end(new Error('Request cancelled. Refresh Current Contracts before trying again.')); try { handle?.abort?.(); } catch (_) {} };
      pending.add(stop);
      const params = {
        method: options.method || 'GET', url, headers: options.headers || {}, data: body,
        anonymous: true, timeout: 25000, redirect: new URL(url).hostname === 'script.google.com' ? 'follow' : 'error',
        onload(response) {
          if (finished) return;
          try {
            if (response.finalUrl) {
              const original = new URL(url), final = new URL(response.finalUrl);
              const googleOutput = original.hostname === 'script.google.com' && final.hostname === 'script.googleusercontent.com' && final.protocol === 'https:' && !final.username && !final.password && !final.port;
              if (final.origin !== original.origin && !googleOutput) throw new Error('Unexpected service redirect was refused.');
            }
            if (response.status < 200 || response.status >= 300) throw rejection(url, response.status);
            if (typeof response.responseText !== 'string' || response.responseText.length > 1048576) throw new Error('The service response was too large.');
            let data; try { data = JSON.parse(response.responseText); } catch (_) { throw new Error('The service did not return JSON. Check the deployment address and access.'); }
            if (!data || typeof data !== 'object') throw new Error('The service returned an invalid response.');
            end(null, data);
          } catch (error) { end(error); }
        },
        onerror() { end(new Error('Connection failed. Refresh Current Contracts before retrying a submitted action.')); },
        ontimeout() { end(new Error('Connection timed out. Refresh Current Contracts to check whether the action was saved.')); try { handle?.abort?.(); } catch (_) {} },
        onabort() { end(new Error('Request cancelled. Refresh Current Contracts before trying again.')); },
      };
      timer = setTimeout(params.ontimeout, 26000);
      try {
        const gm = typeof env.GM_xmlhttpRequest === 'function' ? env.GM_xmlhttpRequest : env.GM?.xmlHttpRequest?.bind(env.GM);
        if (gm) { handle = gm(params); handle?.catch?.(() => params.onerror()); }
        else {
          const native = params.method === 'POST' ? env.PDA_httpPost : env.PDA_httpGet;
          if (typeof native !== 'function') throw new Error('No userscript HTTP transport. Enable HTTP grants or update Torn PDA.');
          Promise.resolve(params.method === 'POST' ? native(url, params.headers, body) : native(url, params.headers)).then(params.onload, params.onerror);
        }
      } catch (error) { end(error.message?.startsWith('No userscript') ? error : new Error('The request could not be started.')); }
    });
  }
  return { json, abort() { for (const stop of [...pending]) stop(); } };
}
if (typeof module !== 'undefined') module.exports = {createWarContractsHttp};
