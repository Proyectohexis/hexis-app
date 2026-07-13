'use strict';

const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const maxTextFileBytes = 2 * 1024 * 1024;
const reportArgumentIndex = process.argv.indexOf('--report');
const reportPath = reportArgumentIndex >= 0 ? process.argv[reportArgumentIndex + 1] : null;

if (reportArgumentIndex >= 0 && !reportPath) {
  throw new Error('--report requiere una ruta de salida.');
}

// Deliberately high-confidence signatures. Keep this list narrow: a false-positive-prone
// entropy scanner belongs in a dedicated, version-pinned security tool, not in this gate.
const rules = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  // [K] preserves the signature while preventing the scanner from matching its own source.
  { id: 'pgp-private-key', pattern: /-----BEGIN PGP PRIVATE KEY BLOC[K]-----/g },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g },
  { id: 'gitlab-token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'google-api-key', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { id: 'google-oauth-secret', pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'openai-api-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'stripe-secret-key', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'supabase-secret-key', pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  {
    id: 'json-web-token',
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  },
];

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean);
}

function lineForOffset(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

const findings = [];
const skipped = [];
let scannedFiles = 0;
let scannedBytes = 0;

for (const trackedPath of trackedFiles()) {
  const absolutePath = join(root, trackedPath);
  const size = statSync(absolutePath).size;
  if (size > maxTextFileBytes) {
    skipped.push({ path: trackedPath, reason: 'larger-than-2-mib', bytes: size });
    continue;
  }

  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) {
    skipped.push({ path: trackedPath, reason: 'binary', bytes: size });
    continue;
  }

  const content = buffer.toString('utf8');
  scannedFiles += 1;
  scannedBytes += size;

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      findings.push({
        path: trackedPath,
        line: lineForOffset(content, match.index),
        rule: rule.id,
      });
    }
  }
}

const report = {
  schemaVersion: 1,
  scope: 'tracked-text-files-current-revision',
  scannedFiles,
  scannedBytes,
  skipped,
  findings,
};

if (reportPath) {
  const absoluteReportPath = isAbsolute(reportPath) ? reportPath : join(root, reportPath);
  mkdirSync(dirname(absoluteReportPath), { recursive: true });
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Reporte: ${relative(root, absoluteReportPath)}`);
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line} [${finding.rule}] posible secreto; valor oculto`);
  }
  console.error(`Secret scan FAIL: ${findings.length} hallazgo(s) de alta confianza.`);
  process.exit(1);
}

console.log(
  `Secret scan PASS: ${scannedFiles} archivos versionados (${scannedBytes} bytes), `
  + `${skipped.length} binarios/grandes omitidos.`,
);
