/**
 * The surface forms an English chunk actually appears in.
 *
 * A chunk is authored in its base form — "take a shower" — and the corpus
 * contains *"took a shower"*, *"takes a shower"*, *"taking a shower"*. Matching
 * the base form alone rejected a third of the authored list on the first run,
 * including "take a bath" and "make the bed", which are plainly attested. The
 * rejection was an artefact of the matcher, not a fact about the corpus.
 *
 * So the leading verb is inflected before matching. Deliberately **only** the
 * leading verb, and only where it is a known one:
 *
 *  - the pipeline has no part-of-speech tags (D34), so inflecting an arbitrary
 *    first word would turn "on foot" into "ons foot" and match nothing, or
 *    worse, match something wrong;
 *  - a closed list of the verbs that actually start collocations is small,
 *    checkable, and fails safe — an unknown leading word simply matches
 *    literally, exactly as before.
 *
 * The learner is still taught the base form. This only decides which sentences
 * count as examples of it.
 */

/** Irregulars, which no rule generates. Present tense → the rest. */
const IRREGULAR: Readonly<Record<string, readonly string[]>> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  do: ['does', 'did', 'done', 'doing'],
  get: ['gets', 'got', 'gotten', 'getting'],
  give: ['gives', 'gave', 'given', 'giving'],
  go: ['goes', 'went', 'gone', 'going'],
  have: ['has', 'had', 'having'],
  find: ['finds', 'found', 'finding'],
  keep: ['keeps', 'kept', 'keeping'],
  make: ['makes', 'made', 'making'],
  pay: ['pays', 'paid', 'paying'],
  put: ['puts', 'putting'],
  take: ['takes', 'took', 'taken', 'taking'],
  feel: ['feels', 'felt', 'feeling'],
  wake: ['wakes', 'woke', 'woken', 'waking'],
  hold: ['holds', 'held', 'holding'],
  leave: ['leaves', 'left', 'leaving'],
  come: ['comes', 'came', 'coming'],
  run: ['runs', 'ran', 'running'],
  say: ['says', 'said', 'saying'],
};

/** Regulars this list actually uses. Anything absent is matched literally. */
const REGULAR: readonly string[] = [
  'look',
  'turn',
  'pick',
  'drop',
  'fill',
  'hand',
  'work',
  'brush',
  'clean',
  'wash',
  'watch',
  'help',
  'call',
  'ask',
  'answer',
  'start',
  'finish',
  'move',
  'open',
  'close',
  'want',
  'need',
  'try',
  'stay',
  'walk',
  'talk',
  'listen',
  'learn',
  'study',
];

const DOUBLES = new Set(['drop', 'stop', 'plan', 'shop']);

/** Regular inflections: -s, -ed, -ing, with the spelling rules they need. */
const regularForms = (verb: string): string[] => {
  const forms = new Set<string>();
  forms.add(verb.endsWith('s') || verb.endsWith('h') || verb.endsWith('o') ? `${verb}es` : `${verb}s`);

  if (verb.endsWith('e')) {
    forms.add(`${verb}d`);
    forms.add(`${verb.slice(0, -1)}ing`);
  } else if (verb.endsWith('y') && !/[aeiou]y$/.test(verb)) {
    forms.add(`${verb.slice(0, -1)}ied`);
    forms.add(`${verb}ing`);
    forms.add(`${verb.slice(0, -1)}ies`);
  } else if (DOUBLES.has(verb)) {
    forms.add(`${verb}${verb.slice(-1)}ed`);
    forms.add(`${verb}${verb.slice(-1)}ing`);
  } else {
    forms.add(`${verb}ed`);
    forms.add(`${verb}ing`);
  }
  return [...forms];
};

/**
 * Every surface form of a chunk, base form first.
 *
 * Also handles the possessive that daily-routine chunks are written with:
 * "brush my teeth" is said with every possessive there is, and a corpus example
 * using *her* teeth is the same chunk.
 */
/**
 * Object pronouns that split a separable phrasal verb.
 *
 * "drop off" is said as *"drop me off"* far more often than as "drop off", and
 * the corpus proves it: `Please drop me off at the station.` A matcher that
 * cannot see through the object rejects the phrase as unattested when it is in
 * fact everywhere. Only two-word verbs split, and only a pronoun goes in the
 * gap — a full noun phrase would need parsing this pipeline does not do.
 */
const OBJECTS = ['me', 'you', 'him', 'her', 'it', 'us', 'them'];

export const surfaceForms = (chunk: string): string[] => {
  const words = chunk.trim().split(/\s+/);
  const head = words[0]?.toLowerCase() ?? '';
  const rest = words.slice(1);

  const isVerb = head in IRREGULAR || REGULAR.includes(head);
  const heads = [
    words[0] ?? '',
    ...(IRREGULAR[head] ?? (REGULAR.includes(head) ? regularForms(head) : [])),
  ];

  const possessives = ['my', 'your', 'his', 'her', 'our', 'their', 'the'];
  const bodies: string[][] = [rest];
  const possessiveAt = rest.findIndex((word) => possessives.includes(word.toLowerCase()));
  if (possessiveAt !== -1) {
    for (const possessive of possessives) {
      const variant = [...rest];
      variant[possessiveAt] = possessive;
      bodies.push(variant);
    }
  }

  const forms = new Set<string>();
  for (const verb of heads) {
    for (const body of bodies) {
      forms.add([verb, ...body].join(' ').trim());
      // The separable form, for two-word phrasal *verbs* only. Without the
      // verb check this turns "on foot" into "on me foot", which matches
      // nothing and would quietly widen every non-verb chunk.
      if (isVerb && body.length === 1 && rest.length === 1) {
        for (const object of OBJECTS) forms.add([verb, object, ...body].join(' '));
      }
    }
  }
  return [...forms];
};
