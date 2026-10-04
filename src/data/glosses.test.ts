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

/**
 * A failed fetch is a fact about *right now*. It was being written into the
 * cache as a fact about the content.
 *
 * One flaky moment — offline before the shard had been cached, a service worker
 * still installing — made every word in that band report *"belum ada di kamus
 * kami"* for the rest of the session, even after the network came back. That is
 * invariant 38's false branch, and it is undetectable to the learner because
 * D59 measured gloss coverage at 30% of English lexemes and 4% of Japanese:
 * "no entry" is the ordinary answer, so a wrong one looks exactly like a right
 * one.
 */
describe('a transient failure is not remembered (invariant 38)', () => {
  it('tries again after a network failure instead of caching the silence', async () => {
    clearGlossCache();
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls++;
      return calls === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(
            new Response(JSON.stringify({ glosses: { 'en:lex:bank': ['bank', 'tepi sungai'] } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
    });

    expect(await glossFor('en', 1, 'en:lex:bank')).toEqual([]);
    expect(await glossFor('en', 1, 'en:lex:bank')).toEqual(['bank', 'tepi sungai']);
    expect(calls).toBe(2);
  });

  it('tries again after a server fault, which is also not an answer', async () => {
    clearGlossCache();
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls++;
      return Promise.resolve(
        calls === 1
          ? new Response('', { status: 503 })
          : new Response(JSON.stringify({ glosses: { 'en:lex:bank': ['bank'] } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
      );
    });

    expect(await glossFor('en', 1, 'en:lex:bank')).toEqual([]);
    expect(await glossFor('en', 1, 'en:lex:bank')).toEqual(['bank']);
  });

  it('remembers a 404, because that is a fact about the build', async () => {
    // Japanese ships gloss shards for bands 1-2 only. Re-fetching a shard that
    // does not exist, once per card, is waste rather than caution.
    clearGlossCache();
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls++;
      return Promise.resolve(new Response('', { status: 404 }));
    });

    expect(await glossFor('ja', 5, 'ja:lex:x')).toEqual([]);
    expect(await glossFor('ja', 5, 'ja:lex:x')).toEqual([]);
    expect(calls).toBe(1);
  });
});
