export type StorageDurability = 'persisted' | 'best-effort';

/**
 * The learner's entire history lives in IndexedDB (SPEC §5.1), and browsers
 * evict best-effort storage under pressure — which on the reference device
 * (a cheap Android with a full disk) is a real event, not a theoretical one.
 * Asking for persistence is cheap; losing a year of review logs is not.
 */
export const requestPersistentStorage = async (): Promise<StorageDurability> => {
  if (!navigator.storage?.persist) return 'best-effort';
  try {
    const granted = (await getStorageDurability()) === 'persisted' || (await navigator.storage.persist());
    return granted ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
};

/** Read-only check — never prompts, safe to call on every mount. */
export const getStorageDurability = async (): Promise<StorageDurability> => {
  if (!navigator.storage?.persisted) return 'best-effort';
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
};
