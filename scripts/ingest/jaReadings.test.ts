import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickReading, READINGS } from './jaReadings.ts';

const hiragana = (text: string): string =>
  [...text].map((c) => (c >= 'ァ' && c <= 'ヶ' ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c)).join('');

describe('pickReading', () => {
  it('prefers a common spelling over file order', () => {
    // 彼 is listed as a rare spelling of あれ before its own entry かれ.
    expect(
      pickReading([
        { reading: 'あれ', common: false, rare: true, order: 10 },
        { reading: 'かれ', common: true, rare: false, order: 900 },
      ]),
    ).toBe('かれ');
  });

  it('avoids a rare spelling when nothing is marked common', () => {
    expect(
      pickReading([
        { reading: 'しもべ', common: false, rare: true, order: 1 },
        { reading: 'ぼく', common: false, rare: false, order: 2 },
      ]),
    ).toBe('ぼく');
  });

  it('falls back to file order', () => {
    expect(
      pickReading([
        { reading: 'b', common: false, rare: false, order: 2 },
        { reading: 'a', common: false, rare: false, order: 1 },
      ]),
    ).toBe('a');
  });
});

describe('every shipped Japanese reading is one its sentences use, or reviewed', () => {
  const anchors = new Map<string, { tokens?: string[]; readings?: string[] }>();
  for (const band of [1, 2, 3, 4, 5]) {
    const shard = JSON.parse(readFileSync(`assets/content/ja/anchors.b${band}.json`, 'utf8')) as {
      sentences: Array<{ id: string; tokens?: string[]; readings?: string[] }>;
    };
    for (const sentence of shard.sentences) anchors.set(sentence.id, sentence);
  }

  it('has no unreviewed contradiction', () => {
    const unreviewed: string[] = [];
    for (const band of [1, 2, 3, 4, 5]) {
      const shard = JSON.parse(readFileSync(`assets/content/ja/lexemes.b${band}.json`, 'utf8')) as {
        lexemes: Array<{ headword: string; reading?: string; anchors: string[] }>;
      };
      for (const lexeme of shard.lexemes) {
        if (!lexeme.reading || READINGS[lexeme.headword] !== undefined) continue;
        const used = new Set<string>();
        for (const id of lexeme.anchors) {
          const sentence = anchors.get(id);
          (sentence?.tokens ?? []).forEach((token, index) => {
            if (token === lexeme.headword) used.add(hiragana(sentence?.readings?.[index] ?? ''));
          });
        }
        if (used.size > 0 && !used.has(hiragana(lexeme.reading))) {
          unreviewed.push(`${lexeme.headword} ${lexeme.reading} (sentences: ${[...used].join('/')})`);
        }
      }
    }
    expect(unreviewed).toEqual([]);
  });

  it('applies every reviewed reading', () => {
    const shard = JSON.parse(readFileSync('assets/content/ja/lexemes.b1.json', 'utf8')) as {
      lexemes: Array<{ headword: string; reading?: string }>;
    };
    const byHeadword = new Map(shard.lexemes.map((lexeme) => [lexeme.headword, lexeme.reading]));
    expect(byHeadword.get('彼')).toBe('かれ');
    expect(byHeadword.get('僕')).toBe('ぼく');
    expect(byHeadword.get('本')).toBe('ほん');
    expect(byHeadword.get('日本')).toBe('にほん');
  });
});
