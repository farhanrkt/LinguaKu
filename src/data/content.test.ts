import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db.ts';
import {
  STARTER_BANDS,
  anchorPool,
  clearAnchorCache,
  downloadCost,
  ensureBands,
  getAnchor,
  isContentReady,
  type ContentManifest,
} from './content.ts';

/**
 * The shipped content has its own integrity tests in
 * scripts/ingest/content.test.ts. What matters here is the loading contract:
 * lexemes go to IndexedDB and are hash-keyed; sentences stay in memory and are
 * never bulk-imported, which is the whole reason the session starts in ~1s
 * instead of ~43s.
 */

const manifest: ContentManifest = {
  sources: ['tatoeba'],
  license: 'CC BY 2.0 FR',
  version: 1,
  lang: 'en',
  corpus: {},
  shards: [
    { kind: 'lexemes', band: 1, path: 'lexemes.b1.json', count: 1, bytes: 4000, gzipBytes: 900, sha256: 'lex-1' },
    { kind: 'anchors', band: 1, path: 'anchors.b1.json', count: 2, bytes: 8000, gzipBytes: 1800, sha256: 'anc-1' },
    { kind: 'sentences', band: 1, path: 'sentences.b1.json', count: 999, bytes: 1007616, gzipBytes: 250000, sha256: 'sen-1' },
    { kind: 'lexemes', band: 4, path: 'lexemes.b4.json', count: 1, bytes: 4000, gzipBytes: 900, sha256: 'lex-4' },
    { kind: 'anchors', band: 4, path: 'anchors.b4.json', count: 0, bytes: 8000, gzipBytes: 1800, sha256: 'anc-4' },
  ],
};

const payloads: Record<string, unknown> = {
  '/content/en/manifest.json': manifest,
  '/content/en/lexemes.b1.json': {
    sources: ['tatoeba'],
    lexemes: [
      { id: 'en:lex:try', headword: 'try', freqRank: 263, band: 1, anchors: ['tatoeba:eng:1276'] },
    ],
  },
  '/content/en/anchors.b1.json': {
    sources: ['tatoeba'],
    sentences: [
      {
        id: 'tatoeba:eng:1276',
        text: "Let's try something.",
        difficulty: 0.38,
        maxRank: 263,
        tr: { id: 'tatoeba:ind:4713462', text: 'Mari kita coba sesuatu.' },
      },
      {
        id: 'tatoeba:eng:99',
        text: 'She got an A.',
        difficulty: 0.2,
        maxRank: 120,
        tr: { id: 'tatoeba:ind:99', text: 'Dia mendapat nilai A.' },
      },
    ],
  },
  '/content/en/lexemes.b4.json': { sources: ['tatoeba'], lexemes: [] },
  '/content/en/anchors.b4.json': { sources: ['tatoeba'], sentences: [] },
};

let fetchCalls: string[] = [];

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearAnchorCache();
  fetchCalls = [];
  vi.stubGlobal('fetch', (input: string) => {
    fetchCalls.push(input);
    const payload = payloads[input];
    return Promise.resolve({
      ok: payload !== undefined,
      status: payload === undefined ? 404 : 200,
      json: () => Promise.resolve(payload),
    } as Response);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureBands', () => {
  it('imports the vocabulary for the bands asked for', async () => {
    const result = await ensureBands('en', [1], manifest);
    expect(result.imported).toEqual(['lexemes.b1.json']);
    expect(result.items).toBe(1);
  });

  it('never bulk-imports sentences, which is what made this slow', async () => {
    await ensureBands('en', [1], manifest);
    expect(fetchCalls).not.toContain('/content/en/sentences.b1.json');
    expect(await db.sentences.count()).toBe(0);
  });

  it('leaves other bands alone', async () => {
    await ensureBands('en', [1], manifest);
    expect(fetchCalls).not.toContain('/content/en/lexemes.b4.json');
  });

  it('maps a lexeme onto an Item with its anchors and provenance', async () => {
    await ensureBands('en', [1], manifest);
    expect(await db.items.get('en:lex:try')).toMatchObject({
      lang: 'en',
      kind: 'lexeme',
      headword: 'try',
      freqRank: 263,
      band: 1,
      anchorSentenceIds: ['tatoeba:eng:1276'],
      interferenceTags: [],
      sourceRef: { dataset: 'tatoeba', externalId: 'try' },
    });
  });

  it('warms the anchors so the first question does not wait on a fetch', async () => {
    await ensureBands('en', [1], manifest);
    fetchCalls = [];
    expect((await getAnchor('en', 1, 'tatoeba:eng:1276'))?.text).toBe("Let's try something.");
    expect(fetchCalls).toEqual([]);
  });

  it('does not reimport a shard whose hash has not changed', async () => {
    await ensureBands('en', [1], manifest);
    fetchCalls = [];

    const second = await ensureBands('en', [1], manifest);
    expect(second.imported).toEqual([]);
    expect(second.skipped).toEqual(['lexemes.b1.json']);
    expect(fetchCalls).toEqual([]);
  });

  it('reimports when the manifest publishes a new hash', async () => {
    await ensureBands('en', [1], manifest);
    const republished: ContentManifest = {
      ...manifest,
      shards: manifest.shards.map((shard) =>
        shard.path === 'lexemes.b1.json' ? { ...shard, sha256: 'lex-2' } : shard,
      ),
    };

    const result = await ensureBands('en', [1], republished);
    expect(result.imported).toEqual(['lexemes.b1.json']);
    expect((await db.contentShards.get('lexemes.b1.json'))?.sha256).toBe('lex-2');
  });

  it('fetches the manifest itself when one is not supplied', async () => {
    await ensureBands('en', [1]);
    expect(fetchCalls[0]).toBe('/content/en/manifest.json');
  });

  it('records no phantom import when a shard fetch fails', async () => {
    const broken: ContentManifest = {
      ...manifest,
      shards: [{ kind: 'lexemes', band: 2, path: 'missing.json', count: 1, bytes: 4000, gzipBytes: 900, sha256: 'nope' }],
    };
    await expect(ensureBands('en', [2], broken)).rejects.toThrow(/404/);
    expect(await db.contentShards.count()).toBe(0);
  });

  it('still imports vocabulary when the anchors are unreachable offline', async () => {
    // Warming anchors is an optimization; failing to warm must not block the
    // import, or a flaky network would leave the learner with no curriculum.
    const partial: ContentManifest = {
      ...manifest,
      shards: [manifest.shards[0]!, { ...manifest.shards[1]!, band: 9 as never }],
    };
    await expect(ensureBands('en', [1], partial)).resolves.toMatchObject({ items: 1 });
  });
});

describe('anchors', () => {
  it('resolves a sentence and its Indonesian translation together', async () => {
    const anchor = await getAnchor('en', 1, 'tatoeba:eng:1276');
    expect(anchor).toMatchObject({
      text: "Let's try something.",
      tr: { id: 'tatoeba:ind:4713462', text: 'Mari kita coba sesuatu.' },
    });
  });

  it('returns null for a sentence that is not in the band', async () => {
    expect(await getAnchor('en', 1, 'tatoeba:eng:404')).toBeNull();
  });

  it('offers a same-band pool for multiple-choice distractors (SPEC §2.3)', async () => {
    expect((await anchorPool('en', 1)).map((sentence) => sentence.id)).toEqual([
      'tatoeba:eng:1276',
      'tatoeba:eng:99',
    ]);
  });

  it('parses a band once and serves it from memory after that', async () => {
    await anchorPool('en', 1);
    fetchCalls = [];
    await anchorPool('en', 1);
    expect(fetchCalls).toEqual([]);
  });
});

describe('isContentReady', () => {
  it('is false before the first import and true after', async () => {
    expect(await isContentReady('en')).toBe(false);
    await ensureBands('en', [1], manifest);
    expect(await isContentReady('en')).toBe(true);
  });
});

describe('starter set', () => {
  it('reaches band 3, because the default learner is not a beginner (D3)', () => {
    expect(STARTER_BANDS).toEqual([1, 2, 3]);
  });
});

describe('downloadCost', () => {
  it('adds up what the learner’s plan would actually be charged', async () => {
    // Gzipped, because that is what travels — quoting the raw size would
    // overstate the cost by roughly four times.
    const cost = await downloadCost('en', [
      { kind: 'sentences', band: 1 },
      { kind: 'anchors', band: 1 },
    ]);
    expect(cost.gzipBytes).toBe(251_800);
    expect(cost.urls).toEqual([
      '/content/en/sentences.b1.json',
      '/content/en/anchors.b1.json',
    ]);
  });

  it('contributes nothing for a shard the manifest does not list', async () => {
    // Invariant 18's rule applied to bytes: a figure we cannot read is not
    // replaced by a guess, and a band with no passages costs nothing because
    // there is nothing there to fetch.
    const cost = await downloadCost('en', [{ kind: 'passages', band: 5 }]);
    expect(cost.gzipBytes).toBe(0);
    expect(cost.urls).toEqual([]);
  });
});
