// Launches Opera (Chromium-based) with a dedicated debug profile + CDP port 9222,
// so the puppeteer-core harness scripts (which call puppeteer.connect to
// http://127.0.0.1:9222) can attach. Does not touch your normal Opera profile.
// Log into Torn in this window once; the session persists in the debug profile dir.
//
// Usage:  node test/browser/launch-debug-opera.cjs
// Override the browser path if auto-detection misses it:
//   set OPERA_EXE=C:\path\to\opera.exe  &&  node test/browser/launch-debug-opera.cjs
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const PF = process.env['ProgramFiles'] || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

// Opera's top-level opera.exe / launcher.exe is a stub that starts the newest
// versioned binary; if only versioned folders exist we glob for opera.exe.
function globVersioned(root) {
  try {
    return fs.readdirSync(root)
      .map(d => path.join(root, d, 'opera.exe'))
      .filter(p => fs.existsSync(p));
  } catch { return []; }
}

const candidates = [
  process.env.OPERA_EXE,
  path.join(LOCAL, 'Programs', 'Opera', 'opera.exe'),
  path.join(LOCAL, 'Programs', 'Opera', 'launcher.exe'),
  path.join(PF, 'Opera', 'opera.exe'),
  path.join(PF, 'Opera', 'launcher.exe'),
  path.join(PF86, 'Opera', 'launcher.exe'),
  // Opera GX, if that's what's installed
  path.join(LOCAL, 'Programs', 'Opera GX', 'opera.exe'),
  path.join(LOCAL, 'Programs', 'Opera GX', 'launcher.exe'),
  ...globVersioned(path.join(LOCAL, 'Programs', 'Opera')),
  ...globVersioned(path.join(LOCAL, 'Programs', 'Opera GX')),
].filter(Boolean);

const OPERA = candidates.find(p => fs.existsSync(p));
if (!OPERA) {
  console.error('Could not find Opera. Set OPERA_EXE to your opera.exe, e.g.:');
  console.error('  set OPERA_EXE=C:\\Users\\<you>\\AppData\\Local\\Programs\\Opera\\opera.exe');
  console.error('Checked:\n' + candidates.map(c => '  ' + c).join('\n'));
  process.exit(1);
}

const PORT = 9222;
const PROFILE = path.join(os.homedir(), 'tools', 'opera-debug-profile');
const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-popup-blocking',
  '--window-position=0,0',
  '--window-size=1280,800',
  'https://www.torn.com/gym.php',
];
const child = spawn(OPERA, args, { detached: true, stdio: 'ignore' });
child.unref();
console.log(`Launched debug Opera (pid ${child.pid}) on CDP port ${PORT}`);
console.log(`Browser: ${OPERA}`);
console.log(`Profile: ${PROFILE}`);
