import { describe, expect, it } from 'vitest';
import { cleanGloss, sectionsOf, sensesIn } from './wikitext.ts';

/**
 * The wikitext these read is written by thousands of people to no schema, so
 * the parser's job is to be conservative: a gloss that is wrong is worse than
 * a word with no gloss, because the app shows the first and admits the second.
 */

describe('cleanGloss', () => {
  it('keeps the target of a piped link, not its label', () => {
    expect(cleanGloss(' [[kucing]]')).toBe('kucing');
    expect(cleanGloss(' [[air|airnya]]')).toBe('airnya');
  });

  it('drops context templates rather than trying to expand them', () => {
    expect(cleanGloss(' {{Tek}} bahan cair kental')).toBe('bahan cair kental');
  });

  it('decodes the entities the dump escapes', () => {
    expect(cleanGloss(' cat air &lt;br /&gt; kental')).toBe('cat air kental');
  });

  it('strips emphasis and trailing punctuation', () => {
    expect(cleanGloss(" ''buku'' :")).toBe('buku');
  });
});

describe('sensesIn', () => {
  it('takes definitions and leaves examples and citations alone', () => {
    const section = [
      '# [[kucing]]',
      "#: ''Kucing itu tidur''",
      '#* sebuah kutipan',
      '# hewan',
    ].join('\n');
    expect(sensesIn(section)).toEqual(['kucing', 'hewan']);
  });

  it('drops an entry long enough to be an encyclopedia paragraph', () => {
    expect(sensesIn(`# ${'kata '.repeat(40)}`)).toEqual([]);
  });
});

describe('sectionsOf', () => {
  it('separates the English section from the Indonesian one on the same page', () => {
    // "cat" is a real collision: an Indonesian word (paint) and an English one.
    const page = [
      '=={{bahasa|id}}==',
      '# bahan pewarna',
      '=={{bahasa|en}}==',
      '# [[kucing]]',
    ].join('\n');
    const sections = sectionsOf(page);
    expect(sensesIn(sections.get('en')!.join('\n'))).toEqual(['kucing']);
    expect(sensesIn(sections.get('id')!.join('\n'))).toEqual(['bahan pewarna']);
  });
});
