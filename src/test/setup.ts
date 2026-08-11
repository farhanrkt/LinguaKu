// Dexie needs a real IndexedDB implementation under Node.
import 'fake-indexeddb/auto';

/**
 * A minimal `localStorage`, because the test environment is `node` and the app
 * targets browsers.
 *
 * Only one thing uses it: the sync settings (src/platform/sync.ts). That is
 * deliberate rather than an inconsistency with Dexie holding everything else —
 * the endpoint and bearer token are **device-local secrets**, and the one place
 * they must never appear is the JSON export bundle a learner might send to
 * someone. Keeping them out of the database keeps them out of the export by
 * construction.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}
