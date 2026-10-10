// ==UserScript==
// @name         Torn OC Suite (Rebuild)
// @namespace    torn_oc_suite_rebuild
// @version      3.37.0-ui62-loader
// @description  Dev loader: runs the working copy of Torn_OC_Suite_PurrfectCrime.user.js straight off disk via @require, so local edits go live on refresh with no copy-paste step.
// @author       iSatomi (3580191)
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      ffscouter.com
// @connect      api.torn.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @require      file:///C:/Users/asato/Desktop/Game%20Stuff/Torn%20Scripts/Torn_OC_Suite_PurrfectCrime.user.js
// ==/UserScript==
//
// WHY THIS EXISTS
// ---------------
// The OC Suite is ~1.2 MB / 20k lines. Pushing it through the Tampermonkey MCP
// bridge means re-transmitting the whole file for every change, which is slow
// and risks corrupting a working script. This loader sidesteps that entirely:
// the @require above reads the file off disk on each page load, so "deploy" is
// just saving the file in your editor and hitting refresh.
//
// DELIBERATE OMISSIONS
// --------------------
// - No @downloadURL / @updateURL. The real script carries greasyfork update
//   URLs; copying them here would let Tampermonkey auto-update this loader and
//   overwrite it with the published build, silently killing the dev loop.
// - No script body. @require content executes before the body, so the suite has
//   already run by the time the line below is reached.
//
// REQUIREMENTS
// ------------
// 1. Tampermonkey extension details -> "Allow access to file URLs" must be ON.
//    Without it the @require silently resolves to nothing and no panel appears.
// 2. The original "Torn OC Suite (Rebuild)" script must be DISABLED, or both
//    copies run on factions.php: duplicate panels and doubled API calls.
// 3. If edits stop showing up, Tampermonkey caches externals -- set
//    Settings -> Externals update interval to "Always".

console.debug('[OC Suite] dev loader active - source is the on-disk working copy');
