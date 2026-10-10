// Launches a SEPARATE Brave instance with a dedicated debug profile + CDP port.
// Does not touch the user's real Brave profile. Log into Torn in this window once;
// the session persists in the debug profile dir for future test runs.
const { spawn } = require('child_process');
const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PROFILE = 'C:\\Users\\asato\\tools\\brave-debug-profile';
const PORT = 9222;
const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-popup-blocking',
  // Keep the dedicated test window on the primary monitor at a usable size.
  // (0,0) is the top-left origin of monitor 1 on the test machine.
  '--window-position=0,0',
  '--window-size=1920,1080',
  'https://www.torn.com/factions.php?step=your&type=1#/tab=crimes',
];
const child = spawn(BRAVE, args, { detached: true, stdio: 'ignore' });
child.unref();
console.log(`Launched debug Brave (pid ${child.pid}) on CDP port ${PORT}`);
console.log(`Profile: ${PROFILE}`);
