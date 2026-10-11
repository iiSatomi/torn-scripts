#!/usr/bin/env node
/**
 * Dev server for the Torn OC Suite loader.
 *
 * Serves the working copy over http://127.0.0.1:8787/oc-suite.js so the
 * userscript loader can fetch it with GM_xmlHttpRequest. This exists because
 * Tampermonkey refuses file:// reads from GM_xmlHttpRequest even with both the
 * browser's "Allow access to file URLs" and Tampermonkey's own local-file
 * setting enabled (upstream issue #754). http://localhost has no such gate.
 *
 * The file is read fresh on every request and served no-store, so there is no
 * caching layer anywhere: save the file, refresh the page, run the new code.
 *
 *   node dev-server.cjs            # default port 8787
 *   node dev-server.cjs 9100       # custom port
 *
 * Binds to 127.0.0.1 only -- not reachable from the network.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8787;
const HOST = '127.0.0.1';
const FILE = path.resolve(__dirname, '..', 'Torn_OC_Suite_Codex.user.js');
const ROUTE = '/oc-suite.js';

const stamp = () => new Date().toISOString().slice(11, 19);

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];

  if (url !== ROUTE && url !== '/Torn_OC_Suite_Codex.user.js') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found - the suite is served at ' + ROUTE + '\n');
    return;
  }

  fs.readFile(FILE, 'utf8', (err, src) => {
    if (err) {
      console.error(`[${stamp()}] READ FAIL ${err.code} ${FILE}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('could not read source: ' + err.code + '\n');
      return;
    }

    const version = (src.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1] || 'unknown';

    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      // No caching anywhere in the chain -- the whole point is that a save is
      // immediately live on the next page load.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'X-OC-Suite-Version': version,
    });
    res.end(src);
    console.log(`[${stamp()}] served ${version}  ${src.length} bytes`);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use -- either the server is already `
                + `running, or pass a different port: node dev-server.cjs 9100`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  if (!fs.existsSync(FILE)) {
    console.warn(`WARNING: ${FILE} does not exist yet - requests will 500 until it does`);
  }
  console.log(`OC Suite dev server -> http://${HOST}:${PORT}${ROUTE}`);
  console.log(`serving ${FILE}`);
  console.log('save the file, refresh factions.php, done. ctrl-c to stop.');
});
