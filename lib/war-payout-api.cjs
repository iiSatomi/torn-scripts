'use strict';
const {WarPayoutDomain} = require('./war-payout-domain.cjs');

// Caller owns credentials and HTTP transport. Only fixed paths and sanitized
// cursor parameters cross that boundary; API links are never fetched directly.
const WarPayoutAPI = (() => {
  const fail = message => { throw new Error(message); };
  const publicErrors=new WeakSet();
  // Only errors deliberately constructed by the private calculator transport
  // carry user-facing text. Raw network/server exception messages stay redacted.
  function requestError(message){const error=new Error(message);publicErrors.add(error);return error;}
  const whole = (value,positive=false) => Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
  const player = value => value && typeof value === 'object' && !Array.isArray(value) && whole(value.id,true) &&
    (value.faction === null || (value.faction && typeof value.faction === 'object' && whole(value.faction.id)));
  function abortError() { const error=new Error('Loading cancelled.');error.name='AbortError';return error; }
  function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
  function wait(ms,signal) {
    checkAbort(signal);
    if (!ms) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let timer;
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      const abort=()=>{cleanup();reject(abortError());};
      timer=setTimeout(()=>{cleanup();resolve();},ms);
      signal?.addEventListener('abort',abort,{once:true});
      if (signal?.aborted) abort();
    });
  }
  function cursor(link,scope,upper) {
    let url;
    try {url=new URL(link);} catch {fail('Invalid pagination link.');}
    if (url.origin !== 'https://api.torn.com' || url.pathname !== '/v2/faction/attacks' ||
        url.username || url.password || url.hash) fail('Invalid pagination link.');
    const approved=new Set(['from','to','sort','limit','key','comment','timestamp']);
    const seen=new Set();
    for (const [key] of url.searchParams) {
      if (!approved.has(key) || seen.has(key)) fail('Invalid pagination parameters.');
      seen.add(key);
    }
    const integerParam=key=>{
      const raw=url.searchParams.get(key);
      if (raw === null || !/^\d+$/.test(raw)) fail('Invalid pagination parameters.');
      const value=Number(raw);
      if (!whole(value)) fail('Invalid pagination parameters.');
      return value;
    };
    // An API page may decorate its link with key/comment/timestamp. They never
    // leave this parser. Restore all filters from the original selected scope.
    if (url.searchParams.has('from') && integerParam('from') !== scope.start-1) fail('Changed pagination lower bound.');
    if (url.searchParams.has('sort') && url.searchParams.get('sort').toUpperCase() !== 'DESC') fail('Changed pagination sort.');
    if (url.searchParams.has('limit') && integerParam('limit') !== 100) fail('Changed pagination page limit.');
    const to=integerParam('to');
    if (to >= upper || to < scope.start-1) fail('Stalled or out-of-range pagination.');
    return {from:scope.start-1,to,sort:'DESC',limit:100};
  }
  function createClient({request,delayMs=700,maxPages=250}={}) {
    if (typeof request !== 'function') fail('A private API transport is required.');
    if (!whole(delayMs) || delayMs > 60000) fail('Invalid request pacing.');
    if (!whole(maxPages,true) || maxPages > 250) fail('Page limit must be between 1 and 250.');
    let lastRequest=0;
    async function fetch(path,params,signal) {
      checkAbort(signal);
      await wait(lastRequest ? Math.max(0,delayMs-(Date.now()-lastRequest)) : 0,signal);
      checkAbort(signal);
      lastRequest=Date.now();
      let data;
      try {data=await request(path,{...params},signal);}
      catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw abortError();
        if (publicErrors.has(error)) throw error;
        fail('API request failed. Check key permissions and try again.');
      }
      checkAbort(signal);
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) fail('API response data is unavailable.');
      return data;
    }
    async function listWars(signal) {
      const basic=await fetch('/faction/basic',{},signal);
      const factionId=basic.basic?.id;
      if (!whole(factionId,true)) fail('Faction response data is unavailable.');
      const data=await fetch('/faction/rankedwars',{limit:100},signal);
      if (!Array.isArray(data.rankedwars)) fail('Ranked war response data is unavailable.');
      const ids=new Set();
      const wars=data.rankedwars.map(raw=>{
        if (!raw || !whole(raw.id,true) || ids.has(raw.id) || !whole(raw.start,true) || !whole(raw.end) ||
            (raw.end !== 0 && raw.end < raw.start) || !Array.isArray(raw.factions) || raw.factions.length !== 2) {
          fail('Invalid ranked war response data.');
        }
        ids.add(raw.id);
        const ours=raw.factions.find(faction=>faction?.id === factionId);
        const opponent=raw.factions.find(faction=>faction?.id !== factionId);
        if (!ours || !opponent || !whole(opponent.id,true) || typeof opponent.name !== 'string') fail('Invalid ranked war faction data.');
        return {warId:raw.id,factionId,opponentId:opponent.id,opponentName:opponent.name,start:raw.start,end:raw.end};
      });
      return {factionId,wars};
    }
    async function rewardCaches(scope,signal) {
      try {
        const data=await fetch(`/faction/${scope.warId}/rankedwarreport`,{},signal);
        const factions=data.rankedwarreport?.factions;
        if (!Array.isArray(factions)) return [];
        const items=factions.find(faction=>faction?.id === scope.factionId)?.rewards?.items;
        if (!Array.isArray(items)) return [];
        if (items.length > 100 || items.some(item=>!item || !whole(item.id,true) ||
          !whole(item.quantity) || typeof item.name !== 'string')) return [];
        return items.map(({id,name,quantity})=>({id,name,quantity,price:0}));
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw abortError();
        // Rewards are an optional convenience; zero prices remain explicit
        // manual assumptions. Primary attack failures never enter this path.
        return [];
      }
    }
    async function loadWar(war,signal,onProgress) {
      checkAbort(signal);
      if (!war || !whole(war.warId,true) || !whole(war.factionId,true) || !whole(war.opponentId,true) ||
          war.factionId === war.opponentId || !whole(war.start,true) || !whole(war.end)) fail('A valid selected war is required.');
      const live=war.end === 0;
      const scope={warId:war.warId,factionId:war.factionId,opponentId:war.opponentId,start:war.start,
        end:live ? Math.floor(Date.now()/1000) : war.end};
      if (scope.end < scope.start) fail('Invalid selected war window.');
      const aggregator=WarPayoutDomain.createAggregator(scope), seenIds=new Set(), seenCursors=new Set();
      let params={from:scope.start-1,to:scope.end,sort:'DESC',limit:100}, pages=0;
      while (true) {
        const data=await fetch('/faction/attacks',params,signal);
        const attacks=data.attacks, links=data._metadata?.links;
        if (!Array.isArray(attacks) || attacks.length > 100 || !links || typeof links !== 'object' ||
            Array.isArray(links) || ['next','prev'].some(key=>!Object.prototype.hasOwnProperty.call(links,key)||
              (links[key]!==null&&typeof links[key]!=='string'))) fail('Invalid attack page response data.');
        // Torn's live DESC response uses prev to move to older attacks. next
        // points back toward newer records and must never terminate/drive this scan.
        const older=links.prev;
        let fresh=0;
        for (const attack of attacks) {
          if (!whole(attack?.id,true) || !whole(attack.ended) || typeof attack.result !== 'string' ||
              (attack.attacker !== null && !player(attack.attacker)) || !player(attack.defender)) fail('Invalid attack response data.');
          if (!seenIds.has(attack.id)) {seenIds.add(attack.id);fresh++;}
        }
        if ((pages > 0 && attacks.length > 0 && fresh === 0) || (older !== null && fresh === 0)) fail('Stalled pagination data.');
        try {aggregator.add(attacks);} catch {fail('Invalid attack response data.');}
        pages++;
        if (typeof onProgress === 'function') {
          try {onProgress({pages});} catch {fail('Loading progress failed.');}
        }
        checkAbort(signal);
        if (older === null) break;
        const nextParams=cursor(older,scope,params.to);
        if (seenCursors.has(nextParams.to)) fail('Repeated pagination cursor.');
        seenCursors.add(nextParams.to);
        if (pages >= maxPages) fail('Attack page limit reached. Select a smaller or more recent war.');
        params=nextParams;
      }
      if (seenIds.size === 0) fail('No attack logs are available for this war. Use expected counts for a planning estimate.');
      const caches=live ? [] : await rewardCaches(scope,signal);
      checkAbort(signal);
      return {scope,...aggregator.snapshot(),pages,scanned:seenIds.size,live,coverageStatus:'unverified',
        coverage:live ? 'Available attack-log draft — completeness unverified; provisional counts so far' :
          'Available attack-log draft — completeness unverified',caches};
    }
    return {listWars,loadWar};
  }
  return {createClient,requestError};
})();

module.exports = {WarPayoutAPI};
