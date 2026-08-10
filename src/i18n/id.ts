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
    roadmap: 'Sesi latihan aktif di tahap berikutnya. Yang kamu atur di sini sudah tersimpan.',
  },
  langNames: {
    en: 'Inggris',
    ja: 'Jepang',
  },
} as const;
