import type { TargetLang } from '../data/types.ts';
/**
 * All learner-facing copy lives here (SPEC §10: Indonesian-first, warm, plain,
 * no exam-anxiety framing). A second locale is a second module of the same
 * shape — components never hold literal strings.
 *
 * Tone rules, derived from SPEC §2.14 and docs/ETHICS.md:
 *  - describe capability, never points;
 *  - never imply loss, shame, or a broken streak;
 *  - address the learner as "Anda", in a professional register: standard
 *    vocabulary, complete sentences, no slang or chat abbreviations (D110).
 *    Courteous, not stiff — the voice of a good teacher, not of a form.
 */
export const copy = {
  app: {
    name: 'LinguaKu',
    tagline: 'Belajar bahasa tanpa akun dan tanpa menghabiskan kuota.',
  },
  firstRun: {
    heading: 'Bahasa apa yang ingin Anda pelajari?',
    // D53: one language at a time, said out loud. Switching later costs nothing
    // and loses nothing, so the copy promises exactly that and no more.
    subheading:
      'Pilih satu terlebih dahulu. Anda dapat menggantinya kapan saja, dan kemajuan bahasa yang lain tetap tersimpan. Tidak perlu mendaftar.',
    targets: {
      en: { label: 'Bahasa Inggris', hint: 'Bagi Anda yang sudah mempelajarinya di sekolah' },
      ja: { label: 'Bahasa Jepang', hint: 'Dimulai dari nol, dari hiragana' },
    },
    minutesHeading: 'Berapa lama Anda ingin berlatih setiap hari?',
    minutesHint: 'Latihan singkat setiap hari jauh lebih efektif daripada latihan panjang yang jarang.',
    minutes: {
      4: { label: '4 menit', hint: 'Cukup untuk satu sesi singkat' },
      8: { label: '8 menit', hint: 'Sesuai untuk sebagian besar orang' },
      15: { label: '15 menit', hint: 'Untuk latihan yang lebih intensif' },
    },
    start: 'Mulai',
    needTarget: 'Silakan pilih bahasa yang ingin Anda pelajari.',
  },
  /**
   * The Japanese word sheet: every word shown can be opened to its reading,
   * romaji and meaning, and a word of two or more kanji to each character.
   */
  word: {
    meaning: 'Arti',
    combinedMeaning: 'Arti gabungan',
    // A particle or an ending has a job, not a definition (D112).
    formNote: 'Keterangan',
    noMeaning: 'Arti kata ini belum tersedia dalam kamus kami. Terjemahan kalimatnya dapat menjadi petunjuk.',
    perKanji: 'Arti per huruf',
    theKanji: 'Hurufnya',
    englishMeaning: (meanings: string) => `Bahasa Inggris: ${meanings}`,
    baseForm: (word: string, romaji: string) => `Bentuk kamus: ${word} (${romaji})`,
    noKanjiEntry: 'Huruf ini belum ada dalam daftar kanji kami.',
    hint: 'Ketuk kata mana pun untuk melihat bacaan dan artinya.',
    close: 'Tutup',
  },
  home: {
    /**
     * What today actually holds, said before the learner commits to it.
     *
     * Counts, never targets (§2.15) and never praise (§2.14): "12 ulangan" is
     * a fact about the deck, and a finished day is reported the same flat way a
     * busy one is. Nothing here can be fallen behind on.
     */
    today: {
      // The noun only: the view sets the figure beside it in tabular numerals,
      // so the number and its label are never spliced back out of a sentence.
      dueLabel: 'ulangan',
      newLabel: 'kata baru',
      clear: 'Ulangan hari ini sudah selesai. Kata baru tersedia lagi besok.',
      // Not the same sentence: a learner who switched new words off is not
      // waiting for tomorrow, and telling them otherwise would be a small lie
      // about their own setting.
      clearPaused: 'Tidak ada ulangan yang jatuh tempo, dan kata baru sedang Anda nonaktifkan.',
      capReached: 'Batas kata baru hari ini sudah tercapai. Ulangan tetap berjalan.',
    },
    greeting: 'Selamat datang',
    update: {
      ready: 'Versi baru LinguaKu sudah siap digunakan.',
      apply: 'Muat ulang sekarang',
    },
    // Followed by the language's bare name: "… bahasa Inggris".
    learningLabel: 'Anda sedang mempelajari bahasa',
    minutesLabel: 'Target harian',
    /**
     * SPEC §4.3's ladder, as a choice rather than a silent default.
     *
     * `scriptMode` has been on the profile since M6 and defaulted to `kana` for
     * Japanese, which replaces every kanji with its reading — and nothing read
     * it and nothing could change it, so a Japanese learner had no way up the
     * ladder and no way to see it. The romaji hint says what §4.3 says about
     * romaji: it is the rung you leave. That is a fact about the writing system,
     * not a judgement about the learner.
     */
    changeScript: 'Tulisan Jepang',
    scriptHint: 'Anda dapat mengubahnya kapan saja. Pilihan ini tidak mengubah kata yang Anda pelajari.',
    script: {
      romaji: {
        label: 'Romaji (watashi)',
        hint: 'Paling mudah dibaca di awal, dan merupakan tahap yang paling cepat Anda tinggalkan.',
      },
      kana: {
        label: 'Kana (わたし)',
        hint: 'Kanji diganti dengan bacaannya.',
      },
      kanji: {
        label: 'Kanji dengan bacaan di atasnya (私)',
        hint: 'Bacaan di atas kanji hilang dengan sendirinya setelah kanji itu kuat dalam ingatan Anda.',
      },
    },
    changeMinutes: 'Ubah target harian',
    changeTargets: 'Ubah bahasa',
    /**
     * The home screen leads with where the learner is (v1.34.0).
     *
     * It used to lead with settings: three blocks of choice cards and a
     * diagnostics list, with the start button pinned below them — which a user
     * called "not structured and weird", and v1.23.0 made worse by adding a
     * fourth block. Those moved to the settings screen, where §10 already said
     * everything that is not practice belongs.
     *
     * What replaces them is capability, never a score (§2.14): how much of
     * everyday language the words they have secured already cover, and which
     * words are closest to slipping — both measured, both with an honest empty
     * state for a learner who has not started.
     */
    dashboard: {
      reachHeading: 'Sejauh ini',
      /**
       * Never "0%".
       *
       * A learner three words in rounds to zero, and `0%` tells them their work
       * was worth nothing — the loss framing §2.14 bans, arrived at by
       * arithmetic rather than by wording. Under one percent the sentence drops
       * the percentage and keeps the count, which is the part that is theirs.
       */
      reach: (percent: number, words: number) =>
        percent < 1
          ? `${words.toLocaleString('id-ID')} kata telah Anda kuasai. Persentasenya akan mulai terlihat setelah beberapa ratus kata.`
          : `${words.toLocaleString('id-ID')} kata telah Anda kuasai — sekitar ${percent}% dari kata yang muncul sehari-hari.`,
      reachEmpty: 'Satu sesi latihan sudah cukup untuk mulai mengisi bagian ini.',
      slippingHeading: 'Paling dekat untuk terlupa',
      slippingHint: 'Kata-kata ini muncul lebih dahulu pada sesi berikutnya.',
      slippingEmpty: 'Belum ada kata yang mulai memudar dari ingatan Anda.',
    },
    statusHeading: 'Status aplikasi',
    offlineReady: 'Siap digunakan secara offline',
    offlinePreparing: 'Menyiapkan mode offline…',
    offlineUnavailable: 'Mode offline belum aktif di peramban ini',
    storagePersisted: 'Data Anda tersimpan dengan aman di perangkat ini',
    storageBestEffort: 'Data tersimpan di perangkat ini (dapat dihapus oleh peramban jika memori penuh)',
    // SPEC §2.6: a device that cannot speak is told so plainly, and the reason
    // the listening exercises are missing is not left as a mystery.
    audioProbing: 'Memeriksa suara di perangkat ini…',
    audioReady: 'Suara aktif — latihan mendengarkan tersedia',
    audioDead: 'Perangkat ini belum dapat mengeluarkan suara, sehingga latihan mendengarkan kami sembunyikan untuk sementara',
  },
  /** SPEC §10: Japanese input without an IME headache. */
  kana: {
    showKeyboard: 'Papan kana',
    hideKeyboard: 'Tutup papan kana',
    hiragana: 'あ hiragana',
    katakana: 'ア katakana',
    hint: 'Ketik dengan huruf Latin dan teks akan otomatis menjadi kana. Anda juga dapat mengetuk hurufnya di bawah.',
  },
  langNames: {
    en: 'Inggris',
    ja: 'Jepang',
  },
  session: {
    start: (minutes: number) => `Latihan ${minutes} menit`,
    /**
     * The home button. "Latihan 4 menit" promised four minutes on a day whose
     * new-word allowance held six cards — under one. The estimate is today's
     * actual load, never more than the learner's own daily target.
     */
    startToday: (minutes: number) =>
      minutes <= 1 ? 'Mulai latihan (sekitar 1 menit)' : `Mulai latihan (sekitar ${minutes} menit)`,
    startPlain: 'Mulai latihan',
    resume: 'Lanjutkan latihan',
    // SPEC §2.14: declining is a first-class action, not a hidden escape. The
    // wording is the spec's own — "belum perlu", not "lewati" — because it says
    // the word is fine and the timing is not.
    /** An honest miss on a typed card — no invented answer, no confidence. */
    dontKnow: 'Saya tidak tahu',
    skipItem: 'Kata ini belum saya perlukan',
    // A drill or a sentence puzzle is not a word, and skipping one defers
    // nothing — it only moves on.
    skipQuestion: 'Lewati soal ini',
    preparing: 'Menyiapkan materi…',
    downloading: 'Mengunduh materi (hanya sekali)…',
    empty: 'Semua materi hari ini sudah Anda selesaikan. Sampai jumpa besok.',
    progress: (done: number, total: number) => `${done} dari ${total}`,
    quit: 'Akhiri sesi',

    exposure: {
      heading: 'Perkenalan',
      instruction: 'Baca dan dengarkan. Belum perlu dihafalkan.',
      confirm: 'Saya mengerti',
    },

    /**
     * The thumb shortcut. Every one of these is also a button, so this copy
     * never carries an instruction a learner *must* follow — it tells them a
     * faster way exists and names what each direction does.
     */
    swipe: {
      confirm: 'Mengerti',
      defer: 'Belum perlu',
      next: 'Lanjut',
      hint: 'Geser kartu ini, atau gunakan tombol di bawah.',
    },

    /**
     * The card, after it has been answered.
     *
     * It stays on screen because the feedback refers to it — the correct answer
     * only means something in the sentence it belongs to — but it stops being a
     * question. No controls, and it says which it is.
     */
    answered: {
      label: 'Soal sebelumnya',
      yours: (raw: string) => `Jawaban Anda: “${raw}”`,
    },

    /**
     * The meaning of the word itself, as opposed to the sentence it sits in.
     *
     * Glosses cover 30% of English words (measured, D59), so the absent case
     * is a common one and it gets said out loud rather than rendering nothing —
     * the reader has done this since v1.7.0 and the session was the surface
     * that stayed silent.
     */
    meaning: {
      label: 'Arti kata',
      none: 'Kata ini belum ada dalam kamus kami. Terjemahan kalimatnya dapat menjadi petunjuk.',
      sentenceLabel: 'Kalimat lengkap',
    },
    recognition: {
      heading: 'Manakah artinya?',
      /** L1 as a word choice: which word completes the sentence. */
      wordHeading: 'Kata manakah yang melengkapi kalimat ini?',
    },
    cloze: {
      /** The first letter and length of the missing word. */
      hint: (shown: string) => `Petunjuk: ${shown}`,
      supported: 'Lengkapi kalimat ini',
      unaided: 'Lengkapi kalimat ini tanpa bantuan',
      placeholder: 'Ketik kata yang hilang',
      // SCIENCE: judgment-of-learning — see SPEC §2.12. Both buttons submit,
      // so the confidence signal costs no extra tap.
      sure: 'Yakin',
      unsure: 'Ragu',
    },

    feedback: {
      correct: 'Tepat.',
      // A Japanese answer carries its romaji, so it can be said aloud.
      nearMiss: (answer: string, romaji?: string) =>
        romaji
          ? `Hampir tepat. Yang dimaksud adalah “${answer}” (${romaji}).`
          : `Hampir tepat. Yang dimaksud adalah “${answer}”.`,
      wrong: (answer: string, romaji?: string) =>
        romaji ? `Jawaban yang tepat: “${answer}” (${romaji}).` : `Jawaban yang tepat: “${answer}”.`,
      /** How a right Japanese answer reads (D111). */
      reads: (answer: string, romaji: string) => `“${answer}” dibaca ${romaji}.`,
      /**
       * L6 when the word could not be found in the sentence and the learner
       * sent it anyway. Their sentence stands, but it is not called correct:
       * nothing checked it.
       */
      freeUnverified: (word: string) =>
        `Kalimat Anda tersimpan. Kata “${word}” tidak terdeteksi secara otomatis, sehingga tidak kami tandai sebagai benar.`,
      freeVerified: (word: string) => `Tepat — kata “${word}” terdapat dalam kalimat Anda.`,
      promoted: (character: boolean) =>
        character ? 'Huruf ini naik ke tahap latihan berikutnya.' : 'Kata ini naik ke tahap latihan berikutnya.',
      demoted: (character: boolean) =>
        character
          ? 'Huruf ini akan diulang dengan latihan yang lebih ringan.'
          : 'Kata ini akan diulang dengan latihan yang lebih ringan.',
      leech: (character: boolean) =>
        character ? 'Huruf ini akan diajarkan ulang.' : 'Kata ini akan diajarkan ulang dengan contoh lain.',
      next: 'Lanjut',
    },

    summary: {
      heading: 'Sesi selesai',
      // SPEC §2.14: capability, never points.
      strengthened: (count: number) => `${count} kata menjadi lebih kuat dalam ingatan Anda.`,
      learned: (count: number) => `${count} kata baru Anda kenali.`,
      // Kana and kanji are characters, not words.
      characters: (count: number) => `${count} huruf baru Anda kenali.`,
      promoted: (count: number) => `${count} kata naik ke latihan yang lebih menantang.`,
      built: (count: number) =>
        count === 1 ? 'Satu kalimat Anda susun ulang.' : `${count} kalimat Anda susun ulang.`,
      drilled: (count: number) =>
        count === 1 ? 'Satu pola tata bahasa Anda latih.' : `${count} pola tata bahasa Anda latih.`,
      nothing: 'Belum ada yang dikerjakan.',
      done: 'Kembali',
    },

    /**
     * SPEC §4.3's syllabary, finally taught.
     *
     * The app shipped 1,748 kanji as learnable items against fifteen
     * single-kana lexemes — all particles — and promised "mulai dari nol, dari
     * hiragana" on its first screen. These are the characters that promise
     * refers to. The copy names the sound, never a "level", and says which of
     * the two scripts this one belongs to, because that is the single thing
     * that confuses an absolute beginner most.
     */
    kana: {
      heading: 'Huruf baru',
      instruction: 'Ini bunyinya. Ucapkan sekali dengan suara keras, lalu lanjutkan.',
      recall: 'Bagaimana huruf ini dibaca? Tuliskan dengan huruf Latin.',
      // Not an example sound: any example is some character's answer, and
      // "Contoh: ka" printed the answer on the か card.
      placeholder: 'Tulis dengan huruf Latin',
      scriptLabel: { hiragana: 'Hiragana', katakana: 'Katakana' },
      verdict: (character: string, romaji: string) => `${character} dibaca “${romaji}”.`,
      /** The same sound in the *other* script, named as that script. */
      counterpart: (other: string, romaji: string, otherScript: string) =>
        `Bunyi yang sama (${romaji}) ditulis ${other} dalam ${otherScript}.`,
      confirm: 'Saya mengerti',
      submit: 'Jawab',
    },

    kanji: {
      heading: 'Mengenal huruf',
      instruction: 'Perhatikan bagian-bagiannya — itulah yang membuat huruf ini mudah diingat.',
      componentsHeading: 'Tersusun dari',
      readingHeading: 'Dibaca',
      /**
       * KANJIDIC2's meanings are English and there is no Indonesian source for
       * them — the gloss shards cover 274 Japanese lexemes and 0 kanji. The
       * card said nothing at all about meaning, which is worse than saying it
       * in a language the learner has at least studied at school, as long as
       * the heading is honest about which language that is (D106).
       */
      meaningHeading: 'Artinya (bahasa Inggris)',
      /**
       * The okurigana KANJIDIC2 attaches to a kun reading.
       *
       * The card used to print the raw notation — 会 was shown as `あ.う` — for
       * 878 of the 1,748 shipped kanji. The dot means "the kanji is read あ and
       * the う is written after it in kana", which is worth saying, and
       * collapsing it to あう would be false: あう is the reading of 会う, not
       * of 会.
       */
      inWord: (word: string, reading: string, romaji: string) =>
        `Digunakan dalam ${word}, dibaca ${reading} (${romaji}).`,
      /** L1: the character, and four meanings to choose from. */
      meaningQuestion: 'Apa arti huruf ini?',
      meaningNote: 'Pilihan artinya dalam bahasa Inggris.',
      /** L2 and up: how the character is read. */
      readingQuestion: 'Bagaimana huruf ini dibaca?',
      readingPlaceholder: 'Tulis dengan huruf Latin atau kana',
      allReadings: (list: string) => `Semua bacaan: ${list}.`,
      mnemonicHeading: 'Cara mengingat',
      // SPEC §2.11: the learner's own mnemonic beats a given one, so the copy
      // invites editing rather than presenting ours as the answer.
      mnemonicHint: 'Ubahlah menjadi versi Anda sendiri — cara yang Anda susun sendiri jauh lebih mudah diingat.',
      mnemonicPlaceholder: 'Tuliskan cara Anda mengingat huruf ini',
      save: 'Simpan',
      saved: 'Tersimpan.',
      mine: 'Versi Anda',
      confirm: 'Saya mengerti',
      baseline: (literal: string, components: string[]) =>
        `${literal} tersusun dari ${components.join(' + ')}. Cobalah menyusun cerita Anda sendiri dari bagian-bagian tersebut.`,
      baselineAtomic: (literal: string) =>
        `${literal} adalah bentuk dasar. Cobalah menyusun cara Anda sendiri untuk mengingatnya.`,
    },

    production: {
      heading: 'Tuliskan sendiri',
      instruction: 'Tanpa pilihan dan tanpa contoh. Apa bahasa Inggrisnya?',
      instructionJa: 'Tanpa pilihan dan tanpa contoh. Apa bahasa Jepangnya?',
      placeholder: 'Ketik kata yang dimaksud',
      // This rung grades one word, and it used to show a whole sentence as its
      // prompt — so a learner could read the prompt correctly and still not know
      // what was being asked of them.
      oneWord: 'Satu kata saja, bukan seluruh kalimat.',
    },

    /**
     * SPEC §3.1 `NP_WORD_ORDER`. The one exercise here that asks for an
     * *order* rather than a word, and the one whose interaction is tapping
     * rather than typing or choosing.
     */
    build: {
      heading: 'Susun kalimatnya',
      instruction: 'Ketuk kata satu per satu hingga membentuk kalimat yang benar.',
      hint: 'Ketuk kembali kata yang sudah dipilih untuk menariknya kembali.',
      empty: 'Kalimat Anda masih kosong.',
      submit: 'Periksa urutan',
      correct: 'Urutannya tepat.',
      wrong: (answer: string) => `Urutan yang benar: “${answer}”.`,
      // §2.9: feedback that says *why*, and a claim that is true of every
      // sentence here rather than only of the adjective cases.
      why: 'Urutan kata dalam bahasa Inggris sering berbeda dari bahasa Indonesia — itulah yang dilatih di sini.',
      whyJa: 'Bahasa Jepang menempatkan kata kerja di akhir kalimat, dan partikel menentukan peran setiap kata. Itulah yang dilatih di sini.',
    },

    free: {
      heading: 'Gunakan dalam kalimat Anda sendiri',
      // SPEC §2.3 L6. The instruction matters: a sentence about your own life
      // is what makes this the generation effect rather than a copy exercise.
      instruction: (word: string) =>
        `Buatlah satu kalimat dengan kata “${word}” — tentang hari Anda, pekerjaan Anda, atau hal nyata lainnya.`,
      placeholder: 'Tulis kalimat Anda di sini',
      // Honest about what is and is not being checked.
      graded: 'Kami hanya memeriksa apakah kata tersebut benar-benar Anda gunakan. Isi kalimatnya sepenuhnya milik Anda.',
      // "We did not find it", not "you did not write it" — the matcher knows
      // regular inflections and the common irregulars, and nothing beyond that,
      // so it must not accuse a learner it may simply have failed to recognise.
      missing: (word: string) =>
        `Kami tidak menemukan kata “${word}” dalam kalimat Anda. Jika menurut Anda kata itu sudah ada, silakan kirim.`,
      submitAnyway: 'Tetap kirim',
      kept: 'Kalimat Anda tersimpan.',
      submit: 'Kirim',
    },

    speech: {
      speak: 'Ucapkan',
      listening: 'Mendengarkan…',
      heard: (text: string) => `Terdengar: “${text}”`,
      notHeard: 'Belum terdengar. Silakan coba lagi, atau ketik jawaban Anda.',
      // SPEC §5.1: never block progression on speech.
      unavailable: 'Peramban ini belum dapat mengenali suara. Silakan ketik jawaban Anda; hasilnya sama.',
      record: 'Rekam suara Anda',
      recording: 'Merekam… ketuk untuk berhenti',
      playMine: 'Putar rekaman Anda',
      playModel: 'Putar contoh',
      compare: 'Bandingkan sendiri: bagian mana yang berbeda?',
      noMic: 'Mikrofon tidak tersedia di sini.',
    },

    dictation: {
      heading: 'Tuliskan yang Anda dengar',
      instruction: 'Rekaman dapat diputar ulang sesering yang Anda perlukan.',
      placeholder: 'Ketik kalimatnya',
      replay: 'Putar ulang',
    },

    drill: {
      // SPEC §3: framed as a pattern worth knowing, never as a weakness to fix.
      heading: 'Pola yang sering keliru',
      typePlaceholder: 'Ketik jawaban Anda',
      // SPEC §8: "perbaiki kalimat ini". Framed as a fix, never as a mistake
      // the learner made — they have not written this sentence.
      correctionInstruction: 'Ada satu bagian yang keliru dalam kalimat ini. Tuliskan kembali kalimat yang benar.',
      correctionPlaceholder: 'Tulis kalimat yang benar',
      submit: 'Jawab',
      whyHeading: 'Mengapa demikian',
      l1Heading: 'Dalam bahasa Indonesia',
      // Named for the language being taught: a Japanese note headed "Di bahasa
      // Inggris" told the learner the wrong language was being described.
      targetHeading: { en: 'Dalam bahasa Inggris', ja: 'Dalam bahasa Jepang' },
      /** Shown after the answer, never before: the label names the error. */
      categoryLabel: (label: string) => `Pola: ${label}`,
      pairHeading: 'Bandingkan',
      pairWrong: 'Sering ditulis',
      pairRight: 'Seharusnya',
      tipHeading: 'Cara mengingat',
    },

    audio: {
      play: 'Dengarkan',
      unavailable: 'Suara belum tersedia di peramban ini',
    },
  },

  /**
   * SPEC §5.1 Phase 2: optional sync. Off unless the learner turns it on, and
   * the copy is careful to say what leaving the phone actually means.
   */
  sync: {
    // SPEC §5.4: sync is the one thing here that uploads, and the learner this
    // app is written for is on mobile data. Said before it is spent, the same
    // way the reader states its download cost.
    pending: (kb: number) => `Sekitar ${kb} KB menunggu untuk dikirim.`,
    pendingNone: 'Tidak ada data yang menunggu untuk dikirim.',
    open: 'Sinkronisasi antarperangkat',
    heading: 'Sinkronisasi',
    intro:
      'Aplikasi ini berfungsi sepenuhnya tanpa fitur ini. Jika Anda menggunakan lebih dari satu perangkat dan ingin riwayat latihan Anda tersambung, Anda dapat mengaktifkannya — namun data Anda akan dikirim keluar dari perangkat ini.',
    /**
     * What actually leaves the phone, named.
     *
     * The consent `intro` asks for is for the learner's practice history, and
     * until v1.21.0 that was all a delta carried. It now also carries the
     * mnemonics the learner typed themselves (SPEC §2.11 requires that they
     * survive sync), which is free text rather than a rating — so the sentence
     * that asks for consent has to say so. Listing it is also how the learner
     * can tell this is not everything: no profile, no settings, no token.
     */
    carries:
      'Data yang dikirim: jawaban latihan Anda, jadwal kartu Anda, dan catatan hafalan yang Anda tulis sendiri. Pengaturan dan kata sandi server tidak pernah dikirim.',
    // No LinguaKu server exists. Say so, rather than letting anyone assume one.
    noServer:
      'Kami tidak menyediakan server. Anda perlu memasang server sendiri (petunjuknya ada di workers/sync/README.md), lalu menempelkan alamatnya di bawah.',
    enable: 'Aktifkan sinkronisasi',
    codeHeading: 'Kode sinkronisasi perangkat ini',
    codeHint:
      'Untuk menggabungkan riwayat dua perangkat, masukkan kode ini di perangkat yang lain, lalu sinkronkan keduanya.',
    joinLabel: 'Gabungkan dengan riwayat perangkat lain',
    joinPlaceholder: 'Tempel kode dari perangkat lain',
    endpoint: 'Alamat server Anda',
    endpointPlaceholder: 'https://…workers.dev',
    token: 'Kata sandi server',
    tokenPlaceholder: 'Kata sandi yang Anda buat sendiri',
    save: 'Simpan',
    saved: 'Tersimpan.',
    syncNow: 'Sinkronkan sekarang',
    syncing: 'Menyinkronkan…',
    ok: (pushed: number, merged: number) =>
      `Selesai. ${pushed} sesi dikirim, ${merged} catatan baru diterima.`,
    /**
     * One sentence per failure, each naming what to do about it.
     *
     * This used to print the raw reason — *"Gagal: HTTP 401"* — to a learner
     * who has no way to act on that, and 401 is the commonest failure there is:
     * a token that does not match. Every line ends the same way because it is
     * always true: a failed sync changes nothing on this phone.
     */
    failedUnauthorized:
      'Kata sandi tidak cocok dengan server. Periksa kembali kata sandi di atas. Data Anda di perangkat ini tidak berubah.',
    failedNotFound:
      'Alamat tersebut tidak memiliki layanan sinkronisasi. Periksa kembali alamatnya. Data Anda di perangkat ini tidak berubah.',
    failedUnreachable:
      'Server tidak dapat dihubungi. Periksa koneksi Anda, lalu coba lagi. Data Anda di perangkat ini tidak berubah.',
    /** Online, but the browser refused the request — usually missing CORS. */
    failedBlocked:
      'Server tidak dapat dihubungi dari aplikasi ini, padahal perangkat sedang daring. Periksa alamat server. Jika alamatnya sudah benar, server mungkin belum mengizinkan akses dari aplikasi ini (CORS); petunjuknya ada di workers/sync/README.md. Data Anda di perangkat ini tidak berubah.',
    failedServer:
      'Server sedang mengalami gangguan. Silakan coba lagi nanti. Data Anda di perangkat ini tidak berubah.',
    failedUnknown: 'Sinkronisasi gagal karena penyebab yang belum diketahui. Data Anda di perangkat ini tidak berubah.',
    /** The raw text, for a learner who needs to report what happened. */
    failedDetail: (detail: string) => `Detail: ${detail}`,
    disabled: 'Sinkronisasi belum diaktifkan.',
    never: 'Belum pernah',
    lastSynced: (when: string) => `Terakhir: ${when}`,
    // The privacy point, stated plainly rather than buried.
    privacy:
      'Data yang dikirim: riwayat latihan dan jadwal kartu Anda. Kata sandi server hanya disimpan di perangkat ini dan tidak disertakan dalam file cadangan.',
  },

  /** SPEC §8: the graded reader — "the retention engine". */
  reader: {
    open: 'Baca',
    heading: 'Bacaan',
    // Honest about what this is: Tatoeba is a corpus of sentences, not
    // documents, so we grade sentences rather than pretending to grade a text.
    intro: 'Kalimat-kalimat yang sesuai dengan kemampuan Anda saat ini. Ketuk kata mana pun.',
    empty:
      'Belum ada bacaan yang sesuai. Lakukan beberapa sesi latihan terlebih dahulu agar kami mengetahui kata-kata yang sudah Anda kenal.',
    loading: 'Menyiapkan bacaan…',
    newWord: 'baru',
    tapHint: 'Ketuk kata untuk melihat artinya.',
    // SPEC §10: a block of reading is one tab stop and the arrows move inside
    // it, so this is the only place a keyboard learner is told how.
    wordNav:
      'Gunakan tombol panah kiri dan kanan untuk berpindah antarkata, lalu tekan Enter untuk membuka artinya.',
    sentenceLabel: 'Kalimat bacaan',

    /**
     * SPEC §5.4: the reference learner is on mobile data, and opening the
     * reader is the one tap in this app that spends a noticeable amount of it.
     * Said in kilobytes, before the tap, with a way to say no.
     */
    data: {
      heading: 'Bacaan perlu diunduh terlebih dahulu',
      body: (kb: number) =>
        `Sekitar ${kb} KB, cukup sekali — setelah itu bacaan dapat dibuka secara offline tanpa menggunakan kuota lagi.`,
      download: 'Unduh sekarang',
      note: 'Anda menggunakan mode hemat kuota. Latihan tetap berjalan seperti biasa.',
    },

    /** SPEC §8 + §2.4: real running text, where the coverage band is reachable. */
    passage: {
      from: (title: string) => `Dari artikel “${title}” (Wikipedia Bahasa Inggris Sederhana)`,
      check: 'Periksa pemahaman',
      checkInstruction: 'Satu kata dihilangkan dari teks tadi. Kata apakah itu?',
      checkPlaceholder: 'Ketik kata yang hilang',
      // Japanese has no graded passage corpus that is free and cleared, and
      // saying so is better than letting the learner infer parity.
      onlyEnglish:
        'Bacaan panjang saat ini baru tersedia untuk bahasa Inggris. Untuk bahasa Jepang, kami menyajikan kalimat satu per satu.',
      heading: 'Bacaan panjang',
      textLabel: 'Teks bacaan',
    },

    word: {
      reading: 'Dibaca',
      band: (band: number) => `Kata tingkat ${band}`,
      known: 'Sudah Anda kenal',
      unknown: 'Belum Anda pelajari',
      inSentence: 'Dalam kalimat ini',
      // SPEC §8: one tap, and it is in the deck.
      mine: 'Tambahkan ke latihan',
      mined: 'Sudah masuk daftar',
      unmine: 'Batalkan',
      minedNote: 'Kata ini akan muncul pada sesi latihan berikutnya.',
      // Glosses cover 30% of English words (measured), and the gaps are mostly
      // function words. Where there is nothing, say so — the sentence
      // translation is a real answer, not a consolation.
      noGloss:
        'Kata ini belum ada dalam kamus kami. Terjemahan kalimat di bawah dapat menjadi petunjuk.',
      components: 'Tersusun dari',
      close: 'Tutup',
    },
  },

  /**
   * SPEC §2.2's passive glossary — the one browsing the spec allows, because it
   * creates and advances nothing. §2.14 is why it is worth having: capability
   * you can scroll through is evidence, where a number is a claim.
   */
  glossary: {
    open: 'Lihat daftar kata Anda',
    heading: 'Kata yang sudah Anda temui',
    intro:
      'Semua kata yang pernah Anda jawab, dengan yang paling kuat di bagian atas. Melihat daftar ini sama sekali tidak mengubah jadwal latihan Anda.',
    search: 'Cari kata',
    count: (total: number) => `${total.toLocaleString('id-ID')} kata`,
    more: (rest: number) =>
      `Dan ${rest.toLocaleString('id-ID')} kata lainnya. Gunakan kotak pencarian untuk menemukannya.`,
    empty:
      'Daftar ini masih kosong. Setiap kata yang Anda jawab — benar maupun salah — akan langsung masuk ke sini.',
    noMatch: 'Tidak ada kata yang cocok.',
    noGloss: 'Arti kata ini belum ada dalam kamus kami; contoh kalimatnya dapat menjadi petunjuk.',
    band: (band: number) => `Kata tingkat ${band}`,
    // Capability, never a score (§2.14): each of these is a state, not a grade.
    strength: {
      mastered: 'Sudah dikuasai',
      known: 'Dikenali',
      weak: 'Mulai memudar',
      leech: 'Diajarkan ulang',
    },
    /**
     * SPEC §2.14: autonomy includes changing your mind.
     *
     * A skip buries a word for 3 days the first time and 60 by the fourth, and
     * until v1.24.0 nothing could bring it back — `undeferItem` was written for
     * this and never called. The copy says what was actually recorded (a
     * request, not a judgement) and when it lapses on its own, so taking it
     * back is a choice rather than a rescue.
     */
    deferred: {
      heading: 'Kata yang Anda tunda',
      intro:
        'Anda menandai kata-kata ini sebagai belum diperlukan, sehingga untuk sementara tidak kami munculkan. Jika Anda berubah pikiran, ketuk kata tersebut — jadwal Anda tidak akan terganggu.',
      until: (days: number) =>
        days <= 0 ? 'Muncul lagi hari ini.' : `Muncul lagi dalam ${days} hari.`,
      restore: 'Ajarkan kembali',
      empty: 'Tidak ada kata yang sedang Anda tunda.',
    },
  },

  /** SPEC §10: one place for everything that is not practice. */
  settings: {
    /** SPEC §5.4's quota control. */
    data: {
      heading: 'Kuota',
      intro:
        'Materi latihan harian sudah tersedia di perangkat Anda. Yang perlu diunduh hanyalah bacaan panjang, cukup sekali untuk setiap tingkat.',
      auto: 'Ikuti pengaturan perangkat',
      autoHint: 'Jika penghemat data di perangkat Anda aktif, kami akan mengikutinya.',
      save: 'Selalu tanyakan terlebih dahulu',
      saveHint: 'Tidak ada yang diunduh sebelum Anda menyetujuinya.',
      full: 'Unduh langsung',
      fullHint: 'Unduh tanpa bertanya terlebih dahulu.',
    },
    /** SPEC §7.2's pace control, and §2.14's autonomy over it. */
    pace: {
      heading: 'Kata baru per hari',
      intro:
        'Kata baru hari ini akan menjadi ulangan pada minggu berikutnya. Kecepatan yang terukur justru lebih efektif — dan Anda dapat mengaturnya sendiri.',
      unit: (count: number) => `${count} kata baru per hari`,
      none: 'Tidak ada kata baru untuk sementara. Ulangan yang sudah ada tetap berjalan — ini cara paling efektif untuk menyelesaikan ulangan yang menumpuk.',
      fewer: 'Kurangi',
      more: 'Tambah',
      reset: 'Kembalikan ke bawaan',
      defaultNote: (count: number) => `Nilai bawaan untuk sesi sepanjang ini: ${count}.`,
    },
    open: 'Pengaturan',
    heading: 'Pengaturan',
    done: 'Selesai',
    loading: 'Memuat…',
    // SPEC §2.14: autonomy. The wording has to make clear this is a preference,
    // not a syllabus you are locked into.
    topicsHeading: 'Topik yang Anda butuhkan',
    topicsIntro:
      'Pilih topik yang paling Anda perlukan saat ini. Kata-kata dari topik tersebut akan muncul lebih dahulu, sementara kata dasar yang menyusun kalimat tetap diajarkan.',
    topicsNone: 'Belum ada yang dipilih. Kami mengikuti urutan kata yang paling sering digunakan.',
    topicsNote: 'Dapat diubah atau dikosongkan kapan saja.',
    noTopics: 'Daftar topik untuk bahasa ini belum tersedia.',
    moreHeading: 'Lainnya',
  },

  /**
   * Risk R1's device matrix, run by whoever is holding the phone.
   *
   * The tone rule is the same as everywhere else — this says what the device
   * can do, in plain words, and never implies the learner did something wrong
   * by owning a phone with no speech engine.
   */
  diagnostics: {
    open: 'Uji suara di perangkat ini',
    heading: 'Uji perangkat',
    intro:
      'Jika latihan mendengarkan tidak muncul, Anda dapat memeriksanya di sini. Tombol di bawah membunyikan suara sekali dan mencatat hasilnya. Tidak ada data yang dikirim ke mana pun.',
    run: 'Uji audio sekarang',
    running: 'Sedang memeriksa…',
    again: 'Uji lagi',
    langHeading: (lang: string) => `Suara bahasa ${lang}`,
    ready: (ms: number) => `Berbunyi, selesai dalam ${ms} milidetik.`,
    // Being over the deadline is a real outcome and it is explained, not hidden.
    slow: (ms: number) =>
      `Berbunyi, tetapi baru selesai setelah ${ms} milidetik. Waktu ini terlalu lama untuk soal dikte, sehingga latihan mendengarkan tetap kami sembunyikan.`,
    noVoice: 'Belum ada suara untuk bahasa ini di perangkat Anda.',
    dead: 'Suaranya terdaftar, tetapi tidak pernah benar-benar berbunyi.',
    unsupported: 'Peramban ini sama sekali tidak memiliki fitur suara.',
    // The one case where pressing the button changes what the app will offer.
    adopted: 'Ternyata berfungsi. Latihan mendengarkan kini kami aktifkan.',
    firstCall: (ms: number) => `Panggilan pertama ke mesin suara memerlukan waktu ${ms} milidetik.`,
    firstCallSlow:
      'Waktu tersebut sangat lama, dan bukan karena kesalahan Anda — pemeriksaan suara memang kami tunda agar aplikasi tidak ikut tertahan.',
    recognitionReady: 'Perangkat ini dapat mengenali suara Anda untuk latihan berbicara.',
    recognitionAbsent: 'Perangkat ini belum dapat mengenali suara Anda. Latihan tetap berjalan; jawaban cukup diketik.',
    remindersScheduled: 'Pengingat dapat muncul walaupun aplikasi tertutup.',
    remindersInApp: 'Pengingat hanya muncul saat Anda membuka aplikasi.',
    remindersNone: 'Peramban ini tidak memiliki fitur pengingat.',
    copyHeading: 'Kirim ke pengembang',
    copyHint:
      'Salin teks ini dan kirimkan kepada kami. Isinya hanya mengenai kemampuan perangkat Anda — tidak ada satu pun jawaban latihan Anda di dalamnya.',
    copy: 'Salin',
    copied: 'Tersalin.',
    back: 'Kembali',
  },

  /**
   * SPEC §5.2: the attribution screen. EDRDG's licence requires acknowledgement
   * in the UI, so this copy is part of a licence condition.
   */
  attribution: {
    open: 'Sumber dan lisensi',
    heading: 'Sumber dan lisensi',
    intro:
      'Materi dalam aplikasi ini dibangun dari data terbuka. Berikut daftar lengkapnya, beserta lisensi dan tanggal kami memeriksanya.',
    licenseLabel: 'Lisensi',
    sourceLabel: 'Sumber',
    verifiedLabel: 'Diperiksa',
    shareAlike: 'berbagi-serupa',
    shareAlikeNote:
      'Beberapa sumber menggunakan lisensi berbagi-serupa, sehingga materi turunannya kami sebarkan dengan lisensi yang sama.',
    back: 'Kembali',
  },

  /** SPEC §9: honest, capability-framed, all local. */
  progress: {
    /**
     * SPEC §1's premise, made visible: *"the item they see should be chosen
     * because a memory model predicts they are about to forget it."* The model
     * has decided that on every session since M2 and never once shown its
     * working. No score and no scolding — an order, and what it means.
     */
    slipping: {
      heading: 'Paling dekat untuk terlupa',
      intro:
        'Menurut model ingatan, kata-kata ini paling dekat untuk terlupa — dan kata-kata inilah yang muncul lebih dahulu pada sesi berikutnya.',
      empty: 'Belum ada kata yang mulai memudar dari ingatan Anda.',
    },
    /**
     * SPEC §2.10's frequency curriculum, made visible.
     *
     * The app has always had an order; a learner could never see it, which is
     * what made an honest curriculum feel like an endless queue. Every figure
     * here is measured from the shipped corpus — "481 words is 70% of
     * everyday English" is a fact about the corpus, never a claim about the
     * learner's level, which invariant 9 forbids.
     */
    path: {
      heading: 'Jalur belajar',
      intro: 'Kata diajarkan mulai dari yang paling sering digunakan. Berikut posisi Anda.',
      // The same guard as the home screen's: under one percent the figure is
      // dropped rather than rounded to "sekitar 0%" (§2.14).
      reach: (percent: number, words: number) =>
        percent < 1
          ? `${words.toLocaleString('id-ID')} kata telah Anda kuasai. Persentasenya akan mulai terlihat setelah beberapa ratus kata.`
          : `Kata yang telah Anda kuasai mencakup sekitar ${percent}% dari kata yang muncul sehari-hari.`,
      reachNone:
        'Belum ada kata yang dikuasai. Satu sesi latihan sudah cukup untuk mulai menaikkan angka ini.',
      stage: (band: number) => `Tahap ${band}`,
      count: (secured: number, total: number) => `${secured} dari ${total} kata`,
      worth: (percent: number) => `Jika tahap ini selesai: ${percent}% dari kata sehari-hari.`,
      here: 'Posisi Anda saat ini',
      skipped: 'Dilewati sesuai tingkat Anda',
      done: 'Selesai',
      /**
       * What the remaining share actually is, which is not the same in both
       * languages.
       *
       * English stops at 87.3% because proper nouns are filtered from the
       * inventory (D14) and band 6 is not shipped — so "rare words" is true.
       * Japanese stops at 53.6% because particles and auxiliaries are not
       * vocabulary and are not taught as words at all. Telling that learner the
       * rest is rare words would be a new false statement in place of the one
       * v1.26.0 removed.
       */
      ceiling: (percent: number, lang: TargetLang) =>
        lang === 'ja'
          ? `Jika semua tahap selesai, Anda menguasai ${percent}% dari kata yang muncul sehari-hari. Sisanya adalah partikel dan kata bantu — bagian dari tata bahasa yang kami ajarkan melalui kalimat, bukan melalui hafalan kata.`
          : `Jika semua tahap selesai, Anda menguasai ${percent}% dari kata yang dapat kami ajarkan. Sisanya adalah kata-kata yang jarang muncul.`,
    },
    open: 'Lihat kemajuan Anda',
    heading: 'Kemajuan Anda',
    back: 'Kembali',
    // SPEC §9: every number here comes from this phone. Say so once, plainly.
    localOnly: 'Semua angka di sini dihitung dari jawaban Anda sendiri, hanya di perangkat ini.',
    notYet: 'Belum cukup data',

    vocab: {
      heading: 'Kosakata',
      // SPEC §9: "Kamu mengenali ~2.400 kata — cukup untuk memahami sekitar 86%…"
      headline: (words: number) => `Anda mengenali sekitar ${words.toLocaleString('id-ID')} kata.`,
      range: (low: number, high: number) =>
        `Perkiraan kami antara ${low.toLocaleString('id-ID')} dan ${high.toLocaleString('id-ID')} kata.`,
      floor: (count: number) =>
        `${count.toLocaleString('id-ID')} kata sudah Anda buktikan sendiri melalui latihan.`,
      // The capability sentence — and it says what the percentage is *of*.
      capability: (percent: number) =>
        `Jumlah itu mencakup sekitar ${percent}% dari kata yang muncul dalam kalimat yang kami ajarkan.`,
      /** See `path.ceiling`: the remainder is a different thing per language. */
      ceiling: (percent: number, lang: TargetLang) =>
        lang === 'ja'
          ? `Jika semua kata yang kami miliki Anda kuasai, angkanya mencapai ${percent}%. Sisanya adalah partikel dan kata bantu, yang Anda pelajari melalui kalimat dan latihan pola.`
          : `Jika semua kata yang kami miliki Anda kuasai, angkanya mencapai ${percent}%. Sisanya adalah nama orang dan kata yang sangat jarang.`,
      empty:
        'Lakukan beberapa sesi latihan terlebih dahulu. Setelah itu kami dapat memperkirakan jumlah kata yang Anda kenali.',
      wide: 'Rentangnya masih lebar karena banyak tingkat kata yang belum pernah Anda temui.',
    },

    curve: {
      heading: 'Sebaran per tingkat kata',
      hint: 'Tingkat 1 berisi kata yang paling sering digunakan.',
      band: (band: number) => `Tingkat ${band}`,
      known: (known: number, seen: number) => `${known} dari ${seen} yang pernah Anda temui`,
      untouched: 'Belum Anda temui',
    },

    retention: {
      heading: 'Seberapa sering Anda masih ingat',
      target: (percent: number) => `Target kami ${percent}%`,
      actual: (percent: number) => `Anda ${percent}%`,
      reviews: (count: number) => `dari ${count.toLocaleString('id-ID')} ulangan terjadwal`,
      onTarget: 'Sesuai. Jarak antarulangan sudah cocok untuk Anda.',
      // SPEC §9: "if actual retention is far off 90%, say so and offer to retune."
      below:
        'Cukup sering terlupa. Jarak antarulangan kami rapatkan sedikit agar latihan tidak terlalu berat.',
      above:
        'Anda hampir selalu ingat — artinya ulangan dapat dijarangkan, sehingga waktu Anda lebih hemat.',
      unknown: 'Belum cukup ulangan terjadwal untuk dinilai.',
      retune: 'Sesuaikan jarak ulangan',
      retuned: 'Sudah kami sesuaikan.',
    },

    forecast: {
      heading: 'Perkiraan beban 14 hari',
      hint: 'Jumlah kartu yang jatuh tempo setiap hari, jika Anda berlatih setiap hari.',
      today: 'Hari ini',
      cards: (count: number) => `${count} kartu`,
      quiet: 'Belum ada kartu yang jatuh tempo.',
    },

    skills: {
      heading: 'Peta kemampuan',
      hint: 'Kemampuan yang belum pernah diukur kami biarkan kosong, bukan diisi nol.',
      names: {
        vocab: 'Kosakata',
        grammar: 'Tata bahasa',
        listening: 'Mendengarkan',
        reading: 'Membaca',
        production: 'Berbicara & menulis',
      },
      unmeasured: 'Belum diukur',
      answers: (count: number) => `${count} jawaban`,
    },

    calibration: {
      heading: 'Ketepatan rasa yakin Anda',
      hint: 'Saat Anda memilih “Yakin”, seberapa sering jawaban Anda ternyata benar?',
      sure: 'Saat memilih Yakin',
      unsure: 'Saat memilih Ragu',
      good:
        'Perkiraan Anda tentang apa yang sudah Anda kuasai cukup tepat. Itu keterampilan tersendiri yang sangat berguna.',
      weak:
        'Rasa yakin dan hasilnya masih belum banyak berbeda. Hal ini wajar di awal, dan biasanya semakin tepat seiring waktu.',
      unknown: 'Belum cukup jawaban untuk dibandingkan.',
    },

    consistency: {
      heading: 'Kebiasaan',
      // SPEC §2.14: a band that heals, never a streak that breaks.
      days: (days: number, window: number) => `${days} dari ${window} hari terakhir`,
      note: 'Bukan rentetan yang dapat terputus. Jika ada hari yang terlewat, Anda cukup melanjutkan kembali.',
    },

    data: {
      heading: 'Data Anda',
      note: 'Semua data ini milik Anda. Anda dapat menyimpan salinannya sendiri kapan saja, tanpa akun.',
      export: 'Simpan salinan (JSON)',
      exported: 'Tersimpan.',
      importLabel: 'Pulihkan dari salinan',
      imported: (logs: number) =>
        logs === 0
          ? 'Salinan itu sudah ada di perangkat ini — tidak ada yang berubah.'
          : `Dipulihkan: ${logs.toLocaleString('id-ID')} riwayat latihan ditambahkan.`,
      /**
       * One sentence per reason, because the app knows which it was.
       *
       * The single message this replaces said *"that file is not a LinguaKu
       * backup"* for every failure — false for a newer bundle, and it sent the
       * learner looking for a different file instead of updating the app. The
       * restore runs in one transaction, so "your data is unchanged" is a
       * promise the database keeps rather than a reassurance.
       */
      importFailed: 'File tersebut bukan salinan LinguaKu. Data Anda saat ini tidak berubah.',
      importNotJson:
        'File tersebut tidak dapat dibaca. Yang diperlukan adalah file .json hasil ekspor dari LinguaKu.',
      importTooNew: (version: number) =>
        `Salinan ini dibuat oleh LinguaKu versi ${version}, yang lebih baru dari aplikasi ini. Perbarui aplikasi terlebih dahulu — data Anda aman dan tidak ada yang hilang.`,
      importBroke:
        'Pemulihan terhenti di tengah proses. Data Anda saat ini sama sekali tidak berubah.',
    },

    heatmap: {
      /**
       * Named for the language actually being learned.
       *
       * It was hardcoded to *"Pola bahasa Inggrismu"* — your English patterns —
       * and sat above a list of Japanese categories (は dan が, hiragana dan
       * katakana) whenever the learner was on Japanese. The data under it was
       * right the whole time; only the heading was wrong, which is the kind of
       * thing only looking at the screen finds.
       */
      heading: (lang: TargetLang) => `Pola bahasa ${copy.langNames[lang]} Anda`,
      // SPEC §2.15: no claim without evidence behind it.
      intro:
        'Disusun dari jawaban Anda sendiri, bukan dari perkiraan. Pola yang datanya belum cukup kami tampilkan apa adanya.',
      weakestLead: 'Yang paling perlu Anda latih saat ini',
      // "Kelemahan terbesarmu: he/she dan past tense" (SPEC §3.3), but phrased
      // as something to work on rather than something wrong with the learner.
      weakestNames: (names: readonly string[]) => names.join(' dan '),
      accuracy: (correct: number, attempts: number) =>
        `${correct} benar dari ${attempts} percobaan`,
      notMeasured: 'Belum cukup data',
      notMeasuredHint: (needed: number) =>
        `Diperlukan ${needed} jawaban lagi sebelum kami dapat menarik kesimpulan.`,
      solid: 'Sudah dikuasai',
      empty:
        'Belum ada yang dapat ditampilkan. Lakukan beberapa sesi latihan terlebih dahulu; pola-pola Anda akan muncul di sini dengan sendirinya.',
      attemptsSoFar: (count: number) =>
        count === 1 ? '1 latihan pola tercatat' : `${count} latihan pola tercatat`,
      kinds: {
        morphosyntax: 'Tata bahasa',
        phonology: 'Bunyi dan pendengaran',
        lexis: 'Kosakata',
      },
    },
  },
  recap: {
    heading: 'Satu minggu terakhir',
    // SPEC §9 + §2.14: capability, never a score. Each line is a thing the
    // learner can now do, and there is no total to compare against anyone.
    empty: 'Belum ada latihan minggu ini. Ringkasannya akan muncul di sini.',
    met: (count: number) => `${count} kata baru Anda temui.`,
    strengthened: (count: number) => `${count} kata Anda perkuat kembali.`,
    mastered: (count: number) => `${count} kata sudah benar-benar Anda kuasai.`,
    drills: (count: number) => `${count} pola tata bahasa Anda latih.`,
    days: (days: number) => `Anda berlatih pada ${days} hari.`,
    // A direction, never a verdict — and deliberately not phrased as a loss.
    comparedSame: 'Sama seperti minggu sebelumnya.',
    comparedMore: (previous: number) => `Minggu sebelumnya: ${previous} hari.`,
    comparedFewer: (previous: number) => `Minggu sebelumnya: ${previous} hari.`,
  },
  placement: {
    offer: 'Periksa kemampuan (1 menit)',
    heading: 'Kata mana yang Anda ketahui?',
    // SPEC §4.2: it must feel like learning, not like an exam.
    intro:
      'Ini bukan ujian. Kami hanya perlu mengetahui titik awal yang tepat, agar Anda tidak diajari kata yang sudah Anda kuasai.',
    instruction: 'Apakah Anda tahu artinya? Jawablah dengan jujur — ini bukan ujian.',
    start: 'Mulai pemeriksaan',
    skip: 'Lewati',
    // §4.2: skipping must cost nothing.
    skipNote: 'Jika dilewati, kami akan menyesuaikan diri dari jawaban Anda selama latihan.',
    know: 'Tahu',
    dontKnow: 'Belum',
    progress: (done: number) => `${done} kata`,

    result: {
      heading: 'Selesai.',
      // SPEC §2.15 / §4.1: a band, never a bare level claim.
      band: (from: number, to: number) =>
        from === to
          ? `Titik awal yang paling sesuai untuk Anda adalah kata tingkat ${from}.`
          : `Titik awal yang paling sesuai untuk Anda berada di antara tingkat ${from} dan ${to}.`,
      // SPEC §2.15: when the estimate is too vague to name a level, saying so
      // is more useful — and more honest — than printing a range that spans
      // the whole scale.
      unclear:
        'Jawaban Anda cukup beragam, sehingga kami belum dapat memperkirakannya dengan yakin. Kami akan mulai dari tengah dan menyesuaikannya selama Anda berlatih.',
      estimate: 'Ini adalah perkiraan, dan akan terus kami perbaiki setiap kali Anda berlatih.',
      overclaimed:
        'Beberapa kata tadi sebenarnya bukan kata asli, sehingga perkiraannya kami buat lebih hati-hati.',
      /**
       * SPEC §4.2's over-claiming control did not run.
       *
       * Only English ships pseudowords, so a Japanese check has nothing to
       * catch over-claiming with — and `pseudoword.ts` is blunt about what that
       * means: *"a Yes/No test without pseudowords measures confidence, not
       * vocabulary."* The reading is still the honest one for the answers
       * given; it simply has not been checked, and saying so is cheaper than
       * inventing a discount for it (R10).
       */
      unchecked:
        'Untuk bahasa ini kami belum memiliki kata pengecoh, sehingga angka ini sepenuhnya berasal dari jawaban Anda sendiri. Anggaplah sebagai titik awal, bukan hasil tes.',
      begin: 'Mulai latihan',
    },
  },

  /**
   * SPEC §2.13. The learner writes the plan in their own words — that is the
   * mechanism, not the reminder. Copy addresses "Anda" and never implies that
   * a missed day is a failure (§2.14).
   */
  habit: {
    open: 'Atur pengingat',
    heading: 'Kapan waktu latihan Anda?',
    intro:
      'Kebiasaan paling mudah terbentuk jika dikaitkan dengan kegiatan yang sudah Anda lakukan setiap hari. Tuliskan dengan kata-kata Anda sendiri.',
    // The sentence frame is the implementation intention itself.
    sentenceBefore: 'Setiap hari setelah',
    sentenceMiddle: ', saya berlatih di',
    sentenceAfter: '.',
    cuePlaceholder: 'makan malam',
    placePlaceholder: 'kamar',
    cueLabel: 'Setelah kegiatan apa?',
    placeLabel: 'Di mana?',
    timeLabel: 'Ingatkan pukul berapa?',
    save: 'Simpan',
    skip: 'Lain kali',
    skipNote: 'Dapat diatur kapan saja. Tanpa pengingat pun, aplikasi tetap berfungsi sepenuhnya.',
    off: 'Nonaktifkan pengingat',
    saved: 'Tersimpan.',
    summary: (cue: string, place: string, time: string) =>
      `Setiap hari setelah ${cue}, Anda berlatih di ${place}. Pengingat pukul ${time}.`,

    // Each of these is a real, different capability level. §2.6's rule applied
    // to notifications: say what this device can do rather than imply more.
    supportScheduled: 'Perangkat ini dapat menampilkan pengingat walaupun aplikasi tertutup.',
    supportInApp:
      'Perangkat ini belum dapat menampilkan pengingat saat aplikasi tertutup, sehingga pengingat kami tampilkan ketika Anda membuka aplikasi.',
    supportNone: 'Peramban ini tidak memiliki fitur pengingat, sehingga catatan ini hanya untuk Anda sendiri.',
    /**
     * Invariant 24: a reminder is local, or the screen says it is not one.
     *
     * `reminderSupport()` only says the API *exists*. A browser can advertise
     * it and then refuse the actual call — the speech-probe failure again — and
     * the learner would otherwise walk away believing a reminder is set.
     */
    scheduleFailed:
      'Pengingat tidak dapat dipasang di peramban ini, walaupun sudah diizinkan. Kami akan mengingatkan Anda melalui aplikasi saat Anda membukanya.',
    permissionDenied:
      'Izin notifikasi ditolak, sehingga pengingat hanya kami tampilkan di dalam aplikasi.',

    // The in-app cue. An invitation, never an accusation (§2.14).
    cueNudge: (cue: string) => `Waktu setelah ${cue} sudah tiba. Apakah Anda ingin berlatih sekarang?`,
    cueDismiss: 'Nanti',
  },
} as const;
