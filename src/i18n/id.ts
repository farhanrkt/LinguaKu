/**
 * All learner-facing copy lives here (SPEC §10: Indonesian-first, warm, plain,
 * no exam-anxiety framing). A second locale is a second module of the same
 * shape — components never hold literal strings.
 *
 * Tone rules, derived from SPEC §2.14 and docs/ETHICS.md:
 *  - describe capability, never points;
 *  - never imply loss, shame, or a broken streak;
 *  - address the learner as "kamu", never "Anda" (this is a friend, not a bank).
 */
export const copy = {
  app: {
    name: 'LinguaKu',
    tagline: 'Belajar bahasa, tanpa akun, tanpa kuota.',
  },
  firstRun: {
    heading: 'Mau mulai dari bahasa apa?',
    // D53: one language at a time, said out loud. Switching later costs nothing
    // and loses nothing, so the copy promises exactly that and no more.
    subheading:
      'Satu dulu. Nanti bisa ganti kapan saja — yang satunya tetap tersimpan, tidak hilang. Tidak perlu daftar.',
    targets: {
      en: { label: 'Bahasa Inggris', hint: 'Untuk kamu yang sudah belajar di sekolah' },
      ja: { label: 'Bahasa Jepang', hint: 'Mulai dari nol, dari hiragana' },
    },
    minutesHeading: 'Berapa lama sehari?',
    minutesHint: 'Sedikit tapi tiap hari jauh lebih ampuh daripada sesekali lama.',
    minutes: {
      4: { label: '4 menit', hint: 'Cukup untuk satu sesi di angkot' },
      8: { label: '8 menit', hint: 'Pas untuk kebanyakan orang' },
      15: { label: '15 menit', hint: 'Kalau kamu lagi niat' },
    },
    start: 'Mulai',
    needTarget: 'Pilih dulu bahasa yang mau kamu mulai.',
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
      clear: 'Ulangan hari ini sudah beres. Kata baru lagi besok.',
      // Not the same sentence: a learner who switched new words off is not
      // waiting for tomorrow, and telling them otherwise would be a small lie
      // about their own setting.
      clearPaused: 'Tidak ada ulangan yang jatuh tempo, dan kata baru sedang kamu matikan.',
      capReached: 'Kata baru hari ini sudah cukup. Ulangan tetap jalan.',
    },
    greeting: 'Halo!',
    learningLabel: 'Kamu sedang belajar',
    minutesLabel: 'Target harian',
    changeMinutes: 'Ubah target harian',
    changeTargets: 'Ubah bahasa',
    statusHeading: 'Status aplikasi',
    offlineReady: 'Siap dipakai offline',
    offlinePreparing: 'Menyiapkan mode offline…',
    offlineUnavailable: 'Mode offline belum aktif di peramban ini',
    storagePersisted: 'Data kamu aman disimpan di HP ini',
    storageBestEffort: 'Data disimpan di HP ini (bisa dihapus peramban kalau memori penuh)',
    // SPEC §2.6: a device that cannot speak is told so plainly, and the reason
    // the listening exercises are missing is not left as a mystery.
    audioProbing: 'Mengecek suara di HP ini…',
    audioReady: 'Suara aktif — latihan mendengar tersedia',
    audioDead: 'HP ini belum bisa mengeluarkan suara, jadi latihan mendengar kami sembunyikan dulu',
  },
  /** SPEC §10: Japanese input without an IME headache. */
  kana: {
    showKeyboard: 'Papan kana',
    hideKeyboard: 'Tutup papan kana',
    hiragana: 'あ hiragana',
    katakana: 'ア katakana',
    hint: 'Ketik pakai huruf latin — otomatis jadi kana. Atau ketuk hurufnya di bawah.',
  },
  langNames: {
    en: 'Inggris',
    ja: 'Jepang',
  },
  session: {
    start: (minutes: number) => `Latihan ${minutes} menit`,
    resume: 'Lanjutkan latihan',
    // SPEC §2.14: declining is a first-class action, not a hidden escape. The
    // wording is the spec's own — "belum perlu", not "lewati" — because it says
    // the word is fine and the timing is not.
    skipItem: 'Belum perlu kata ini',
    preparing: 'Menyiapkan materi…',
    downloading: 'Mengunduh materi sekali saja…',
    empty: 'Semua materi sudah kamu kerjakan hari ini. Sampai besok!',
    progress: (done: number, total: number) => `${done} dari ${total}`,
    quit: 'Selesai dulu',

    exposure: {
      heading: 'Kenalan dulu',
      instruction: 'Baca dan dengar. Belum perlu dihafal.',
      confirm: 'Oke, paham',
    },

    /**
     * The thumb shortcut. Every one of these is also a button, so this copy
     * never carries an instruction a learner *must* follow — it tells them a
     * faster way exists and names what each direction does.
     */
    swipe: {
      confirm: 'Paham',
      defer: 'Belum perlu',
      next: 'Lanjut',
      hint: 'Geser kartunya, atau pakai tombol di bawah.',
    },

    /**
     * The card, after it has been answered.
     *
     * It stays on screen because the feedback refers to it — the correct answer
     * only means something in the sentence it belongs to — but it stops being a
     * question. No controls, and it says which it is.
     */
    answered: {
      label: 'Soal tadi',
      yours: (raw: string) => `Jawabanmu: “${raw}”`,
    },

    /**
     * The meaning of the word itself, as opposed to the sentence it sits in.
     *
     * Glosses cover 30% of English words and 4% of Japanese (measured, D59), so
     * the absent case is the common one and it gets said out loud rather than
     * rendering nothing — the reader has done this since v1.7.0 and the session
     * was the surface that stayed silent.
     */
    meaning: {
      label: 'Arti katanya',
      none: 'Kata ini belum ada di kamus kami. Terjemahan kalimatnya yang jadi petunjuk.',
      sentenceLabel: 'Kalimat lengkapnya',
    },
    recognition: {
      heading: 'Yang mana artinya?',
    },
    cloze: {
      supported: 'Lengkapi kalimatnya',
      unaided: 'Lengkapi tanpa bantuan',
      placeholder: 'Ketik kata yang hilang',
      // SCIENCE: judgment-of-learning — see SPEC §2.12. Both buttons submit,
      // so the confidence signal costs no extra tap.
      sure: 'Yakin',
      unsure: 'Ragu',
    },

    feedback: {
      correct: 'Tepat.',
      nearMiss: (answer: string) => `Hampir — maksudmu “${answer}”.`,
      wrong: (answer: string) => `Jawabannya “${answer}”.`,
      promoted: 'Kata ini naik tingkat.',
      demoted: 'Kita pelan-pelan lagi untuk kata ini.',
      leech: 'Kata ini kita ajarkan ulang dengan contoh lain.',
      next: 'Lanjut',
    },

    summary: {
      heading: 'Selesai!',
      // SPEC §2.14: capability, never points.
      strengthened: (count: number) => `${count} kata jadi lebih kuat.`,
      learned: (count: number) => `${count} kata baru kamu kenali.`,
      promoted: (count: number) => `${count} kata naik ke tugas yang lebih sulit.`,
      drilled: (count: number) =>
        count === 1 ? 'Satu pola tata bahasa kamu latih.' : `${count} pola tata bahasa kamu latih.`,
      nothing: 'Belum ada yang dikerjakan.',
      done: 'Kembali',
    },

    kanji: {
      heading: 'Kenali hurufnya',
      instruction: 'Perhatikan bagian-bagiannya — itu yang bikin huruf gampang diingat.',
      componentsHeading: 'Tersusun dari',
      readingHeading: 'Dibaca',
      mnemonicHeading: 'Cara mengingat',
      // SPEC §2.11: the learner's own mnemonic beats a given one, so the copy
      // invites editing rather than presenting ours as the answer.
      mnemonicHint: 'Ubah jadi versimu sendiri — yang kamu karang sendiri jauh lebih nempel.',
      mnemonicPlaceholder: 'Tulis caramu mengingat huruf ini',
      save: 'Simpan',
      saved: 'Tersimpan.',
      mine: 'Versimu',
      confirm: 'Oke, paham',
      baseline: (literal: string, components: string[]) =>
        `${literal} tersusun dari ${components.join(' + ')}. Coba karang ceritamu sendiri dari bagian-bagian itu.`,
      baselineAtomic: (literal: string) =>
        `${literal} adalah bentuk dasar. Coba karang caramu sendiri untuk mengingatnya.`,
    },

    production: {
      heading: 'Tulis sendiri',
      instruction: 'Tanpa pilihan, tanpa contoh. Apa bahasa Inggrisnya?',
      instructionJa: 'Tanpa pilihan, tanpa contoh. Apa bahasa Jepangnya?',
      placeholder: 'Ketik kata yang dimaksud',
      // This rung grades one word, and it used to show a whole sentence as its
      // prompt — so a learner could read the prompt correctly and still not know
      // what was being asked of them.
      oneWord: 'Satu kata saja, bukan seluruh kalimatnya.',
    },

    free: {
      heading: 'Pakai di kalimatmu sendiri',
      // SPEC §2.3 L6. The instruction matters: a sentence about your own life
      // is what makes this the generation effect rather than a copy exercise.
      instruction: (word: string) =>
        `Buat satu kalimat pakai kata “${word}” — tentang harimu, kerjaanmu, apa saja yang nyata.`,
      placeholder: 'Tulis kalimatmu di sini',
      // Honest about what is and is not being checked.
      graded: 'Kami cuma mengecek kamu benar-benar memakai katanya. Isinya milikmu.',
      missing: (word: string) => `Belum ada kata “${word}” di kalimatmu.`,
      kept: 'Kalimatmu kami simpan.',
      submit: 'Kirim',
    },

    speech: {
      speak: 'Ucapkan',
      listening: 'Mendengarkan…',
      heard: (text: string) => `Terdengar: “${text}”`,
      notHeard: 'Belum terdengar. Coba lagi, atau ketik saja.',
      // SPEC §5.1: never block progression on speech.
      unavailable: 'Peramban ini belum bisa mengenali suara. Ketik saja, sama saja nilainya.',
      record: 'Rekam suaramu',
      recording: 'Merekam… ketuk untuk berhenti',
      playMine: 'Dengar rekamanmu',
      playModel: 'Dengar contohnya',
      compare: 'Bandingkan sendiri: mana yang beda?',
      noMic: 'Mikrofon tidak tersedia di sini.',
    },

    dictation: {
      heading: 'Tulis yang kamu dengar',
      instruction: 'Boleh diputar ulang sebanyak yang kamu mau.',
      placeholder: 'Ketik kalimatnya',
      replay: 'Putar lagi',
    },

    drill: {
      // SPEC §3: framed as a pattern worth knowing, never as a weakness to fix.
      heading: 'Pola yang sering bikin kepeleset',
      typePlaceholder: 'Ketik jawabanmu',
      // SPEC §8: "perbaiki kalimat ini". Framed as a fix, never as a mistake
      // the learner made — they have not written this sentence.
      correctionInstruction: 'Ada satu yang keliru di kalimat ini. Tulis ulang yang benar.',
      correctionPlaceholder: 'Tulis kalimat yang benar',
      submit: 'Jawab',
      whyHeading: 'Kenapa begitu',
      l1Heading: 'Di bahasa Indonesia',
      targetHeading: 'Di bahasa Inggris',
      pairHeading: 'Bandingkan',
      pairWrong: 'Sering ditulis',
      pairRight: 'Seharusnya',
      tipHeading: 'Cara ingatnya',
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
    open: 'Sinkronisasi antar perangkat',
    heading: 'Sinkronisasi',
    intro:
      'Aplikasi ini jalan sepenuhnya tanpa ini. Kalau kamu punya lebih dari satu HP dan mau riwayat latihanmu nyambung, kamu bisa nyalakan — tapi itu berarti datamu keluar dari HP ini.',
    // No LinguaKu server exists. Say so, rather than letting anyone assume one.
    noServer:
      'Kami tidak punya server. Kamu perlu memasang sendiri (petunjuknya ada di workers/sync/README.md), lalu tempel alamatnya di bawah.',
    enable: 'Nyalakan sinkronisasi',
    endpoint: 'Alamat server kamu',
    endpointPlaceholder: 'https://…workers.dev',
    token: 'Kata sandi server',
    tokenPlaceholder: 'Kata sandi yang kamu buat sendiri',
    save: 'Simpan',
    saved: 'Tersimpan.',
    syncNow: 'Sinkronkan sekarang',
    syncing: 'Menyinkronkan…',
    ok: (pushed: number, merged: number) =>
      `Selesai. ${pushed} sesi dikirim, ${merged} catatan baru diterima.`,
    failed: (reason: string) => `Gagal: ${reason}. Datamu di HP ini tidak berubah.`,
    disabled: 'Sinkronisasi belum dinyalakan.',
    never: 'Belum pernah',
    lastSynced: (when: string) => `Terakhir: ${when}`,
    // The privacy point, stated plainly rather than buried.
    privacy:
      'Yang dikirim: riwayat latihan dan jadwal kartumu. Kata sandi server disimpan di HP ini saja dan tidak ikut ke dalam file cadangan.',
  },

  /** SPEC §8: the graded reader — "the retention engine". */
  reader: {
    open: 'Baca',
    heading: 'Bacaan',
    // Honest about what this is: Tatoeba is a corpus of sentences, not
    // documents, so we grade sentences rather than pretending to grade a text.
    intro: 'Kalimat-kalimat yang pas dengan kemampuanmu sekarang. Ketuk kata mana pun.',
    empty:
      'Belum ada bacaan yang pas. Latihan beberapa sesi dulu supaya kami tahu kata apa saja yang sudah kamu kenal.',
    loading: 'Menyiapkan bacaan…',
    newWord: 'baru',
    tapHint: 'Ketuk kata untuk melihat artinya.',
    // SPEC §10: a block of reading is one tab stop and the arrows move inside
    // it, so this is the only place a keyboard learner is told how.
    wordNav:
      'Pakai tombol panah kiri dan kanan untuk pindah antar kata, lalu Enter untuk membuka artinya.',
    sentenceLabel: 'Kalimat bacaan',

    /**
     * SPEC §5.4: the reference learner is on mobile data, and opening the
     * reader is the one tap in this app that spends a noticeable amount of it.
     * Said in kilobytes, before the tap, with a way to say no.
     */
    data: {
      heading: 'Bacaan perlu diunduh dulu',
      body: (kb: number) =>
        `Sekitar ${kb} KB, sekali saja — setelah itu bisa dibaca offline tanpa kuota lagi.`,
      download: 'Unduh sekarang',
      note: 'Kamu memakai mode hemat kuota. Latihan tetap jalan seperti biasa.',
    },

    /** SPEC §8 + §2.4: real running text, where the coverage band is reachable. */
    passage: {
      from: (title: string) => `Dari artikel “${title}” (Wikipedia Bahasa Inggris Sederhana)`,
      check: 'Cek pemahaman',
      checkInstruction: 'Satu kata dihilangkan dari teks tadi. Kata apa?',
      checkPlaceholder: 'Ketik kata yang hilang',
      // Japanese has no graded passage corpus that is free and cleared, and
      // saying so is better than letting the learner infer parity.
      onlyEnglish:
        'Bacaan panjang baru ada untuk bahasa Inggris. Untuk bahasa Jepang, kami sajikan kalimat satu per satu dulu.',
      heading: 'Bacaan panjang',
      textLabel: 'Teks bacaan',
    },

    word: {
      reading: 'Dibaca',
      band: (band: number) => `Kata tingkat ${band}`,
      known: 'Sudah kamu kenal',
      unknown: 'Belum kamu pelajari',
      inSentence: 'Di kalimat ini',
      // SPEC §8: one tap, and it is in the deck.
      mine: 'Tambahkan ke latihan',
      mined: 'Sudah masuk daftar',
      unmine: 'Batalkan',
      minedNote: 'Akan muncul di sesi latihan berikutnya.',
      // Glosses cover 30% of English words and 4% of Japanese (measured), and
      // the gaps are mostly function words. Where there is nothing, say so —
      // the sentence translation is a real answer, not a consolation.
      noGloss:
        'Kata ini belum ada di kamus kami. Terjemahan kalimat di bawah yang jadi petunjuknya.',
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
    open: 'Lihat daftar katamu',
    heading: 'Kata yang sudah kamu temui',
    intro:
      'Semua kata yang pernah kamu jawab, yang paling kuat di atas. Melihat daftar ini tidak mengubah jadwal latihanmu sama sekali.',
    search: 'Cari kata',
    count: (total: number) => `${total.toLocaleString('id-ID')} kata`,
    more: (rest: number) => `Dan ${rest.toLocaleString('id-ID')} lagi. Ketik di kotak cari untuk menemukannya.`,
    empty:
      'Belum ada isinya. Setiap kata yang kamu jawab — benar atau salah — langsung masuk ke sini.',
    noMatch: 'Tidak ada kata yang cocok.',
    noGloss: 'Belum ada artinya di kamus kami; contoh kalimatnya yang jadi petunjuk.',
    band: (band: number) => `Kata tingkat ${band}`,
    // Capability, never a score (§2.14): each of these is a state, not a grade.
    strength: {
      mastered: 'Sudah nempel',
      known: 'Kamu kenal',
      weak: 'Mulai pudar',
      leech: 'Diajarkan ulang',
    },
  },

  /** SPEC §10: one place for everything that is not practice. */
  settings: {
    /** SPEC §5.4's quota control. */
    data: {
      heading: 'Kuota',
      intro:
        'Latihan harian sudah ada di HP-mu. Yang perlu diunduh cuma bacaan panjang — sekali saja per tingkat.',
      auto: 'Ikut pengaturan HP',
      autoHint: 'Kalau HP-mu menyalakan penghemat data, kami ikut.',
      save: 'Selalu tanya dulu',
      saveHint: 'Tidak ada yang diunduh sebelum kamu setuju.',
      full: 'Unduh saja',
      fullHint: 'Jangan tanya, langsung ambil.',
    },
    /** SPEC §7.2's pace control, and §2.14's autonomy over it. */
    pace: {
      heading: 'Kata baru per hari',
      intro:
        'Kata baru hari ini menjadi ulangan minggu depan. Pelan-pelan justru lebih cepat — dan kamu boleh atur sendiri.',
      unit: (count: number) => `${count} kata baru per hari`,
      none: 'Tidak ada kata baru dulu. Ulangan yang sudah ada tetap jalan — ini cara paling ampuh mengejar tumpukan ulangan.',
      fewer: 'Kurangi',
      more: 'Tambah',
      reset: 'Kembali ke bawaan',
      defaultNote: (count: number) => `Bawaan untuk sesi sepanjang ini: ${count}.`,
    },
    open: 'Pengaturan',
    heading: 'Pengaturan',
    done: 'Selesai',
    loading: 'Memuat…',
    // SPEC §2.14: autonomy. The wording has to make clear this is a preference,
    // not a syllabus you are locked into.
    topicsHeading: 'Topik yang kamu butuhkan',
    topicsIntro:
      'Pilih topik yang paling kamu perlukan sekarang. Kata-kata dari topik itu akan lebih dulu muncul — tapi kata dasar yang bikin kalimat nyambung tetap diajarkan.',
    topicsNone: 'Belum ada yang dipilih. Kami ikut urutan kata yang paling sering dipakai.',
    topicsNote: 'Bisa diubah atau dikosongkan kapan saja.',
    noTopics: 'Belum ada daftar topik untuk bahasa ini.',
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
    open: 'Uji suara di HP ini',
    heading: 'Uji perangkat',
    intro:
      'Kalau latihan mendengar tidak muncul, di sini tempat mengeceknya. Tombolnya membunyikan suara sekali dan mencatat hasilnya. Tidak ada yang dikirim ke mana pun.',
    run: 'Uji audio sekarang',
    running: 'Sedang mengecek…',
    again: 'Uji lagi',
    langHeading: (lang: string) => `Suara bahasa ${lang}`,
    ready: (ms: number) => `Bunyi, selesai dalam ${ms} milidetik.`,
    // Being over the deadline is a real outcome and it is explained, not hidden.
    slow: (ms: number) =>
      `Bunyi, tapi baru selesai setelah ${ms} milidetik. Untuk soal dikte itu kelamaan, jadi latihan mendengar tetap kami sembunyikan.`,
    noVoice: 'Belum ada suara untuk bahasa ini di HP kamu.',
    dead: 'Suaranya terdaftar, tapi tidak pernah benar-benar berbunyi.',
    unsupported: 'Peramban ini tidak punya fitur suara sama sekali.',
    // The one case where pressing the button changes what the app will offer.
    adopted: 'Ternyata bisa. Latihan mendengar kami buka sekarang.',
    firstCall: (ms: number) => `Panggilan pertama ke mesin suara makan waktu ${ms} milidetik.`,
    firstCallSlow:
      'Itu lama sekali, dan bukan salahmu — pengecekan suara memang kami tunda supaya aplikasinya tidak ikut macet.',
    recognitionReady: 'HP ini bisa mendengar suaramu untuk latihan berbicara.',
    recognitionAbsent: 'HP ini belum bisa mengenali suaramu. Latihan tetap jalan, tinggal diketik.',
    remindersScheduled: 'Pengingat bisa muncul walau aplikasi tertutup.',
    remindersInApp: 'Pengingat hanya muncul saat kamu buka aplikasi.',
    remindersNone: 'Peramban ini tidak punya pengingat.',
    copyHeading: 'Kirim ke pengembang',
    copyHint:
      'Salin teks ini dan kirimkan ke kami. Isinya cuma tentang kemampuan HP-mu — tidak ada satu pun jawaban latihanmu di dalamnya.',
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
      'Materi di aplikasi ini dibangun dari data terbuka. Ini daftar lengkapnya, beserta lisensi dan tanggal kami memeriksanya.',
    licenseLabel: 'Lisensi',
    sourceLabel: 'Sumber',
    verifiedLabel: 'Diperiksa',
    shareAlike: 'berbagi-serupa',
    shareAlikeNote:
      'Beberapa sumber memakai lisensi berbagi-serupa, jadi materi turunannya kami sebarkan dengan lisensi yang sama.',
    back: 'Kembali',
  },

  /** SPEC §9: honest, capability-framed, all local. */
  progress: {
    open: 'Lihat kemajuanmu',
    heading: 'Kemajuanmu',
    back: 'Kembali',
    // SPEC §9: every number here comes from this phone. Say so once, plainly.
    localOnly: 'Semua angka di sini dihitung dari jawabanmu sendiri, di HP ini saja.',
    notYet: 'Belum cukup data',

    vocab: {
      heading: 'Kosakata',
      // SPEC §9: "Kamu mengenali ~2.400 kata — cukup untuk memahami sekitar 86%…"
      headline: (words: number) => `Kamu mengenali sekitar ${words.toLocaleString('id-ID')} kata.`,
      range: (low: number, high: number) =>
        `Perkiraan kami antara ${low.toLocaleString('id-ID')} dan ${high.toLocaleString('id-ID')} kata.`,
      floor: (count: number) =>
        `${count.toLocaleString('id-ID')} kata sudah kamu buktikan sendiri lewat latihan.`,
      // The capability sentence — and it says what the percentage is *of*.
      capability: (percent: number) =>
        `Itu kira-kira ${percent}% dari kata yang muncul di kalimat yang kami ajarkan.`,
      ceiling: (percent: number) =>
        `Kalau semua kata yang kami punya kamu kuasai, angkanya sampai ${percent}%. Sisanya nama orang dan kata yang sangat jarang.`,
      empty:
        'Latihan dulu beberapa sesi. Setelah itu kami bisa memperkirakan berapa kata yang kamu kenali.',
      wide: 'Rentangnya masih lebar karena banyak tingkat yang belum pernah kamu temui.',
    },

    curve: {
      heading: 'Sebaran per tingkat kata',
      hint: 'Tingkat 1 adalah kata yang paling sering dipakai.',
      band: (band: number) => `Tingkat ${band}`,
      known: (known: number, seen: number) => `${known} dari ${seen} yang pernah kamu temui`,
      untouched: 'Belum kamu temui',
    },

    retention: {
      heading: 'Seberapa sering kamu masih ingat',
      target: (percent: number) => `Target kami ${percent}%`,
      actual: (percent: number) => `Kamu ${percent}%`,
      reviews: (count: number) => `dari ${count.toLocaleString('id-ID')} ulangan terjadwal`,
      onTarget: 'Pas. Jarak ulangannya sudah cocok buat kamu.',
      // SPEC §9: "if actual retention is far off 90%, say so and offer to retune."
      below:
        'Agak sering lupa. Jarak ulangan kami rapatkan sedikit supaya tidak terlalu berat.',
      above:
        'Kamu hampir selalu ingat — berarti ulangannya bisa lebih jarang, dan waktumu lebih hemat.',
      unknown: 'Belum cukup ulangan terjadwal untuk dinilai.',
      retune: 'Sesuaikan jarak ulangan',
      retuned: 'Sudah kami sesuaikan.',
    },

    forecast: {
      heading: 'Perkiraan beban 14 hari',
      hint: 'Berapa kartu yang jatuh tempo tiap hari, kalau kamu latihan tiap hari.',
      today: 'Hari ini',
      cards: (count: number) => `${count} kartu`,
      quiet: 'Belum ada yang jatuh tempo. Santai dulu.',
    },

    skills: {
      heading: 'Peta kemampuan',
      hint: 'Yang belum pernah diukur kami biarkan kosong, bukan diisi nol.',
      names: {
        vocab: 'Kosakata',
        grammar: 'Tata bahasa',
        listening: 'Mendengar',
        reading: 'Membaca',
        production: 'Berbicara & menulis',
      },
      unmeasured: 'Belum diukur',
      answers: (count: number) => `${count} jawaban`,
    },

    calibration: {
      heading: 'Seberapa kenal kamu dengan dirimu sendiri',
      hint: 'Waktu kamu bilang “Yakin”, seberapa sering ternyata benar?',
      sure: 'Saat bilang Yakin',
      unsure: 'Saat bilang Ragu',
      good:
        'Tebakanmu soal apa yang kamu kuasai cukup tepat. Itu keterampilan tersendiri, dan berguna.',
      weak:
        'Rasa yakin dan hasilnya masih mirip-mirip saja. Wajar di awal — makin lama biasanya makin peka.',
      unknown: 'Belum cukup jawaban untuk dibandingkan.',
    },

    consistency: {
      heading: 'Kebiasaan',
      // SPEC §2.14: a band that heals, never a streak that breaks.
      days: (days: number, window: number) => `${days} dari ${window} hari terakhir`,
      note: 'Bukan rentetan yang bisa putus. Kalau bolong, tinggal lanjut lagi.',
    },

    data: {
      heading: 'Datamu',
      note: 'Semua ini milikmu. Bisa kamu simpan sendiri kapan saja, tanpa akun.',
      export: 'Simpan salinan (JSON)',
      exported: 'Tersimpan.',
      importLabel: 'Pulihkan dari salinan',
      imported: (logs: number) =>
        logs === 0
          ? 'Salinan itu sudah ada di HP ini — tidak ada yang berubah.'
          : `Dipulihkan: ${logs.toLocaleString('id-ID')} riwayat latihan ditambahkan.`,
      importFailed: 'File itu bukan salinan LinguaKu.',
    },

    heatmap: {
      heading: 'Pola bahasa Inggrismu',
      // SPEC §2.15: no claim without evidence behind it.
      intro:
        'Ini disusun dari jawabanmu sendiri, bukan dari tebakan. Yang belum cukup datanya kami tulis apa adanya.',
      weakestLead: 'Yang paling perlu kamu latih sekarang',
      // "Kelemahan terbesarmu: he/she dan past tense" (SPEC §3.3), but phrased
      // as something to work on rather than something wrong with the learner.
      weakestNames: (names: readonly string[]) => names.join(' dan '),
      accuracy: (correct: number, attempts: number) =>
        `${correct} benar dari ${attempts} percobaan`,
      notMeasured: 'Belum cukup data',
      notMeasuredHint: (needed: number) =>
        `Butuh ${needed} jawaban lagi sebelum kami berani menyimpulkan.`,
      solid: 'Sudah mantap',
      empty:
        'Belum ada yang bisa ditampilkan. Latihan beberapa sesi dulu, nanti pola-polamu muncul di sini sendiri.',
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
    heading: 'Seminggu terakhir',
    // SPEC §9 + §2.14: capability, never a score. Each line is a thing the
    // learner can now do, and there is no total to compare against anyone.
    empty: 'Belum ada latihan minggu ini. Nanti di sini ada ringkasannya.',
    met: (count: number) => `${count} kata baru kamu temui.`,
    strengthened: (count: number) => `${count} kata kamu kuatkan lagi.`,
    mastered: (count: number) => `${count} kata sudah benar-benar nempel.`,
    drills: (count: number) => `${count} pola tata bahasa kamu latih.`,
    days: (days: number) => `Kamu latihan di ${days} hari.`,
    // A direction, never a verdict — and deliberately not phrased as a loss.
    comparedSame: 'Sama seperti minggu sebelumnya.',
    comparedMore: (previous: number) => `Minggu sebelumnya ${previous} hari.`,
    comparedFewer: (previous: number) => `Minggu sebelumnya ${previous} hari.`,
  },
  placement: {
    offer: 'Cek kemampuan (1 menit)',
    heading: 'Kata mana yang kamu tahu?',
    // SPEC §4.2: it must feel like learning, not like an exam.
    intro:
      'Bukan ujian. Kami cuma perlu tahu dari mana enaknya mulai, biar kamu tidak diajari kata yang sudah kamu kuasai.',
    instruction: 'Tahu artinya? Ketuk saja. Jujur saja — tidak ada nilai di sini.',
    start: 'Mulai cek',
    skip: 'Lewati saja',
    // §4.2: skipping must cost nothing.
    skipNote: 'Kalau dilewati, kami belajar dari jawabanmu sambil jalan.',
    know: 'Tahu',
    dontKnow: 'Belum',
    progress: (done: number) => `${done} kata`,

    result: {
      heading: 'Sudah, itu saja.',
      // SPEC §2.15 / §4.1: a band, never a bare level claim.
      band: (from: number, to: number) =>
        from === to
          ? `Kamu paling pas mulai dari kata tingkat ${from}.`
          : `Kamu paling pas mulai di antara tingkat ${from} dan ${to}.`,
      // SPEC §2.15: when the estimate is too vague to name a level, saying so
      // is more useful — and more honest — than printing a range that spans
      // the whole scale.
      unclear:
        'Jawabanmu campur-campur, jadi kami belum bisa menebak dengan yakin. Kami mulai dari tengah dan menyesuaikan sambil kamu latihan.',
      estimate: 'Ini perkiraan, dan akan terus kami perbaiki setiap kali kamu latihan.',
      overclaimed:
        'Beberapa kata tadi sebenarnya bukan bahasa Inggris — jadi perkiraannya kami buat lebih hati-hati.',
      begin: 'Mulai latihan',
    },
  },

  /**
   * SPEC §2.13. The learner writes the plan in their own words — that is the
   * mechanism, not the reminder. Copy addresses "kamu" and never implies that
   * a missed day is a failure (§2.14).
   */
  habit: {
    open: 'Atur pengingat',
    heading: 'Kapan waktu latihanmu?',
    intro:
      'Kebiasaan paling gampang nempel kalau ditempelkan ke hal yang sudah kamu lakukan tiap hari. Tulis sendiri, pakai kata-katamu.',
    // The sentence frame is the implementation intention itself.
    sentenceBefore: 'Setiap hari setelah',
    sentenceMiddle: ', saya latihan di',
    sentenceAfter: '.',
    cuePlaceholder: 'makan malam',
    placePlaceholder: 'kamar',
    cueLabel: 'Sesudah apa?',
    placeLabel: 'Di mana?',
    timeLabel: 'Ingatkan jam berapa?',
    save: 'Simpan',
    skip: 'Nanti saja',
    skipNote: 'Bisa diatur kapan saja, dan tidak diatur pun aplikasinya jalan penuh.',
    off: 'Matikan pengingat',
    saved: 'Tersimpan.',
    summary: (cue: string, place: string, time: string) =>
      `Setiap hari setelah ${cue}, kamu latihan di ${place}. Pengingat jam ${time}.`,

    // Each of these is a real, different capability level. §2.6's rule applied
    // to notifications: say what this device can do rather than imply more.
    supportScheduled: 'HP ini bisa mengingatkan walau aplikasinya tertutup.',
    supportInApp:
      'HP ini belum bisa mengingatkan kalau aplikasinya tertutup, jadi pengingatnya kami tampilkan pas kamu buka aplikasi.',
    supportNone: 'Peramban ini tidak punya pengingat, jadi catatan ini cuma buat kamu sendiri.',
    permissionDenied:
      'Izin notifikasi ditolak, jadi pengingatnya kami tampilkan di dalam aplikasi saja.',

    // The in-app cue. An invitation, never an accusation (§2.14).
    cueNudge: (cue: string) => `Sudah lewat ${cue}. Mau latihan sekarang?`,
    cueDismiss: 'Nanti',
  },
} as const;
