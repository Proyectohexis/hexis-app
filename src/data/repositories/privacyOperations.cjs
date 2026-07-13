'use strict';

const DELETE_CONFIRMATION = 'ELIMINAR HEXIS';

function validateDeletionInput({ password, confirmation }) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Escribe tu contraseña actual.';
  }
  if (confirmation !== DELETE_CONFIRMATION) {
    return `Escribe exactamente ${DELETE_CONFIRMATION}.`;
  }
  return '';
}

function validateExportSnapshot(snapshot) {
  return Boolean(
    snapshot
    && snapshot.format === 'hexis-account-export'
    && snapshot.schema_version === 1
    && snapshot.data
    && typeof snapshot.data === 'object'
  );
}

function serializeExportSnapshot(snapshot) {
  if (!validateExportSnapshot(snapshot)) {
    throw new Error('invalid_export_snapshot');
  }
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function exportFileName(generatedAt) {
  const parsed = new Date(generatedAt);
  const datePart = Number.isNaN(parsed.getTime())
    ? 'sin-fecha'
    : parsed.toISOString().replace(/[:.]/g, '-');
  return `hexis-datos-${datePart}.json`;
}

function shouldRetryDeletionRequest(error) {
  if (error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsRelayError') {
    return true;
  }
  const status = Number(error?.context?.status);
  return Number.isInteger(status) && status >= 500 && status <= 599;
}

module.exports = {
  DELETE_CONFIRMATION,
  exportFileName,
  serializeExportSnapshot,
  shouldRetryDeletionRequest,
  validateDeletionInput,
  validateExportSnapshot,
};
