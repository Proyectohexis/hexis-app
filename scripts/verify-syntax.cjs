'use strict';

const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const { parse } = require('@babel/parser');

const root = join(__dirname, '..');
const ignoredDirectories = new Set(['.git', '.expo', 'dist', 'node_modules']);
const extensions = ['.js', '.cjs', '.mjs'];

function collect(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      collect(absolute, files);
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      files.push(absolute);
    }
  }
  return files;
}

const files = collect(root);
const failures = [];

for (const file of files) {
  try {
    parse(readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: ['jsx'],
    });
  } catch (error) {
    failures.push({ file: relative(root, file), output: error.message });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\n${failure.file}\n${failure.output}`);
  }
  process.exit(1);
}

console.log(`Sintaxis válida: ${files.length} archivos.`);
