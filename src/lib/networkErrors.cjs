'use strict';

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetryableTransportError(error) {
  if (!error) return false;
  const status = Number(error.status || error.statusCode);
  if (RETRYABLE_STATUS_CODES.has(status)) return true;
  if (typeof error.code === 'string' && /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EAI_AGAIN)$/i.test(error.code)) {
    return true;
  }
  const message = String(error.message || error).toLowerCase();
  return [
    'network request failed',
    'failed to fetch',
    'fetch failed',
    'network error',
    'connection timed out',
    'request timed out',
    'internet connection',
  ].some((fragment) => message.includes(fragment));
}

module.exports = { isRetryableTransportError };
