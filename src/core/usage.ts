import { tokenizeLatin } from './tokenize.ts';

/**
 * Did the learner actually use this word in their own sentence? (SPEC §2.3 L6.)
 *
 * L6 is free production — *"use the word in a sentence about your own life"* —
 * and §2.3 is explicit that the only thing about a free sentence we can honestly
 * check is **whether the word is in it**. That check was a bare
 * `sentence.includes(word)`, which is wrong in both directions and worse in the
 * one that matters:
 *
 * | | |
 * |---|---|
 * | *"I have a banana"* contains **an** | credit for a word they did not use |
 * | *"I want to educate people"* contains **cat** | same |
 * | *"She is honest"* contains **on** | same |
 * | *"I took the bus"* does not contain **take** | **blocked, having answered correctly** |
 * | *"He studies every night"* does not contain **study** | same |
 *
 * The false positives land on exactly the band-1 function words a beginner
 * meets first. The false negatives are the §2.7 failure: a learner who produced
 * the word in the form the sentence needed was told they had not.
 *
 * Tokenizing fixes the first column outright — *banana* is one token and it is
 * not *an*. The second column needs morphology, and this deliberately has only
 * as much as it can be sure of: regular inflections by rule, the common
 * irregulars by table, and **no verdict at all** for anything else. The caller
 * is expected to treat a `false` as "could not find it" rather than "they did
 * not write it" — see `FreeProductionTask`, which asks rather than blocks.
 */

/** Suffixes a regular English inflection adds. Longest first, so `ies` wins. */
const SUFFIXES = ['ing', 'ies', 'ied', 'es', 'ed', 's', 'd'] as const;

/**
 * Irregular forms, keyed by the base a learner is taught.
 *
 * Deliberately **not** shared with `scripts/ingest/chunkForms.ts`, whose table
 * looks similar and is doing a different job: that one inflects the *leading
 * verb of an authored collocation* against the corpus and is tuned to the verbs
 * that start collocations. This one has to recognise a form of whatever headword
 * the ladder happened to promote, so it is weighted towards the irregulars a
 * beginner produces rather than the ones that begin set phrases.
 */
const IRREGULAR: Readonly<Record<string, readonly string[]>> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  begin: ['begins', 'began', 'begun', 'beginning'],
  break: ['breaks', 'broke', 'broken', 'breaking'],
  bring: ['brings', 'brought', 'bringing'],
  buy: ['buys', 'bought', 'buying'],
  catch: ['catches', 'caught', 'catching'],
  child: ['children'],
  come: ['comes', 'came', 'coming'],
  do: ['does', 'did', 'done', 'doing'],
  drink: ['drinks', 'drank', 'drunk', 'drinking'],
  drive: ['drives', 'drove', 'driven', 'driving'],
  eat: ['eats', 'ate', 'eaten', 'eating'],
  fall: ['falls', 'fell', 'fallen', 'falling'],
  feel: ['feels', 'felt', 'feeling'],
  find: ['finds', 'found', 'finding'],
  foot: ['feet'],
  forget: ['forgets', 'forgot', 'forgotten', 'forgetting'],
  get: ['gets', 'got', 'gotten', 'getting'],
  give: ['gives', 'gave', 'given', 'giving'],
  go: ['goes', 'went', 'gone', 'going'],
  have: ['has', 'had', 'having'],
  hear: ['hears', 'heard', 'hearing'],
  hold: ['holds', 'held', 'holding'],
  keep: ['keeps', 'kept', 'keeping'],
  know: ['knows', 'knew', 'known', 'knowing'],
  leave: ['leaves', 'left', 'leaving'],
  lose: ['loses', 'lost', 'losing'],
  make: ['makes', 'made', 'making'],
  man: ['men'],
  meet: ['meets', 'met', 'meeting'],
  pay: ['pays', 'paid', 'paying'],
  put: ['puts', 'putting'],
  read: ['reads', 'reading'],
  run: ['runs', 'ran', 'running'],
  say: ['says', 'said', 'saying'],
  see: ['sees', 'saw', 'seen', 'seeing'],
  sell: ['sells', 'sold', 'selling'],
  send: ['sends', 'sent', 'sending'],
  sit: ['sits', 'sat', 'sitting'],
  sleep: ['sleeps', 'slept', 'sleeping'],
  speak: ['speaks', 'spoke', 'spoken', 'speaking'],
  stand: ['stands', 'stood', 'standing'],
  take: ['takes', 'took', 'taken', 'taking'],
  teach: ['teaches', 'taught', 'teaching'],
  tell: ['tells', 'told', 'telling'],
  think: ['thinks', 'thought', 'thinking'],
  understand: ['understands', 'understood', 'understanding'],
  wake: ['wakes', 'woke', 'woken', 'waking'],
  wear: ['wears', 'wore', 'worn', 'wearing'],
  woman: ['women'],
  write: ['writes', 'wrote', 'written', 'writing'],
};

/** Consonant-doubling before `-ed`/`-ing`: *stop → stopped*, *sit → sitting*. */
const doubled = (base: string): string | null => {
  const last = base.at(-1) ?? '';
  const before = base.at(-2) ?? '';
  if (!/[bdgklmnprt]/.test(last)) return null;
  if (!/[aeiou]/.test(before) || /[aeiou]/.test(base.at(-3) ?? '')) return null;
  return base + last;
};

/** Whether `token` is a plausible regular inflection of `base`. */
const isRegularFormOf = (token: string, base: string): boolean => {
  if (token === base) return true;

  for (const suffix of SUFFIXES) {
    if (!token.endsWith(suffix)) continue;
    const stem = token.slice(0, -suffix.length);

    // walks / walked / walking
    if (stem === base) return true;
    // making, loses: the silent `e` is dropped before the suffix.
    if (`${stem}e` === base) return true;
    // studies, studied: `y` became `i` before `-es` / `-ed`.
    if ((suffix === 'ies' || suffix === 'ied') && `${stem}y` === base) return true;
    // stopped, sitting: the final consonant doubled.
    if (stem === doubled(base)) return true;
  }
  return false;
};

/** Every form of `word` this module is willing to vouch for. */
export const formsOf = (word: string): string[] => {
  const base = word.trim().toLowerCase();
  return [base, ...(IRREGULAR[base] ?? [])];
};

export interface UsageInput {
  sentence: string;
  /** The headword the learner was asked to use. May be a multi-word chunk. */
  word: string;
  lang: string;
}

/**
 * Japanese is not space-delimited and the morphological analyser is a
 * **build-time** dependency (D10, and invariant 6 keeps it out of the bundle),
 * so there is no honest way to tokenize a learner's own Japanese sentence here.
 * Substring containment is what we have, and it is far safer in Japanese than in
 * English: there are no inflectional prefixes to produce the kind of collision
 * that lets "an" hide inside "banana".
 */
export const usesWord = ({ sentence, word, lang }: UsageInput): boolean => {
  const target = word.trim().toLowerCase();
  if (target.length === 0) return true;

  if (lang === 'ja') return sentence.toLowerCase().includes(target);

  const tokens = tokenizeLatin(sentence);
  const wanted = tokenizeLatin(target);
  if (wanted.length === 0) return true;

  // A chunk ("how are you") has to appear as a run, in order. Only its first
  // word is inflected, for the same reason `chunkForms` only inflects that one:
  // without part-of-speech tags, inflecting the rest invents forms.
  for (let start = 0; start + wanted.length <= tokens.length; start++) {
    const head = tokens[start] ?? '';
    const first = wanted[0] ?? '';
    const headMatches =
      formsOf(first).includes(head) || isRegularFormOf(head, first);
    if (!headMatches) continue;

    let all = true;
    for (let offset = 1; offset < wanted.length; offset++) {
      if (tokens[start + offset] !== wanted[offset]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
};
