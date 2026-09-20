import type { DataPreference } from '../data/types.ts';

/**
 * What the network is likely to cost the learner (SPEC §5.4).
 *
 * §5.4 names the reference device as *"Indonesian mid-range Android on mobile
 * data"*, and the app has respected that in its architecture since M2: the
 * beginner's first download is budgeted at 8 MB and everything else is fetched
 * on demand. What was missing is the other half — nothing told the learner when
 * a tap was about to spend their quota, and nothing let them say no.
 *
 * Opening the reader for the first time fetches its band's sentence shards:
 * **about 415 KB gzipped** for an English learner at band 2, and 479 KB for a
 * Japanese one. Cached forever afterwards, and free to someone on Wi-Fi. On a
 * prepaid plan it is money.
 */

export type ConnectionHint =
  /** The learner (or their OS) has asked for less data, or the link is 2G. */
  | 'save-data'
  | 'unconstrained'
  /** No Network Information API — Firefox and Safari. Never guessed at. */
  | 'unknown';

/** The learner's own choice, which always outranks the browser's hint. */
export type { DataPreference } from '../data/types.ts';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** Effective types that mean "this will be slow and probably metered". */
const CONSTRAINED = new Set(['slow-2g', '2g']);

export const connectionHint = (): ConnectionHint => {
  const connection = (
    globalThis.navigator as (Navigator & { connection?: NetworkInformationLike }) | undefined
  )?.connection;
  if (!connection) return 'unknown';
  if (connection.saveData === true) return 'save-data';
  if (connection.effectiveType !== undefined && CONSTRAINED.has(connection.effectiveType)) {
    return 'save-data';
  }
  return 'unconstrained';
};

/**
 * Whether an optional download should wait for the learner to ask for it.
 *
 * **`unknown` does not hold back**, and that is the load-bearing decision here.
 * Two browsers of the three this app targets have no Network Information API at
 * all, so treating silence as "probably metered" would withhold the reader from
 * most desktop learners and every iPhone on Wi-Fi, on no evidence. Withholding
 * content someone expected, on a guess, is a worse failure than the download —
 * and anyone who wants it held back can say so, which is what `save` is for.
 */
export const holdBackDownloads = (
  preference: DataPreference,
  hint: ConnectionHint,
): boolean => {
  if (preference === 'save') return true;
  if (preference === 'full') return false;
  return hint === 'save-data';
};

/**
 * Whether this URL is already in a cache, i.e. whether fetching it is free.
 *
 * A learner who downloaded the reader last week should not be asked to approve
 * it again — the service worker already has it, and asking would be a false
 * warning about a cost that does not exist. Resolves false wherever the Cache
 * API is unavailable or refuses, which errs towards asking.
 */
export const isAlreadyCached = async (url: string): Promise<boolean> => {
  try {
    const cache = globalThis.caches;
    if (!cache) return false;
    return (await cache.match(url, { ignoreSearch: true })) !== undefined;
  } catch {
    return false;
  }
};
