// Capture granted APIs from the userscript scope; managers need not put them on
// page window/globalThis. Only advertise native capabilities that actually exist.
function getHubPlatformEnvironment() {
  const env={crypto:globalThis.crypto};
  if(typeof GM_info!=='undefined')env.GM_info=GM_info;
  if(typeof GM_getValue==='function')env.GM_getValue=GM_getValue;
  if(typeof GM_setValue==='function')env.GM_setValue=GM_setValue;
  if(typeof GM_deleteValue==='function')env.GM_deleteValue=GM_deleteValue;
  if(typeof GM!=='undefined')env.GM=GM;
  for(const name of ['PDA_storage','flutter_inappwebview','__PDA_platformReadyPromise','PDA_getTabState','PDA_httpGet','__tornpda'])if(globalThis[name])env[name]=globalThis[name];
  return env;
}
module.exports = { getHubPlatformEnvironment };
