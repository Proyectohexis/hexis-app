'use strict';

const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(manifest.dependencies || {}),
  ...Object.keys(manifest.devDependencies || {}),
]);
const ignoredDirectories = new Set(['.git', '.expo', 'dist', 'node_modules']);

function collect(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) collect(absolute, files);
    else if (/\.(?:js|cjs|mjs)$/.test(entry)) files.push(absolute);
  }
  return files;
}

function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null;
  }
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

const patterns = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const missing = [];

for (const file of collect(root)) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const dependency = packageName(match[1]);
      if (dependency && !declared.has(dependency)) {
        missing.push(`${relative(root, file)} → ${dependency}`);
      }
    }
  }
}

if (missing.length) {
  console.error(`Imports sin declarar:\n${[...new Set(missing)].join('\n')}`);
  process.exit(1);
}

console.log('Todos los imports externos están declarados.');
