'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const browser = process.argv.includes('--browser');
let passed = 0;

function run(args) {
  console.log('\n> node ' + args.join(' '));
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Failed: node ' + args.join(' '));
  passed++;
}

try {
  run(['tools/check-managed-secrets.cjs']);
  run(['test/managed-secrets.test.cjs']);
  console.log('Managed scope: Torn Script Hub and standalone War Payout Calculator, including their shared modules.');
  console.log('Other consumer working-copy integration/binding and appearance tests remain separate; they are not verified by this release check.');
  for (const dir of ['script-hub/src', 'lib']) {
    for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
      if (/\.(?:cjs|js)$/.test(name) && (dir !== 'lib' || name.startsWith('war-payout-'))) run(['--check', dir + '/' + name]);
    }
  }
  for (const file of [
    'script-hub/dist/Torn_Script_Hub.user.js',
    'script-hub/dist/Torn_Script_Hub.meta.js',
    'Torn_War_Payout_Calculator.user.js',
    'Torn_War_Payout_Calculator.meta.js',
  ]) run(['--check', file]);

  const separateConsumerTests = new Set(['script-hub-bindings.test.cjs', 'script-hub-integrations.test.cjs']);
  for (const name of fs.readdirSync(path.join(root, 'script-hub/test')).sort()) {
    if (/\.test\.(?:cjs|js)$/.test(name) && !separateConsumerTests.has(name)) run(['script-hub/test/' + name]);
  }
  run(['tools/check-war-payout.cjs']);
  run(['test/userscript-releases.test.cjs']);

  if (browser) {
    for (const name of ['script-hub-launcher.cjs','script-hub-launch-design.cjs', 'script-hub-themes.cjs', 'script-hub-theme-interactions.cjs', 'script-hub-ui-kit.cjs']) run(['script-hub/test/browser/' + name]);
    // Keep the full payout runner as the authority for its eight browser variants.
    run(['tools/check-war-payout.cjs', '--browser']);
  }
  console.log('\nPASS ' + passed + ' managed syntax/test commands' + (browser ? ', including Chromium-compatible browser checks.' : '.'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
