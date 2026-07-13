import AsyncStorage from '@react-native-async-storage/async-storage';

const {
  createPersistedCheckInQueue,
} = require('./persistedCheckInQueue.cjs');

export function createAsyncStorageCheckInQueue({
  storage = AsyncStorage,
  ...options
} = {}) {
  return createPersistedCheckInQueue({ storage, ...options });
}

export const asyncStorageCheckInQueue = createAsyncStorageCheckInQueue();
