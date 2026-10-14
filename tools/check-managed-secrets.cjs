'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function validatePath(file) {
  if (typeof file !== 'string' || file.includes('\\') || path.posix.isAbsolute(file) || file.split('/').some(part => !part || part === '.' || part === '..') ||
      /(?:^|\/)(?:archive|captures?|screenshots?|node_modules|\.git|\.env[^/]*|[^/]*profile[^/]*)(?:\/|$)/i.test(file) ||
      /(?:storage[-_]?state|cookies?|session[-_]?data|credentials?\.json)/i.test(file) || !/\.(?:cjs|js|json|md|yml)$/.test(file)) {
    throw new Error('Disallowed publication path');
  }
  return true;
}

function scanText(file, source) {
  const rules = [
    ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['private key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g],
    ['credential literal', /["']?\b(?:api_?key|torn_?api_?key|(?:personal|shared)(?:_?api)?_?key|access_?token|auth_?token|client_?secret)\b["']?\s*[:=]\s*["'`]([^"'`\r\n]{16,})["'`]/gi],
    ['password literal', /["']?\bpassword\b["']?\s*[:=]\s*["'`]([^"'`\r\n]+)["'`]/gi],
    ['Torn key in URL', /[?&](?:key|api_?key)=([A-Za-z0-9]{16})(?=[^A-Za-z0-9]|$)/gi],
    ['authorization literal', /\b(?:Bearer|Basic) [A-Za-z0-9_+\/.=-]{20,}/g],
  ];
  const findings = [];
  for (const [rule, pattern] of rules) {
    for (const match of source.matchAll(pattern)) {
      findings.push({ file, line: source.slice(0, match.index).split('\n').length, rule });
    }
  }
  return findings;
}

function formatFindings(findings) {
  // Never include matched text, nearby source, or values in diagnostics.
  return findings.map(item => item.file + ':' + item.line + ': ' + item.rule).join('\n');
}

function scanFiles(workspace = root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, 'tools/managed-publication-files.json'), 'utf8'));
  const findings = [];
  let count = 0;
  for (const file of [...manifest.sourceFiles, ...manifest.generatedFiles]) {
    validatePath(file);
    const absolute = path.join(workspace, file);
    if (!fs.existsSync(absolute) && manifest.generatedFiles.includes(file)) continue;
    // Reject links that could read private files outside the selected tree.
    if (fs.realpathSync(absolute) !== path.resolve(absolute)) throw new Error('Publication symlink refused');
    const source = fs.readFileSync(absolute, 'utf8');
    if (source.includes('\u0000')) throw new Error('Binary publication file refused');
    findings.push(...scanText(file, source));
    count++;
  }
  if (findings.length) throw new Error('Publication blocked by secret checks:\n' + formatFindings(findings));
  return count;
}

if (require.main === module) {
  try { console.log('PASS secret checks for ' + scanFiles() + ' allowlisted publication files'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { scanText, validatePath, formatFindings, scanFiles };
