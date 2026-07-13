'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const functionsRoot = path.join(root, 'supabase', 'functions');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function edgeFunctionEntryPoints() {
  return fs.readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => path.join(functionsRoot, entry.name, 'index.ts'))
    .filter((entry) => fs.existsSync(entry));
}

test('cada Edge Function está incluida explícitamente en check y lint', () => {
  const entryPoints = edgeFunctionEntryPoints();
  assert.ok(entryPoints.length > 0, 'No se encontraron Edge Functions para validar.');

  for (const entryPoint of entryPoints) {
    const relative = path.relative(root, entryPoint).replaceAll('\\', '/');
    const config = path.posix.join(path.posix.dirname(relative), 'deno.json');
    const lock = path.posix.join(path.posix.dirname(relative), 'deno.lock');
    assert.match(packageJson.scripts['typecheck:edge'], new RegExp(relative.replaceAll('/', '\\/')));
    assert.match(packageJson.scripts['typecheck:edge'], /(?:^|\s)--frozen(?:\s|$)/);
    assert.match(packageJson.scripts['typecheck:edge'], new RegExp(config.replaceAll('/', '\\/')));
    assert.match(packageJson.scripts['typecheck:edge'], new RegExp(lock.replaceAll('/', '\\/')));
    assert.match(packageJson.scripts['lint:edge'], new RegExp(relative.replaceAll('/', '\\/')));
    assert.match(packageJson.scripts['lint:edge'], new RegExp(config.replaceAll('/', '\\/')));
  }
});

test('cada import externo de Edge está fijado en el deno.json que usa su despliegue', () => {
  for (const entryPoint of edgeFunctionEntryPoints()) {
    const source = fs.readFileSync(entryPoint, 'utf8');
    const functionDirectory = path.dirname(entryPoint);
    const configPath = path.join(functionDirectory, 'deno.json');
    const lockPath = path.join(functionDirectory, 'deno.lock');
    assert.ok(fs.existsSync(configPath), `${path.relative(root, configPath)} no existe`);
    assert.ok(fs.existsSync(lockPath), `${path.relative(root, lockPath)} no existe`);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const bareExternalImports = [...source.matchAll(/from\s+['"](?![./]|node:|npm:|jsr:|https?:)([^'"]+)['"]/g)];
    for (const match of bareExternalImports) {
      assert.match(
        config.imports?.[match[1]] || '',
        /^(?:npm|jsr):.+@\d+\.\d+\.\d+$/,
        `${match[1]} no está fijado a una versión exacta en ${path.relative(root, configPath)}`,
      );
    }
  }
});
