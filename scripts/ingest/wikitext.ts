/**
 * Wikitext → the text a learner would read.
 *
 * Split out from `build-glosses.ts` so the parsing rules can be tested without
 * running a 345 MB dump through them. The rules are deliberately conservative:
 * a wrong gloss is worse than no gloss, because the app *shows* the first and
 * *admits* the second.
 */

/** id.wiktionary marks a language section as `=={{bahasa|en}}==`. */
const SECTION = /==\s*\{\{bahasa\|([a-z-]+)\}\}\s*==/;

/** Longer than this is an encyclopedia entry, not a gloss a card can show. */
const MAX_GLOSS_LENGTH = 120;

const decodeEntities = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Wikitext → the sentence a learner would read.
 *
 * Templates are dropped rather than expanded: expanding them needs the whole
 * MediaWiki template engine, and the ones that survive in a definition line are
 * mostly context labels (`{{Tek}}`, `{{kiasan}}`) that add nothing to a gloss.
 */
export const cleanGloss = (wikitext: string): string =>
  decodeEntities(wikitext)
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[:;,.\s]+|[:;,\s]+$/g, '')
    .trim();

/**
 * The definitions in one language's section of a page.
 *
 * `#` is a definition; `#:` is an example sentence and `#*` a citation, and
 * both would read as nonsense in a gloss slot.
 */
export const sensesIn = (sectionText: string): string[] => {
  const senses: string[] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#') || trimmed.startsWith('#:') || trimmed.startsWith('#*')) continue;
    const gloss = cleanGloss(trimmed.slice(1));
    if (gloss.length > 0 && gloss.length <= MAX_GLOSS_LENGTH) senses.push(gloss);
  }
  return senses;
};

/** Splits a page into its per-language sections. */
export const sectionsOf = (body: string): Map<string, string[]> => {
  const parts = body.split(new RegExp(SECTION.source, 'g'));
  const sections = new Map<string, string[]>();
  // split() with one capture group yields [pre, lang, text, lang, text, ...].
  for (let index = 1; index + 1 < parts.length; index += 2) {
    const lang = parts[index]!;
    sections.set(lang, [...(sections.get(lang) ?? []), parts[index + 1]!]);
  }
  return sections;
};
