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
    heading: 'Mau belajar bahasa apa?',
    subheading: 'Bisa diubah kapan saja. Tidak perlu daftar.',
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
    needTarget: 'Pilih dulu minimal satu bahasa.',
  },
  home: {
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
    roadmap: 'Sesi latihan aktif di tahap berikutnya. Yang kamu atur di sini sudah tersimpan.',
  },
  langNames: {
    en: 'Inggris',
    ja: 'Jepang',
  },
  session: {
    start: (minutes: number) => `Latihan ${minutes} menit`,
    resume: 'Lanjutkan latihan',
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
} as const;
