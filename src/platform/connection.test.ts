import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionHint, holdBackDownloads, isAlreadyCached } from './connection.ts';

const withConnection = (connection: unknown): void => {
  Object.defineProperty(globalThis, 'navigator', {
    value: connection === undefined ? {} : { connection },
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectionHint', () => {
  it('honours an explicit Save-Data request', () => {
    withConnection({ saveData: true, effectiveType: '4g' });
    // The learner's own OS-level setting, and the most honest signal available.
    expect(connectionHint()).toBe('save-data');
  });

  it('treats 2G as constrained whatever Save-Data says', () => {
    withConnection({ saveData: false, effectiveType: '2g' });
    expect(connectionHint()).toBe('save-data');
    withConnection({ saveData: false, effectiveType: 'slow-2g' });
    expect(connectionHint()).toBe('save-data');
  });

  it('is unconstrained on a fast link with no Save-Data', () => {
    withConnection({ saveData: false, effectiveType: '4g' });
    expect(connectionHint()).toBe('unconstrained');
  });

  it('says unknown rather than guessing where there is no API', () => {
    // Firefox and Safari. An absent API is not evidence of a fast connection.
    withConnection(undefined);
    expect(connectionHint()).toBe('unknown');
  });
});

describe('holdBackDownloads', () => {
  it('follows the learner over the browser, in both directions', () => {
    expect(holdBackDownloads('save', 'unconstrained')).toBe(true);
    expect(holdBackDownloads('full', 'save-data')).toBe(false);
  });

  it('follows the browser on auto', () => {
    expect(holdBackDownloads('auto', 'save-data')).toBe(true);
    expect(holdBackDownloads('auto', 'unconstrained')).toBe(false);
  });

  it('does not hold back on auto when the connection is unknown', () => {
    // The load-bearing case. Two of the three target browsers have no Network
    // Information API, so treating silence as "probably metered" would withhold
    // the reader from most desktop learners and every iPhone on Wi-Fi, on no
    // evidence at all. Withholding what someone expected, on a guess, is the
    // worse failure — and `save` exists for anyone who disagrees.
    expect(holdBackDownloads('auto', 'unknown')).toBe(false);
  });
});

describe('isAlreadyCached', () => {
  it('is false where the Cache API is unavailable', async () => {
    vi.stubGlobal('caches', undefined);
    // Erring towards asking: a false "already downloaded" would spend the
    // learner's quota without telling them, which is the thing this prevents.
    expect(await isAlreadyCached('/content/en/sentences.b1.json')).toBe(false);
  });

  it('is false when the cache throws', async () => {
    vi.stubGlobal('caches', {
      match: () => Promise.reject(new Error('denied')),
    });
    expect(await isAlreadyCached('/content/en/sentences.b1.json')).toBe(false);
  });

  it('is true when the shard is already there', async () => {
    vi.stubGlobal('caches', { match: () => Promise.resolve(new Response('{}')) });
    expect(await isAlreadyCached('/content/en/sentences.b1.json')).toBe(true);
  });
});
