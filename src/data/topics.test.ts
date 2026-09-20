import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTopicCache, loadTopics, peekTopics } from './topics.ts';

const pack = {
  topics: [{ id: 'food', label: 'Makanan dan minuman', items: 30 }],
  items: { 'en:lex:rice': 'food' },
  coverage: { tagged: 366, inventory: 5318, share: 0.0688 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearTopicCache();
});

describe('loadTopics', () => {
  it('reads the shard into a map the composer can query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(pack) })),
    );
    const loaded = await loadTopics('en');
    expect(loaded.byItem.get('en:lex:rice')).toBe('food');
    expect(loaded.topics[0]?.label).toBe('Makanan dan minuman');
  });

  it('behaves as though topics never existed when the shard is missing', async () => {
    // A language with no topic map, or a learner offline before it cached.
    // Nothing about the session may depend on it (SPEC §5.4).
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    const loaded = await loadTopics('ja');
    expect(loaded.topics).toEqual([]);
    expect(loaded.byItem.size).toBe(0);
  });

  it('survives a fetch that throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect((await loadTopics('en')).topics).toEqual([]);
  });

  it('is null to peek before it is loaded, so the composer never awaits it', async () => {
    expect(peekTopics('en')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(pack) })),
    );
    await loadTopics('en');
    expect(peekTopics('en')?.topics).toHaveLength(1);
  });

  it('publishes how partial the tagging is rather than implying it is complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(pack) })),
    );
    expect((await loadTopics('en')).coverage.share).toBeCloseTo(0.069, 3);
  });
});
