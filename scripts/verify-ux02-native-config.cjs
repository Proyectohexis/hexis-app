'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const expoCli = require.resolve('expo/bin/cli');
const result = spawnSync(
  process.execPath,
  [expoCli, 'config', 'prototypes/ux02', '--type', 'introspect', '--json'],
  { encoding: 'utf8' },
);

assert.equal(result.status, 0, result.stderr || result.stdout);
const config = JSON.parse(result.stdout);
const manifest = config._internal.modResults.android.manifest.manifest;
const permissionRows = manifest['uses-permission'] || [];
const blockedPermissions = [
  'android.permission.INTERNET',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
];

for (const permission of blockedPermissions) {
  assert.ok(
    permissionRows.some(
      (row) => row.$['android:name'] === permission && row.$['tools:node'] === 'remove',
    ),
    `${permission} must be explicitly removed from the resolved Android manifest.`,
  );
}

const activePermissions = permissionRows
  .filter((row) => row.$['tools:node'] !== 'remove')
  .map((row) => row.$['android:name']);
assert.deepEqual(activePermissions, []);
assert.equal(config.android.allowBackup, false);
assert.deepEqual(config.android.permissions, []);

const transportSecurity = config._internal.modResults.ios.infoPlist.NSAppTransportSecurity;
assert.deepEqual(transportSecurity, {
  NSAllowsArbitraryLoads: false,
  NSAllowsArbitraryLoadsForMedia: false,
  NSAllowsArbitraryLoadsInWebContent: false,
  NSAllowsLocalNetworking: false,
});
assert.deepEqual(config._internal.modResults.ios.entitlements, {});
assert.equal(config.updates.enabled, false);
assert.equal(config.extra.pilotApproval, 'not-approved');

process.stdout.write('UX02 native config: no active Android permissions; iOS ATS hardened; updates disabled.\n');
