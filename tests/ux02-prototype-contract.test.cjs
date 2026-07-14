'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, extname, isAbsolute, join, normalize, relative, resolve } = require('node:path');
const test = require('node:test');

const prototypeRoot = resolve('prototypes/ux02');
const {
  ARTIFACT_DATE,
  DAYS,
  DECISIONS,
  METRIC_STATES,
  PROTOTYPE_VERSION,
  REDUCE_MODES,
  REFLECTION_OPTIONS,
  SCENARIOS,
  SIMULATIONS,
} = require('../prototypes/ux02/src/fixtures');
const {
  acknowledgeRollover,
  attemptConfirmation,
  buildAfterCommitment,
  canShowReceipt,
  createSession,
  describeChange,
  isDraftValid,
  isSessionEnvelopeTrusted,
  rebuildAfterConflict,
  resetForReduceMode,
} = require('../prototypes/ux02/src/model');
const { colors } = require('../prototypes/ux02/src/theme');

function collectSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) collectSourceFiles(absolute, files);
    if (stats.isFile() && ['.js', '.cjs', '.mjs'].includes(extname(entry))) files.push(absolute);
  }
  return files;
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function withSelection(session, scenario, decision) {
  return {
    ...session,
    targetId: scenario.commitment.id,
    decision,
  };
}

function luminance(hex) {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('UX02 es un workspace Expo identificable con defensa Android y scripts válidos', () => {
  const appConfig = JSON.parse(readFileSync(join(prototypeRoot, 'app.json'), 'utf8'));
  const packageConfig = JSON.parse(readFileSync(join(prototypeRoot, 'package.json'), 'utf8'));
  const rootPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

  assert.equal(packageConfig.main, 'index.js');
  assert.deepEqual(packageConfig.dependencies, {
    expo: '~54.0.35',
    react: '19.1.0',
    'react-native': '0.81.5',
  });
  assert.deepEqual(rootPackage.workspaces, ['prototypes/ux02']);
  assert.equal(rootPackage.scripts['prototype:ux02:start'], 'expo start prototypes/ux02 --offline');
  assert.doesNotMatch(rootPackage.scripts['prototype:ux02:start'], /--offline.*--localhost|--localhost.*--offline/);
  assert.equal(appConfig.expo.slug, 'hexis-ux02-prototype');
  assert.equal(appConfig.expo.version, '0.2.0');
  assert.equal(appConfig.expo.updates.enabled, false);
  assert.equal(appConfig.expo.android.package, 'com.proyectohexis.ux02prototype');
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'com.proyectohexis.ux02prototype');
  assert.equal(appConfig.expo.extra.prototypeVersion, PROTOTYPE_VERSION);
  assert.equal(appConfig.expo.extra.pilotApproval, 'not-approved');
  assert.deepEqual(appConfig.expo.android.blockedPermissions, [
    'android.permission.INTERNET',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.VIBRATE',
  ]);
  assert.deepEqual(appConfig.expo.ios.infoPlist.NSAppTransportSecurity, {
    NSAllowsArbitraryLoads: false,
    NSAllowsArbitraryLoadsForMedia: false,
    NSAllowsArbitraryLoadsInWebContent: false,
    NSAllowsLocalNetworking: false,
  });
});

test('UX02 no importa app productiva, repositorios, identidad, almacenamiento, telemetría ni clientes remotos', () => {
  const allowedPackages = new Set(['expo', 'react', 'react-native']);
  const runtimeIsolationFile = resolve(prototypeRoot, 'src/runtimeIsolation.js');
  const forbiddenCode = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bNativeModules\b/,
    /\bLinking\b/,
    /\bopenURL\b/,
    /\bWebView\b/,
    /source\s*=\s*\{\s*\{\s*uri\s*:/,
    /@supabase/,
    /async-storage/i,
    /secure-store/i,
    /(?:^|[/\\])src[/\\](?:data|lib|analytics|auth)/i,
    /\b(?:analytics?|amplitude|axios|crashlytics|sentry|segment)\b/i,
  ];

  for (const file of collectSourceFiles(prototypeRoot)) {
    const source = readFileSync(file, 'utf8');
    const specifiers = [
      ...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) {
        assert.ok(allowedPackages.has(specifier), `${file} importa ${specifier}`);
        continue;
      }

      const target = normalize(resolve(dirname(file), specifier));
      const relativeTarget = relative(prototypeRoot, target);
      assert.ok(
        !isAbsolute(relativeTarget) && relativeTarget !== '..' && !relativeTarget.startsWith(`..${require('node:path').sep}`),
        `${file} escapa del harness con ${specifier}`,
      );
      assert.ok(
        existsSync(target) || existsSync(`${target}.js`) || existsSync(`${target}.cjs`),
        `${file} referencia un módulo local inexistente: ${specifier}`,
      );
    }

    for (const pattern of forbiddenCode) {
      if (file === runtimeIsolationFile && forbiddenCode.indexOf(pattern) < 3) continue;
      assert.doesNotMatch(source, pattern, `${file} contiene capacidad prohibida ${pattern}`);
    }
  }

  const guardSource = readFileSync(runtimeIsolationFile, 'utf8');
  assert.match(guardSource, /Object\.defineProperties\(global/);
  assert.match(guardSource, /fetch:[\s\S]*value: blockedFetch[\s\S]*writable: false/);
  assert.match(guardSource, /XMLHttpRequest:[\s\S]*value: BlockedXMLHttpRequest/);
  assert.match(guardSource, /WebSocket:[\s\S]*value: BlockedWebSocket/);
});

test('el preflight de producción bloquea fetch, XMLHttpRequest y WebSocket antes de salir', () => {
  const modulePath = resolve(prototypeRoot, 'src/runtimeIsolation.js');
  const probe = `
    const guard = require(${JSON.stringify(modulePath)});
    const installed = guard.installRuntimeEgressGuard();
    const overwriteAccepted = Reflect.set(global, 'fetch', () => 'unsafe');
    const reinstalled = guard.installRuntimeEgressGuard();
    const codes = [];
    for (const action of [
      () => global.fetch('https://blocked.invalid'),
      () => new global.XMLHttpRequest(),
      () => new global.WebSocket('wss://blocked.invalid'),
    ]) {
      try { action(); } catch (error) { codes.push(error.code); }
    }
    process.stdout.write(JSON.stringify({ installed, reinstalled, overwriteAccepted, codes }));
  `;
  const result = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.installed.enforced, true);
  assert.equal(report.reinstalled.enforced, true);
  assert.equal(report.overwriteAccepted, false);
  assert.deepEqual(report.codes, [
    'HEXIS_UX02_EGRESS_BLOCKED',
    'HEXIS_UX02_EGRESS_BLOCKED',
    'HEXIS_UX02_EGRESS_BLOCKED',
  ]);
});

test('fixtures A/B, decisiones y cinco estados de métrica son sintéticos e inmutables', () => {
  assert.equal(PROTOTYPE_VERSION, 'UX02-PROT-v0.2');
  assert.equal(ARTIFACT_DATE, '13 de julio de 2026');
  assert.ok(isDeepFrozen(SCENARIOS));
  assert.ok(isDeepFrozen(DAYS));
  assert.ok(isDeepFrozen(DECISIONS));
  assert.ok(isDeepFrozen(METRIC_STATES));
  assert.ok(isDeepFrozen(REDUCE_MODES));
  assert.ok(isDeepFrozen(REFLECTION_OPTIONS));
  assert.ok(isDeepFrozen(SIMULATIONS));
  assert.deepEqual(Object.keys(SCENARIOS).sort(), ['learning', 'strength']);
  assert.deepEqual(DECISIONS.map(({ id }) => id), ['keep', 'reduce', 'increase', 'replace']);
  assert.deepEqual(REDUCE_MODES.map(({ id }) => id), ['schedule', 'minimum_action', 'both']);
  assert.deepEqual(METRIC_STATES.map(({ id }) => id), [
    'not_configured',
    'no_records',
    'one_record',
    'two_or_more',
    'unavailable',
  ]);

  for (const scenario of Object.values(SCENARIOS)) {
    assert.equal(scenario.weekLabel, '6–12 de julio de 2026');
    assert.equal(scenario.effectiveDate.full, 'martes 14 de julio de 2026');
    assert.equal(scenario.rolloverReviewDate.full, 'martes 14 de julio de 2026');
    assert.equal(scenario.rolloverDate.full, 'miércoles 15 de julio de 2026');
    assert.ok(scenario.conflictUpdate.sourceVersion > scenario.commitment.sourceVersion);
    assert.notEqual(scenario.conflictUpdate.minimumAction, scenario.commitment.minimumAction);
    assert.notDeepEqual(scenario.conflictUpdate.scheduledDays, scenario.commitment.scheduledDays);
    assert.equal(scenario.reducedMinimumActions.length, 2);
    assert.equal(scenario.replacementOptions.length, 2);
    assert.ok(scenario.reducedMinimumActions.every((value) => value !== scenario.commitment.minimumAction));
    assert.ok(scenario.replacementOptions.every((option) => option.name !== scenario.commitment.name));
    assert.equal(scenario.timezone, 'America/Panama');
  }
});

test('reset es determinista, reflexión es opcional y no hay selección inicial', () => {
  const config = {
    scenarioKey: 'strength',
    metricStateId: 'one_record',
    simulationId: 'conflict',
  };
  const first = createSession(config);
  const second = createSession(config);

  assert.deepEqual(first, second);
  assert.equal(first.reflection, '');
  assert.equal(first.targetId, null);
  assert.equal(first.decision, null);
  assert.equal(isDraftValid(first, SCENARIOS.strength), false);
  assert.throws(
    () => createSession({ ...config, metricStateId: 'unknown' }),
    /Unknown synthetic configuration/,
  );
});

test('las cuatro decisiones y las tres reducciones exigen diferencias exactas y días conocidos únicos', () => {
  const scenario = SCENARIOS.learning;
  const initial = createSession();

  const keep = withSelection(initial, scenario, 'keep');
  assert.equal(isDraftValid(keep, scenario), true);
  assert.deepEqual(keep.afterDays, scenario.commitment.scheduledDays);
  assert.equal(isDraftValid({ ...keep, targetId: 'foreign-commitment' }, scenario), false);
  assert.equal(isDraftValid({ ...keep, afterDays: ['monday'] }, scenario), false);

  const reduceSchedule = {
    ...resetForReduceMode(withSelection(initial, scenario, 'reduce'), 'schedule', scenario),
    afterDays: ['monday', 'friday'],
  };
  assert.equal(isDraftValid(reduceSchedule, scenario), true);
  assert.equal(isDraftValid({ ...reduceSchedule, afterDays: [] }, scenario), false);

  const reduceMinimum = {
    ...resetForReduceMode(withSelection(initial, scenario, 'reduce'), 'minimum_action', scenario),
    afterMinimumAction: scenario.reducedMinimumActions[0],
  };
  assert.equal(isDraftValid(reduceMinimum, scenario), true);
  assert.equal(
    isDraftValid({ ...reduceMinimum, afterMinimumAction: scenario.commitment.minimumAction }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({ ...reduceMinimum, afterMinimumAction: 'x'.repeat(161) }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({ ...reduceMinimum, afterMinimumAction: 'Correr un maratón' }, scenario),
    false,
  );

  const reduceBoth = {
    ...resetForReduceMode(withSelection(initial, scenario, 'reduce'), 'both', scenario),
    afterDays: ['monday', 'friday'],
    afterMinimumAction: scenario.reducedMinimumActions[1],
  };
  assert.equal(isDraftValid(reduceBoth, scenario), true);
  assert.match(describeChange(reduceBoth, scenario), /Acción mínima:/);

  const increase = {
    ...withSelection(initial, scenario, 'increase'),
    afterDays: [...scenario.commitment.scheduledDays, 'sunday'],
  };
  assert.equal(isDraftValid(increase, scenario), true);
  assert.equal(
    isDraftValid({ ...increase, afterDays: [...scenario.commitment.scheduledDays, 'friday'] }, scenario),
    false,
  );

  const replacementFixture = scenario.replacementOptions[0];
  const replace = {
    ...withSelection(initial, scenario, 'replace'),
    replacement: {
      fixtureId: replacementFixture.id,
      name: replacementFixture.name,
      minimumAction: replacementFixture.minimumAction,
      scheduledDays: [...replacementFixture.scheduledDays],
    },
  };
  assert.equal(isDraftValid(replace, scenario), true);
  assert.deepEqual(buildAfterCommitment(replace, scenario), {
    name: 'Practicar ejercicios',
    minimumAction: 'Resolver un ejercicio guiado',
    scheduledDays: ['tuesday', 'thursday'],
  });
  assert.match(describeChange(replace, scenario), /Resolver un ejercicio guiado/);
  assert.equal(
    isDraftValid({ ...replace, replacement: { ...replace.replacement, name: ' ' } }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({ ...replace, replacement: { ...replace.replacement, scheduledDays: ['unknown'] } }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({ ...replace, replacement: { ...replace.replacement, scheduledDays: ['tuesday', 'tuesday'] } }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({
      ...replace,
      replacement: {
        fixtureId: replacementFixture.id,
        name: scenario.commitment.name,
        minimumAction: scenario.commitment.minimumAction,
        scheduledDays: [...scenario.commitment.scheduledDays],
      },
    }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({ ...replace, replacement: { ...replace.replacement, name: 'x'.repeat(81) } }, scenario),
    false,
  );
  assert.equal(
    isDraftValid({ ...replace, replacement: { ...replace.replacement, minimumAction: 'x'.repeat(161) } }, scenario),
    false,
  );

  const invalidAttempt = attemptConfirmation({
    ...increase,
    screen: 'confirmation',
    afterDays: [...scenario.commitment.scheduledDays, 'friday'],
  }, scenario);
  assert.equal(invalidAttempt.confirmationStatus, 'invalid');
  assert.notEqual(invalidAttempt.screen, 'receipt');
  assert.equal(canShowReceipt({
    ...initial,
    screen: 'receipt',
    confirmationStatus: 'confirmed',
  }, scenario), false);
  const confirmedKeep = attemptConfirmation({ ...keep, screen: 'confirmation' }, scenario);
  assert.equal(canShowReceipt(confirmedKeep, scenario), true);
  assert.equal(Object.isFrozen(confirmedKeep), true);
  assert.equal(Object.isFrozen(confirmedKeep.afterDays), true);
  assert.throws(() => {
    confirmedKeep.decision = 'increase';
  }, TypeError);
  assert.throws(() => {
    confirmedKeep.afterDays.push('sunday');
  }, TypeError);
  assert.equal(canShowReceipt(confirmedKeep, scenario), true);
});

test('offline, conflicto y rollover son simulaciones locales recuperables sin perder reflexión', () => {
  const scenario = SCENARIOS.learning;
  const base = {
    ...withSelection(createSession(), scenario, 'keep'),
    screen: 'confirmation',
    reflection: REFLECTION_OPTIONS[0].label,
  };

  const offline = attemptConfirmation({
    ...base,
    config: { ...base.config, simulationId: 'offline' },
  }, scenario);
  assert.equal(offline.confirmationStatus, 'offline');
  assert.equal(offline.screen, 'confirmation');
  assert.equal(offline.reflection, base.reflection);
  assert.equal(isSessionEnvelopeTrusted({
    ...offline,
    confirmationStatus: 'idle',
  }, scenario), false);
  const changedWhileOffline = {
    ...offline,
    decision: 'increase',
    afterDays: [...offline.afterDays, 'sunday'],
  };
  assert.equal(isSessionEnvelopeTrusted(changedWhileOffline, scenario), false);
  assert.equal(attemptConfirmation(changedWhileOffline, scenario).confirmationStatus, 'invalid');
  const offlineRetry = attemptConfirmation(offline, scenario);
  assert.equal(offlineRetry.confirmationStatus, 'confirmed');
  assert.equal(offlineRetry.screen, 'receipt');

  const conflict = attemptConfirmation({
    ...base,
    config: { ...base.config, simulationId: 'conflict' },
  }, scenario);
  assert.equal(conflict.confirmationStatus, 'conflict');
  assert.equal(conflict.pendingConflictSource.sourceVersion, 2);
  assert.notEqual(conflict.pendingConflictSource.minimumAction, conflict.sourceCommitment.minimumAction);
  assert.notDeepEqual(conflict.pendingConflictSource.scheduledDays, conflict.sourceCommitment.scheduledDays);
  assert.deepEqual(attemptConfirmation(conflict, scenario), conflict);
  assert.equal(isSessionEnvelopeTrusted({
    ...conflict,
    confirmationStatus: 'idle',
    sourceCommitment: { ...conflict.pendingConflictSource },
    pendingConflictSource: null,
    reloadedConflictSummary: scenario.conflictUpdate.summary,
    afterDays: [...conflict.pendingConflictSource.scheduledDays],
    afterMinimumAction: conflict.pendingConflictSource.minimumAction,
  }, scenario), false);
  const rebuilt = rebuildAfterConflict(conflict, scenario);
  assert.equal(rebuilt.screen, 'step2');
  assert.equal(rebuilt.targetId, null);
  assert.equal(rebuilt.decision, null);
  assert.equal(rebuilt.reflection, base.reflection);
  assert.equal(rebuilt.sourceCommitment.sourceVersion, 2);
  assert.equal(rebuilt.sourceCommitment.minimumAction, scenario.conflictUpdate.minimumAction);
  assert.deepEqual(rebuilt.afterDays, scenario.conflictUpdate.scheduledDays);
  assert.match(rebuilt.reloadedConflictSummary, /cambió|cambió|pasó/);

  const rebuiltRetry = attemptConfirmation({
    ...rebuilt,
    screen: 'confirmation',
    targetId: rebuilt.sourceCommitment.id,
    decision: 'keep',
  }, scenario);
  assert.equal(rebuiltRetry.confirmationStatus, 'confirmed');
  assert.equal(rebuiltRetry.screen, 'receipt');

  const rollover = attemptConfirmation({
    ...base,
    config: { ...base.config, simulationId: 'rollover' },
  }, scenario);
  assert.equal(rollover.confirmationStatus, 'rollover');
  assert.equal(rollover.reviewThroughDate.full, 'martes 14 de julio de 2026');
  assert.equal(rollover.effectiveDate.full, 'miércoles 15 de julio de 2026');
  assert.equal(rollover.reflection, base.reflection);
  assert.deepEqual(attemptConfirmation(rollover, scenario), rollover);
  assert.equal(isSessionEnvelopeTrusted({
    ...rollover,
    confirmationStatus: 'idle',
  }, scenario), false);
  const rolloverAcknowledged = acknowledgeRollover(rollover, scenario);
  assert.equal(rolloverAcknowledged.screen, 'step3');
  assert.equal(rolloverAcknowledged.confirmationStatus, 'idle');
  const rolloverRetry = attemptConfirmation({
    ...rolloverAcknowledged,
    screen: 'confirmation',
  }, scenario);
  assert.equal(rolloverRetry.screen, 'receipt');
});

test('la sesión completa falla cerrada ante texto, fechas, fuente o conflicto adulterados', () => {
  const scenario = SCENARIOS.learning;
  const valid = {
    ...withSelection(createSession(), scenario, 'keep'),
    screen: 'confirmation',
  };
  assert.equal(isSessionEnvelopeTrusted(valid, scenario), true);

  const forgedSource = {
    ...valid,
    sourceCommitment: {
      ...valid.sourceCommitment,
      sourceVersion: 999,
      name: 'Texto arbitrario',
      minimumAction: 'Otro texto arbitrario',
    },
  };
  assert.equal(isSessionEnvelopeTrusted(forgedSource, scenario), false);
  assert.equal(isDraftValid(forgedSource, scenario), false);
  assert.equal(attemptConfirmation(forgedSource, scenario).confirmationStatus, 'invalid');

  const forgedDate = {
    ...valid,
    effectiveDate: { ...valid.effectiveDate, full: 'Texto arbitrario en recibo' },
  };
  assert.equal(isSessionEnvelopeTrusted(forgedDate, scenario), false);
  assert.equal(canShowReceipt({ ...forgedDate, screen: 'receipt', confirmationStatus: 'confirmed' }, scenario), false);

  const forgedReflection = { ...valid, reflection: 'Dato libre no permitido' };
  assert.equal(isSessionEnvelopeTrusted(forgedReflection, scenario), false);

  for (const simulationId of ['offline', 'conflict', 'rollover']) {
    const forgedConsumed = {
      ...valid,
      config: { ...valid.config, simulationId },
      simulationConsumed: true,
    };
    assert.equal(isSessionEnvelopeTrusted(forgedConsumed, scenario), false);
    assert.equal(attemptConfirmation(forgedConsumed, scenario).confirmationStatus, 'invalid');
  }

  const offlineProof = attemptConfirmation({
    ...valid,
    config: { ...valid.config, simulationId: 'offline' },
  }, scenario);
  const replayedAsRollover = {
    ...offlineProof,
    config: { ...offlineProof.config, simulationId: 'rollover' },
    confirmationStatus: 'idle',
    reviewThroughDate: { ...scenario.rolloverReviewDate },
    effectiveDate: { ...scenario.rolloverDate },
  };
  assert.equal(isSessionEnvelopeTrusted(replayedAsRollover, scenario), false);
  assert.equal(attemptConfirmation(replayedAsRollover, scenario).confirmationStatus, 'invalid');

  const conflict = attemptConfirmation({
    ...valid,
    config: { ...valid.config, simulationId: 'conflict' },
  }, scenario);
  const forgedConflict = {
    ...conflict,
    pendingConflictSource: {
      ...conflict.pendingConflictSource,
      sourceVersion: 777,
      name: 'Fuente adulterada',
    },
  };
  assert.equal(isSessionEnvelopeTrusted(forgedConflict, scenario), false);
  const rebuilt = rebuildAfterConflict(forgedConflict, scenario);
  assert.equal(rebuilt, forgedConflict);
  assert.equal(isSessionEnvelopeTrusted(rebuilt, scenario), false);
});

test('la UI expone accesibilidad, solo opciones sintéticas y una máquina de estados cerrada', () => {
  const app = readFileSync(join(prototypeRoot, 'App.js'), 'utf8');

  assert.match(app, /function SectionLabel[\s\S]*accessibilityRole="header"/);
  assert.match(app, /accessibilityRole="header"/);
  assert.match(app, /accessibilityRole="radiogroup"/);
  assert.match(app, /accessibilityRole="radio"/);
  assert.match(app, /accessibilityRole="checkbox"/);
  assert.match(app, /accessibilityRole=\{alert \? 'alert' : undefined\}/);
  assert.match(app, /AccessibilityInfo\.setAccessibilityFocus/);
  assert.match(app, /\[session\.confirmationStatus\]/);
  assert.match(app, /minHeight:\s*48/);
  assert.match(app, /Paso \{step\} de 3/);
  assert.match(app, /No aprobado para piloto contabilizable/);
  assert.match(app, /Fecha del artefacto: \{ARTIFACT_DATE\}/);
  assert.match(app, /accessibilityLiveRegion="polite" style=\{styles\.accessibleStatus\}/);
  assert.match(app, /session\.reviewThroughDate\.full/);
  assert.match(app, /describeChange\(session, scenario\)/);
  assert.match(app, /if \(canShowReceipt\(session, scenario\)\)/);
  assert.match(app, /!isSessionEnvelopeTrusted\(session, scenario\)/);
  assert.match(app, /No se mostrará un recibo sin una confirmación válida/);
  assert.match(app, /setTeamConfig\(\{ \.\.\.DEFAULT_TEAM_CONFIG \}\)/);
  assert.doesNotMatch(app, /2 de 3 días programados con evidencia/);
  assert.doesNotMatch(app, /const mounted = React\.useRef/);
  assert.match(app, /Desde el \$\{session\.effectiveDate\.full\}/);
  assert.doesNotMatch(app, /TextInput|onChangeText/);
  assert.match(app, /REFLECTION_OPTIONS\.map/);
  assert.match(app, /scenario\.reducedMinimumActions\.map/);
  assert.match(app, /scenario\.replacementOptions\.map/);
  assert.match(app, /Dejar reflexión vacía/);
  assert.match(app, /todas las respuestas son fixtures ficticios/);
  assert.match(app, /Abrir recorrido interno/);
});

test('CI inspecciona y exporta las dos plataformas del prototipo UX02', () => {
  const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
  const rootPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

  assert.match(workflow, /npm run prototype:ux02:doctor/);
  assert.match(workflow, /npm run prototype:ux02:verify-native-config/);
  assert.match(workflow, /npm run prototype:ux02:export:android/);
  assert.match(workflow, /npm run prototype:ux02:export:ios/);
  assert.match(workflow, /dist\/prototypes\/ux02\/android/);
  assert.match(workflow, /dist\/prototypes\/ux02\/ios/);
  assert.match(rootPackage.scripts['check:ux02'], /prototype:ux02:doctor/);
  assert.match(rootPackage.scripts['check:ux02'], /prototype:ux02:verify-native-config/);
  assert.match(rootPackage.scripts['check:ux02'], /prototype:ux02:export:android/);
  assert.match(rootPackage.scripts['check:ux02'], /prototype:ux02:export:ios/);
  assert.ok(existsSync(resolve('scripts/verify-ux02-native-config.cjs')));
});

test('la paleta del prototipo alcanza contraste AA textual y 3:1 en controles', () => {
  const textPairs = [
    [colors.text, colors.background],
    [colors.text, colors.surface],
    [colors.muted, colors.background],
    [colors.muted, colors.surface],
    [colors.accent, colors.background],
    [colors.accentText, colors.accent],
    [colors.error, colors.errorSurface],
  ];
  for (const [foreground, background] of textPairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} / ${background}`);
  }

  assert.ok(contrast(colors.border, colors.surface) >= 3);
  assert.ok(contrast(colors.border, colors.surfaceRaised) >= 3);
});
