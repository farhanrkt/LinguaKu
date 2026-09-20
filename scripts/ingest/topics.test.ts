import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (lang: string) => {
  const path = join(process.cwd(), 'assets', 'content', lang, 'topics.json');
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as {
        sources: string[];
        topics: Array<{ id: string; label: string; items: number }>;
        items: Record<string, string>;
        coverage: { tagged: number; inventory: number; share: number };
      })
    : null;
};

const inventoryIds = (lang: string): Set<string> => {
  const ids = new Set<string>();
  for (const band of [1, 2, 3, 4, 5]) {
    for (const kind of ['lexemes', 'chunks']) {
      const path = join(process.cwd(), 'assets', 'content', lang, `${kind}.b${band}.json`);
      if (!existsSync(path)) continue;
      const shard = JSON.parse(readFileSync(path, 'utf8')) as {
        lexemes?: Array<{ id: string }>;
        chunks?: Array<{ id: string }>;
      };
      for (const row of shard.lexemes ?? shard.chunks ?? []) ids.add(row.id);
    }
  }
  return ids;
};

describe('the shipped topic map (SPEC §2.10, §2.14)', () => {
  for (const lang of ['en', 'ja']) {
    const pack = read(lang);

    it(`${lang}: every tagged item exists in the inventory`, () => {
      // The point of an authored map is that a human chose the members; the
      // risk is that it rots as the corpus changes. The compiler fails on a
      // miss, and this holds the shipped artefact to the same rule.
      expect(pack).not.toBeNull();
      const ids = inventoryIds(lang);
      for (const itemId of Object.keys(pack!.items)) expect(ids.has(itemId)).toBe(true);
    });

    it(`${lang}: every topic has a label a learner can choose by`, () => {
      for (const topic of pack!.topics) {
        expect(topic.label.length).toBeGreaterThan(0);
        expect(topic.items).toBeGreaterThanOrEqual(5);
      }
    });

    it(`${lang}: no item is in two topics, which would make spacing ambiguous`, () => {
      // The map is item → one topic by construction; this is the assertion that
      // §2.8's per-cluster rule has an unambiguous cluster to count.
      const values = Object.values(pack!.items);
      expect(values.every((topic) => typeof topic === 'string')).toBe(true);
    });

    it(`${lang}: publishes its coverage rather than implying completeness`, () => {
      expect(pack!.coverage.tagged).toBe(Object.keys(pack!.items).length);
      expect(pack!.coverage.share).toBeGreaterThan(0);
      expect(pack!.coverage.share).toBeLessThan(1);
    });

    it(`${lang}: is authored content and says so`, () => {
      expect(pack!.sources).toEqual(['linguaku-authored']);
    });
  }
});
