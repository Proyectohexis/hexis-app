import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
const { splitUtf8Chunks } = require('./utf8Chunks.cjs');

const CHUNK_SIZE_BYTES = 1400;
const MAX_CHUNKS = 8;
const KEY_PREFIX = 'hexis.auth';
const INSTALLATION_MARKER = 'hexis.installation.active';
const SLOTS = ['a', 'b'];

function normalizeKey(key) {
  return String(key).replace(/[^A-Za-z0-9._-]/g, '_');
}

function metadataKey(key) {
  return `${KEY_PREFIX}.${normalizeKey(key)}.meta`;
}

function chunkKey(key, slot, index) {
  return `${KEY_PREFIX}.${normalizeKey(key)}.${slot}.${index}`;
}

async function readMetadata(key) {
  const raw = await SecureStore.getItemAsync(metadataKey(key));
  if (!raw) return null;

  try {
    const metadata = JSON.parse(raw);
    if (
      !SLOTS.includes(metadata?.slot)
      || !Number.isInteger(metadata?.count)
      || metadata.count < 1
      || metadata.count > MAX_CHUNKS
    ) {
      return null;
    }
    return metadata;
  } catch {
    return null;
  }
}

async function clearSlot(key, slot) {
  await Promise.all(
    Array.from({ length: MAX_CHUNKS }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, slot, index))
    )
  );
}

async function clearSecureValue(key) {
  await Promise.all([
    clearSlot(key, 'a'),
    clearSlot(key, 'b'),
    SecureStore.deleteItemAsync(metadataKey(key)),
  ]);
}

async function writeSecureValue(key, value) {
  const chunks = splitUtf8Chunks(String(value), CHUNK_SIZE_BYTES);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error('La sesión supera el tamaño seguro admitido por HEXIS.');
  }

  const previous = await readMetadata(key);
  const nextSlot = previous?.slot === 'a' ? 'b' : 'a';
  await clearSlot(key, nextSlot);

  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(chunkKey(key, nextSlot, index), chunk)
    )
  );

  await SecureStore.setItemAsync(
    metadataKey(key),
    JSON.stringify({ slot: nextSlot, count: chunks.length })
  );

  // Cleanup is bounded to two fixed slots. A failed cleanup is retried by the
  // next read/write and cannot create an unbounded set of Keychain entries.
  await Promise.allSettled([
    previous ? clearSlot(key, previous.slot) : Promise.resolve(),
    AsyncStorage.removeItem(key),
  ]);
}

export const secureSessionStorage = {
  async getItem(key) {
    const installationMarker = await AsyncStorage.getItem(INSTALLATION_MARKER);
    if (!installationMarker) {
      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue) {
        await writeSecureValue(key, legacyValue);
        await AsyncStorage.removeItem(key);
        await AsyncStorage.setItem(INSTALLATION_MARKER, '1');
        return legacyValue;
      }

      // AsyncStorage is removed on uninstall while iOS Keychain can persist.
      // A missing marker without a legacy token therefore starts a clean install.
      await clearSecureValue(key);
      await AsyncStorage.setItem(INSTALLATION_MARKER, '1');
      return null;
    }

    const metadata = await readMetadata(key);
    if (metadata) {
      const chunks = await Promise.all(
        Array.from({ length: metadata.count }, (_, index) =>
          SecureStore.getItemAsync(chunkKey(key, metadata.slot, index))
        )
      );

      if (chunks.every((chunk) => typeof chunk === 'string')) {
        // Always retry removal of the former unencrypted token.
        await AsyncStorage.removeItem(key);
        return chunks.join('');
      }
    }

    await Promise.allSettled([clearSecureValue(key)]);

    // Recovery path if a legacy token appears after initialization.
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue) {
      await writeSecureValue(key, legacyValue);
      await AsyncStorage.removeItem(key);
      return legacyValue;
    }

    return null;
  },

  async setItem(key, value) {
    const installationMarker = await AsyncStorage.getItem(INSTALLATION_MARKER);
    if (!installationMarker) {
      // A direct write can be the first storage operation after reinstall.
      // Remove any Keychain value retained by iOS before marking this install.
      await clearSecureValue(key);
      await AsyncStorage.setItem(INSTALLATION_MARKER, '1');
    }
    await writeSecureValue(key, value);
  },

  async removeItem(key) {
    await Promise.all([
      clearSecureValue(key),
      AsyncStorage.removeItem(key),
    ]);
  },
};
