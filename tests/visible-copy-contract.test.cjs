'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parse } = require('@babel/parser');

const root = path.join(__dirname, '..');
const uiRoots = [
  path.join(root, 'src', 'screens'),
  path.join(root, 'src', 'components'),
  path.join(root, 'src', 'navigation'),
];

const errorMessageFunctions = new Map([
  [path.join(root, 'src', 'lib', 'errors.js'), new Set(['getAuthErrorMessage'])],
  [path.join(root, 'src', 'data', 'repositories', 'planRepository.js'), new Set(['getPlanRepositoryErrorMessage'])],
  [path.join(root, 'src', 'data', 'repositories', 'practiceRepository.js'), new Set(['getPracticeRepositoryErrorMessage'])],
  [path.join(root, 'src', 'data', 'repositories', 'reviewRepository.js'), new Set(['getReviewRepositoryErrorMessage'])],
  [path.join(root, 'src', 'data', 'repositories', 'metricRepository.js'), new Set(['getMetricRepositoryErrorMessage'])],
  [path.join(root, 'src', 'data', 'repositories', 'privacyRepository.js'), new Set(['getPrivacyErrorMessage'])],
  [path.join(root, 'src', 'screens', 'auth', 'ResetPasswordScreen.js'), new Set(['getPasswordResetErrorMessage'])],
  [path.join(root, 'src', 'screens', 'review', 'WeeklyReviewScreen.js'), new Set(['getEligibilityExplanation'])],
]);

const forbiddenTerms = [
  ['Supabase', /\bsupabase\b/i],
  ['RLS', /\brls\b/i],
  ['staging', /\bstaging\b/i],
  ['backend', /\bback-?end\b/i],
  ['migración', /\bmigraci(?:o|ó)n(?:es)?\b/i],
  ['esquema', /\b(?:esquema|schemas?)\b/i],
  ['RPC', /\brpcs?\b/i],
  ['identificador técnico', /\bidentificadores?\b|\bids?\s+(?:t[eé]cnicos?|internos?)\b/i],
  ['endpoint', /\bendpoints?\b/i],
  ['servidor', /\bservidor(?:es)?\b/i],
  ['cola', /\bcola\b/i],
  ['offline', /\boffline\b/i],
  ['JSON', /\bjson\b/i],
  ['.env', /\.env(?:\.example)?\b/i],
  ['Expo', /\bexpo\b/i],
];

const visibleAttributeNames = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'message',
  'placeholder',
  'retryLabel',
  'secondaryLabel',
  'tabBarAccessibilityLabel',
  'tabBarLabel',
  'title',
]);
const visibleObjectPropertyNames = new Set([
  'copy',
  'description',
  'label',
  'message',
  'placeholder',
  'text',
  'title',
]);
const technicalIdentifierPattern = /(?:supabase|rls|staging|backend|migration|schema|rpc|endpoint)/i;

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(target);
    return entry.isFile() && /\.(?:cjs|js)$/.test(entry.name) ? [target] : [];
  });
}

function parseSource(source, file) {
  return parse(source, {
    sourceType: 'unambiguous',
    plugins: ['jsx'],
    errorRecovery: false,
    sourceFilename: file,
  });
}

function walk(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visitor(node, ancestors);
  const nextAncestors = typeof node.type === 'string' ? [...ancestors, node] : ancestors;
  for (const [key, value] of Object.entries(node)) {
    if (['end', 'extra', 'loc', 'start'].includes(key)) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, visitor, nextAncestors));
    } else if (value && typeof value === 'object') {
      walk(value, visitor, nextAncestors);
    }
  }
}

function jsxElementName(openingElement) {
  const name = openingElement?.name;
  return name?.type === 'JSXIdentifier' ? name.name : '';
}

function propertyName(property) {
  const key = property?.key;
  if (property?.computed) return '';
  if (key?.type === 'Identifier' || key?.type === 'StringLiteral') return key.name || key.value;
  return '';
}

function calleeName(callee) {
  if (callee?.type === 'Identifier') return callee.name;
  if (callee?.type !== 'MemberExpression' || callee.computed) return '';
  const object = callee.object?.type === 'Identifier' ? callee.object.name : '';
  const property = callee.property?.type === 'Identifier' ? callee.property.name : '';
  return object && property ? `${object}.${property}` : '';
}

function addStaticSegments(node, add, includeTechnicalIdentifiers = false) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'StringLiteral' || node.type === 'DirectiveLiteral') {
    add(node.value, node.loc?.start?.line || 1);
    return;
  }
  if (node.type === 'JSXText') {
    add(node.value, node.loc?.start?.line || 1);
    return;
  }
  if (node.type === 'TemplateElement') {
    add(node.value?.cooked || node.value?.raw || '', node.loc?.start?.line || 1);
    return;
  }
  if (includeTechnicalIdentifiers && node.type === 'Identifier' && technicalIdentifierPattern.test(node.name)) {
    add(node.name.replace(/([a-z])([A-Z])/g, '$1 $2'), node.loc?.start?.line || 1);
    return;
  }
  if (node.type === 'ImportDeclaration' || node.type.startsWith('Import')) return;

  for (const [key, value] of Object.entries(node)) {
    if (['end', 'extra', 'loc', 'start'].includes(key)) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => addStaticSegments(item, add, includeTechnicalIdentifiers));
    } else if (value && typeof value === 'object') {
      addStaticSegments(value, add, includeTechnicalIdentifiers);
    }
  }
}

function normalizeCopy(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function scanSource(source, file, allowedErrorFunctions = new Set()) {
  const ast = parseSource(source, file);
  const copy = [];
  const add = (value, line, channel) => {
    const normalized = normalizeCopy(value);
    if (normalized) copy.push({ channel, file, line, text: normalized });
  };

  walk(ast, (node, ancestors) => {
    if (node.type === 'JSXElement' && jsxElementName(node.openingElement) === 'Text') {
      node.children.forEach((child) => {
        if (child.type === 'JSXExpressionContainer') {
          addStaticSegments(child.expression, (value, line) => add(value, line, 'Text'), true);
        } else if (child.type === 'JSXText') {
          add(child.value, child.loc?.start?.line || 1, 'Text');
        }
      });
    }

    if (node.type === 'JSXAttribute' && visibleAttributeNames.has(node.name?.name)) {
      const value = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value;
      addStaticSegments(value, (segment, line) => add(segment, line, `prop:${node.name.name}`), true);
    }

    if (node.type === 'ObjectProperty' && visibleObjectPropertyNames.has(propertyName(node))) {
      addStaticSegments(node.value, (value, line) => add(value, line, `property:${propertyName(node)}`), true);
    }

    if (node.type === 'CallExpression') {
      const name = calleeName(node.callee);
      const isAlert = name === 'Alert.alert';
      const isVisibleStateSetter = /^set.*(?:Error|Errors|Message|Notice|Status|Warning)$/.test(name);
      if (isAlert || isVisibleStateSetter) {
        node.arguments.forEach((argument) => {
          addStaticSegments(argument, (value, line) => add(value, line, isAlert ? 'Alert' : name), true);
        });
      }
    }

    if (node.type === 'ReturnStatement' && allowedErrorFunctions.size) {
      const owner = [...ancestors].reverse().find((ancestor) => (
        (ancestor.type === 'FunctionDeclaration' || ancestor.type === 'FunctionExpression')
        && allowedErrorFunctions.has(ancestor.id?.name)
      ));
      if (owner) {
        addStaticSegments(node.argument, (value, line) => add(value, line, owner.id.name), true);
      }
    }
  });

  return copy.flatMap((entry) => forbiddenTerms
    .filter(([, pattern]) => pattern.test(entry.text))
    .map(([term]) => ({ ...entry, term })));
}

function collectStaticCallCopy(source, file, targetName) {
  const ast = parseSource(source, file);
  const calls = [];

  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || calleeName(node.callee) !== targetName) return;
    calls.push(node.arguments.map((argument) => {
      const segments = [];
      addStaticSegments(argument, (value) => {
        const normalized = normalizeCopy(value);
        if (normalized) segments.push(normalized);
      }, true);
      return segments.join(' ');
    }));
  });

  return calls;
}

test('el detector editorial ignora imports e identificadores internos que no se muestran', () => {
  const internalOnly = `
    import { supabase } from './supabase';
    const backendRpc = () => supabase.rpc('internal_schema');
    export default function Example() {
      return <View testID="backend-staging"><Text>Mensaje claro</Text></View>;
    }
  `;
  assert.deepEqual(scanSource(internalOnly, 'internal-only.js'), []);

  const exposed = `
    import { supabase } from './supabase';
    export default function Example() {
      return <Text>Configura Supabase y ejecuta las migraciones en staging.</Text>;
    }
  `;
  assert.deepEqual(
    [...new Set(scanSource(exposed, 'exposed.js').map(({ term }) => term))].sort(),
    ['Supabase', 'migración', 'staging'].sort(),
  );

  const exposedIdentifier = `
    export default function Example({ supabaseConfigurationError }) {
      return <StatusScreen message={supabaseConfigurationError} />;
    }
  `;
  assert.deepEqual(
    [...new Set(scanSource(exposedIdentifier, 'exposed-identifier.js').map(({ term }) => term))],
    ['Supabase'],
  );
});

test('el copy visible y los errores traducidos no exponen jerga interna', () => {
  const uiFiles = uiRoots.flatMap(listJavaScriptFiles);
  const findings = [
    ...uiFiles.flatMap((file) => scanSource(fs.readFileSync(file, 'utf8'), file)),
    ...[...errorMessageFunctions].flatMap(([file, functions]) => (
      scanSource(fs.readFileSync(file, 'utf8'), file, functions)
    )),
  ];

  assert.deepEqual(
    findings,
    [],
    findings.map((finding) => (
      `${path.relative(root, finding.file)}:${finding.line} [${finding.channel}] ${finding.term}: ${finding.text}`
    )).join('\n'),
  );
});

test('Transformación describe el borrado lógico como ocultación y declara la retención', () => {
  const file = path.join(root, 'src', 'screens', 'transformation', 'TransformationScreen.js');
  const source = fs.readFileSync(file, 'utf8');
  const alert = collectStaticCallCopy(source, file, 'Alert.alert')
    .find(([title]) => title === 'Ocultar registro del historial');

  assert.ok(alert, 'No se encontró la confirmación de ocultación.');
  assert.match(alert.join(' '), /su contenido seguirá conservado en tu cuenta/);
  assert.match(alert.join(' '), /aparecerá en tu copia de datos/);
  assert.match(alert[2], /Ocultar/);
  assert.doesNotMatch(alert.join(' '), /\bEliminar\b/);
});

test('Cuenta no promete una eliminación absoluta mientras existe un comprobante mínimo', () => {
  const file = path.join(root, 'src', 'screens', 'account', 'AccountScreen.js');
  const source = fs.readFileSync(file, 'utf8');
  const alerts = collectStaticCallCopy(source, file, 'Alert.alert');
  const confirmation = alerts.find(([title]) => title === 'Eliminar cuenta');
  const successAlerts = alerts.filter(([title]) => title.startsWith('Cuenta eliminada'));

  assert.ok(confirmation, 'No se encontró la confirmación de eliminación de cuenta.');
  assert.equal(successAlerts.length, 2);
  assert.match(confirmation.join(' '), /comprobante mínimo sin tu correo ni contenido/);
  assert.match(confirmation.join(' '), /no podemos garantizar cuándo se eliminará/);
  assert.match(confirmation.join(' '), /copias de respaldo/);
  assert.match(confirmation[2], /Eliminar cuenta/);
  successAlerts.forEach((alert) => {
    assert.match(alert.join(' '), /comprobante mínimo sin tu correo ni contenido/);
    assert.match(alert.join(' '), /no podemos garantizar cuándo se eliminará/);
  });
  assert.doesNotMatch(source, /eliminaci[oó]n definitiva|Eliminar definitivamente/);
});
