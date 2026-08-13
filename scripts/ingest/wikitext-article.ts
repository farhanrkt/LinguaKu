/**
 * Wikipedia article wikitext → paragraphs of plain prose.
 *
 * Split out from `build-passages.ts` so the rules are testable without a 1.7 GB
 * dump. They are aggressive on purpose: this is the first content in the app
 * that is *running text* rather than a curated sentence pair, and a paragraph
 * with a stray template in it, or half a table, is worse than one fewer
 * paragraph. When in doubt, drop it.
 */

/** Anything shorter is a caption or a fragment, not a passage (§2.4). */
export const MIN_PARAGRAPH_TOKENS = 40;
/** Anything longer is a wall of text on a phone at 4 minutes a day (§2.13). */
export const MAX_PARAGRAPH_TOKENS = 120;

/**
 * Removes a construct that nests, by counting delimiters.
 *
 * A regex cannot do this: `{{cite|{{lang|en}}}}` is one template containing
 * another, and a non-greedy match stops at the first `}}`, leaving `}}` behind
 * in the middle of a sentence.
 */
const stripNested = (text: string, open: string, close: string): string => {
  let result = '';
  let depth = 0;
  for (let index = 0; index < text.length; ) {
    if (text.startsWith(open, index)) {
      depth++;
      index += open.length;
    } else if (depth > 0 && text.startsWith(close, index)) {
      depth--;
      index += close.length;
    } else {
      if (depth === 0) result += text[index];
      index += 1;
    }
  }
  return result;
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** Wikitext → prose, or an empty string if there is nothing worth keeping. */
export const stripWikitext = (wikitext: string): string => {
  let text = decodeEntities(wikitext);

  // References, comments and any other tag pair, contents included.
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<[^>]+>/g, '');

  // Templates and tables, both of which nest.
  text = stripNested(text, '{{', '}}');
  text = stripNested(text, '{|', '|}');

  // Media links carry captions that are themselves wikitext; drop the lot.
  text = text.replace(/\[\[(?:Image|File|Category):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]/gi, '');

  // Ordinary links: keep what a reader would see.
  text = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');
  text = text.replace(/\[\[([^\]]*)\]\]/g, '$1');
  text = text.replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, '$1');
  text = text.replace(/\[https?:\/\/\S+\]/g, '');

  // Emphasis, and the leading colons/asterisks that mark indents and lists.
  text = text.replace(/'{2,}/g, '');
  return text;
};

/**
 * The paragraphs of an article that are usable as graded reading.
 *
 * A paragraph survives only if it is prose all the way through: no list
 * markers, no headings, no leftover markup, and long enough to be worth
 * reading. §2.4's coverage band is a *running-text* criterion (D28), and it
 * only becomes meaningful above roughly seventeen tokens — which is why the
 * floor here is well above that rather than at it.
 */
export const paragraphsOf = (wikitext: string): string[] => {
  const stripped = stripWikitext(wikitext);
  const paragraphs: string[] = [];

  for (const block of stripped.split(/\n\s*\n/)) {
    const paragraph = block.replace(/\s+/g, ' ').trim();
    if (paragraph.length === 0) continue;
    // Headings, list items, indents, table remnants, and anything still
    // carrying markup we failed to strip.
    if (/^[=*#:;|!]/.test(paragraph)) continue;
    if (/[{}[\]|]/.test(paragraph)) continue;
    if (!/^[A-Z"'(]/.test(paragraph)) continue;
    // Must end like a sentence does. A truncated lead is not a passage.
    if (!/[.!?]"?$/.test(paragraph)) continue;

    const tokens = paragraph.split(/\s+/).length;
    if (tokens < MIN_PARAGRAPH_TOKENS || tokens > MAX_PARAGRAPH_TOKENS) continue;
    paragraphs.push(paragraph);
  }

  return paragraphs;
};

/** Pages that are not articles at all. */
export const isArticle = (title: string, wikitext: string): boolean =>
  !title.includes(':') &&
  !/^#redirect/i.test(wikitext.trim()) &&
  !/\(disambiguation\)$/i.test(title) &&
  !title.startsWith('List of');
