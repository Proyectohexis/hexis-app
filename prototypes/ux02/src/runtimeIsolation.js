'use strict';

const STATE_KEY = '__HEXIS_UX02_RUNTIME_ISOLATION__';
const BLOCK_CODE = 'HEXIS_UX02_EGRESS_BLOCKED';

function isolationError(transport) {
  const error = new Error(`UX02 blocked outbound ${transport}.`);
  error.code = BLOCK_CODE;
  return error;
}

function blockedFetch() {
  throw isolationError('fetch');
}

class BlockedXMLHttpRequest {
  constructor() {
    throw isolationError('XMLHttpRequest');
  }
}

class BlockedWebSocket {
  constructor() {
    throw isolationError('WebSocket');
  }
}

function installRuntimeEgressGuard() {
  if (global[STATE_KEY]) {
    return getRuntimeIsolationStatus();
  }

  Object.defineProperties(global, {
    fetch: {
      configurable: false,
      enumerable: true,
      value: blockedFetch,
      writable: false,
    },
    XMLHttpRequest: {
      configurable: false,
      enumerable: true,
      value: BlockedXMLHttpRequest,
      writable: false,
    },
    WebSocket: {
      configurable: false,
      enumerable: true,
      value: BlockedWebSocket,
      writable: false,
    },
  });

  let preflightPassed = false;
  try {
    global.fetch('https://egress-preflight.invalid/ux02');
  } catch (error) {
    preflightPassed = error && error.code === BLOCK_CODE;
  }

  Object.defineProperty(global, STATE_KEY, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({ preflightPassed }),
    writable: false,
  });

  return getRuntimeIsolationStatus();
}

function getRuntimeIsolationStatus() {
  const state = global[STATE_KEY];
  const enforced = Boolean(
    state &&
      state.preflightPassed &&
      global.fetch === blockedFetch &&
      global.XMLHttpRequest === BlockedXMLHttpRequest &&
      global.WebSocket === BlockedWebSocket,
  );

  if (enforced) {
    return {
      enforced: true,
      label: 'Preflight aprobado · salida JavaScript bloqueada',
      detail: 'fetch, XMLHttpRequest y WebSocket fallan antes de emitir una solicitud.',
    };
  }

  return {
    enforced: false,
    label: 'Modo de preview · red del contenedor no denegada',
    detail: 'Expo Go y el servidor de desarrollo conservan red para cargar el bundle.',
  };
}

module.exports = {
  BLOCK_CODE,
  getRuntimeIsolationStatus,
  installRuntimeEgressGuard,
};
