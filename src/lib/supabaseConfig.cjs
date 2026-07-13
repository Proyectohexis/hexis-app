'use strict';

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function isLocalDevelopmentHost(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '10.0.2.2'
    || hostname === '10.0.3.2'
    || isPrivateIpv4(hostname);
}

function getLegacyJwtRole(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;

  try {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const input = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    let bits = 0;
    let bitCount = 0;
    let decoded = '';
    for (const character of input) {
      const value = alphabet.indexOf(character);
      if (value < 0) return null;
      bits = (bits << 6) | value;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        decoded += String.fromCharCode((bits >> bitCount) & 0xff);
      }
    }
    return JSON.parse(decoded)?.role || null;
  } catch {
    return null;
  }
}

function validateSupabaseConfiguration({ url, publishableKey, allowLocalDevelopment = false }) {
  if (!url || !publishableKey) {
    return 'Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.';
  }

  try {
    const parsedUrl = new URL(url);
    const managedHost = parsedUrl.protocol === 'https:'
      && (parsedUrl.hostname.endsWith('.supabase.co') || parsedUrl.hostname.endsWith('.supabase.in'));
    const localDevelopmentHost = allowLocalDevelopment
      && parsedUrl.protocol === 'http:'
      && isLocalDevelopmentHost(parsedUrl.hostname);

    if (!managedHost && !localDevelopmentHost) {
      if (parsedUrl.protocol !== 'https:' && !allowLocalDevelopment) {
        return 'La URL de Supabase debe usar HTTPS.';
      }
      return 'La URL no corresponde a un host administrado de Supabase.';
    }

    if (parsedUrl.username || parsedUrl.password) {
      return 'La URL de Supabase no puede incluir credenciales.';
    }

    if (publishableKey.startsWith('eyJ')) {
      if (!localDevelopmentHost || getLegacyJwtRole(publishableKey) !== 'anon') {
        return 'Las claves JWT legacy no están permitidas en el bundle. Usa una sb_publishable_ key.';
      }
      return null;
    }
  } catch {
    return 'EXPO_PUBLIC_SUPABASE_URL no es una URL válida.';
  }

  if (publishableKey.startsWith('sb_secret_')) {
    return 'Se detectó una clave secreta. Nunca incluyas sb_secret_ en una app móvil.';
  }

  if (!publishableKey.startsWith('sb_publishable_')) {
    return 'La clave del cliente debe comenzar con sb_publishable_.';
  }

  return null;
}

module.exports = {
  getLegacyJwtRole,
  isLocalDevelopmentHost,
  validateSupabaseConfiguration,
};
