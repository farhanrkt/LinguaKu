import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGlossCache, glossFor, loadGlosses } from './glosses.ts';

/**
 * The gloss set is partial by measurement — 30% of English lexemes, 4% of
 * Japanese — so "there is no gloss" is a normal path, not an error path, and
 * these cases are mostly about that.
 */

const stubFetch = (payload: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(payload) })),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  clearGlossCache();
});

describe('loadGlosses', () => {
  it('reads a shard into a map', async () => {
    stubFetch({ glosses: { 'en:lex:cat': ['kucing'] } });
    expect((await loadGlosses('en', 1)).get('en:lex:cat')).toEqual(['kucing']);
  });

  it('treats a missing shard as no glosses, not as a failure', async () => {
    // A language may ship none at all, and a learner offline before this band
    // was cached must still get a card.
    stubFetch({}, false);
    expect((await loadGlosses('en', 5)).size).toBe(0);
  });

  it('survives a fetch that throws outright', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect((await loadGlosses('ja', 2)).size).toBe(0);
  });

  it('fetches a band once', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ glosses: {} }) }),
    );
    vi.stubGlobal('fetch', fetcher);
    await loadGlosses('en', 1);
    await loadGlosses('en', 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('glossFor', () => {
  it('returns an empty list for a word with no entry', async () => {
    stubFetch({ glosses: { 'en:lex:cat': ['kucing'] } });
    expect(await glossFor('en', 1, 'en:lex:was')).toEqual([]);
  });

  it('returns the senses for a word that has them', async () => {
    stubFetch({ glosses: { 'en:lex:back': ['punggung, kembali'] } });
    expect(await glossFor('en', 1, 'en:lex:back')).toEqual(['punggung, kembali']);
  });
});
