'use strict';

const { installRuntimeEgressGuard } = require('./src/runtimeIsolation');

if (typeof __DEV__ === 'undefined' || !__DEV__) {
  installRuntimeEgressGuard();
}

const { registerRootComponent } = require('expo');
const App = require('./App');

registerRootComponent(App);
