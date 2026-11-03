/**
 * Choosing a Japanese lexeme's reading.
 *
 * ## What went wrong
 *
 * `build-ja.ts` kept the reading of the *first* JMdict entry that lists a
 * headword. JMdict lists rare kanji spellings under other words' entries, so
 * file order decided the reading: 彼 became あれ (its rare spelling of "that")
 * instead of かれ, 僕 became しもべ ("servant") instead of ぼく, 空 から, 風
 * ふり, 本 もと. Measured against the build-time token readings of each word's
 * own example sentences, 197 of the shipped lexemes carried a reading none of
 * their sentences use — and since the reading is also an accepted answer, a
 * learner who typed *kare* for 彼 was marked wrong.
 *
 * ## What replaces it
 *
 * `pickReading` prefers an entry where the headword is a common spelling
 * (JMdict's priority tags) and avoids ones where it is marked rare, irregular,
 * outdated or ateji; file order only breaks ties.
 *
 * `READINGS` is the reviewed table for the 197: each was read in its example
 * sentences and resolved by hand to the reading the word has there. The
 * build-time readings (IPADIC) are usually right — 時 in 何時 is じ, 杯 in ２杯
 * is はい — but not always: they read 我思う as わがおもう, 夜中 as やちゅう,
 * 明後日 as みょうごにち and 大分 as Ōita, so where the corpus reading is a
 * misreading the dictionary reading stands, and the table says so by listing
 * it. Authored by the project (MIT), like the contrastive notes; it wants a
 * native speaker's review like they do.
 */

export interface ReadingCandidate {
  /** The entry's first kana reading. */
  reading: string;
  /** The headword carries a JMdict priority tag in this entry. */
  common: boolean;
  /** The headword is marked rare, irregular, outdated, search-only or ateji. */
  rare: boolean;
  /** Position of the entry in the file, for ties. */
  order: number;
}

export const pickReading = (candidates: readonly ReadingCandidate[]): string | undefined =>
  [...candidates].sort(
    (a, b) =>
      Number(b.common) - Number(a.common) ||
      Number(a.rare) - Number(b.rare) ||
      a.order - b.order,
  )[0]?.reading;

/** `ke_inf` values that mark a spelling as not the word's ordinary one. */
export const RARE_SPELLING = /&(rK|iK|oK|sK|ateji);/;

/**
 * The reviewed readings: headword → reading, in hiragana (katakana where the
 * word is a loan). A headword here is settled; the shard check accepts it even
 * where the corpus reads it otherwise.
 */
export const READINGS: Readonly<Record<string, string>> = {
  // band 1
  彼: 'かれ',
  時: 'じ',
  本: 'ほん',
  僕: 'ぼく',
  日: 'ひ',
  中: 'ちゅう',
  前: 'まえ',
  日本: 'にほん',
  入る: 'はいる',
  度: 'ど',
  降る: 'ふる',
  頭: 'あたま',
  金: 'かね',
  後: 'あと',
  背: 'せ',
  間: 'あいだ',
  文: 'ぶん',
  十分: 'じゅうぶん',
  空: 'そら',
  他: 'ほか',
  数: 'すう',
  万: 'まん',
  // band 2
  風: 'かぜ',
  書: 'しょ',
  弾く: 'ひく',
  昨夜: 'ゆうべ',
  得る: 'える',
  杯: 'はい',
  日本人: 'にほんじん',
  娘: 'むすめ',
  性: 'せい',
  会: 'かい',
  先: 'さき',
  割る: 'わる',
  四: 'よん',
  実に: 'じつに',
  市: 'し',
  床: 'ゆか',
  // band 3
  米: 'こめ',
  貴方: 'あなた',
  日間: 'にちかん',
  氏: 'し',
  証: 'しょう',
  側: 'がわ',
  女: 'おんな',
  面: 'めん',
  七: 'なな',
  下手: 'へた',
  字: 'じ',
  役: 'やく',
  我: 'われ',
  法: 'ほう',
  生: 'なま',
  詩: 'し',
  辺: 'へん',
  人前: 'ひとまえ',
  放す: 'はなす',
  末: 'まつ',
  様: 'さま',
  点: 'てん',
  瓶: 'びん',
  館: 'かん',
  右腕: 'みぎうで',
  品: 'ひん',
  夜中: 'よなか',
  常: 'つね',
  明後日: 'あさって',
  本屋: 'ほんや',
  機: 'き',
  秋: 'あき',
  // band 4
  門: 'もん',
  一行: 'いっこう',
  仇: 'あだ',
  代: 'だい',
  仲間: 'なかま',
  否: 'いな',
  園: 'えん',
  土: 'ど',
  場: 'じょう',
  士: 'し',
  大勢: 'おおぜい',
  故郷: 'こきょう',
  略: 'りゃく',
  祭: 'さい',
  身体: 'からだ',
  長: 'ちょう',
  お家: 'おうち',
  一時: 'いちじ',
  中身: 'なかみ',
  令: 'れい',
  件: 'けん',
  供: 'きょう',
  入り口: 'いりぐち',
  助手: 'じょしゅ',
  台詞: 'せりふ',
  和: 'わ',
  塵: 'ちり',
  婦: 'ふ',
  尻: 'しり',
  市場: 'いちば',
  東: 'ひがし',
  格好いい: 'かっこいい',
  産: 'さん',
  稲妻: 'いなずま',
  自ら: 'みずから',
  裏: 'うら',
  象: 'ぞう',
  軒: 'けん',
  辛い: 'つらい',
  際: 'さい',
  預ける: 'あずける',
  // band 5
  その間: 'そのあいだ',
  よそ行き: 'よそゆき',
  万歳: 'ばんざい',
  世論: 'よろん',
  仮: 'かり',
  伝: 'つて',
  位: 'くらい',
  作物: 'さくもつ',
  価: 'か',
  値: 'ね',
  偽物: 'にせもの',
  公平: 'こうへい',
  出来: 'でき',
  切り: 'きり',
  刺: 'とげ',
  刻々: 'こっこく',
  功: 'こう',
  勝: 'しょう',
  十中八九: 'じっちゅうはっく',
  印: 'しるし',
  取得: 'しゅとく',
  嘔吐: 'おうと',
  器: 'うつわ',
  堪える: 'たえる',
  大分: 'だいぶ',
  大所: 'おおどころ',
  大損: 'おおぞん',
  如何: 'いかが',
  妾: 'わらわ',
  婚: 'こん',
  宝物: 'たからもの',
  実: 'み',
  射手: 'いて',
  帯: 'おび',
  弘法: 'こうぼう',
  憂い: 'うれい',
  戦: 'せん',
  敵: 'てき',
  日本一: 'にほんいち',
  明: 'みょう',
  明朝: 'みょうちょう',
  春風: 'はるかぜ',
  村中: 'むらじゅう',
  条: 'じょう',
  柵: 'さく',
  根本: 'こんぽん',
  棘: 'とげ',
  機関: 'きかん',
  欠: 'けつ',
  止め: 'とめ',
  歩: 'ほ',
  気味: 'きみ',
  気色: 'けしき',
  汚れ: 'よごれ',
  源: 'みなもと',
  潜る: 'もぐる',
  父母: 'ふぼ',
  玉: 'たま',
  病: 'やまい',
  痛: 'つう',
  目下: 'もっか',
  目標: 'もくひょう',
  真に: 'まことに',
  社: 'しゃ',
  端: 'はし',
  節: 'ふし',
  緩い: 'ゆるい',
  罰: 'ばつ',
  腹痛: 'ふくつう',
  自分勝手: 'じぶんかって',
  英: 'えい',
  蓮: 'はす',
  行: 'ぎょう',
  表: 'ひょう',
  貴男: 'あなた',
  造り: 'つくり',
  酷い: 'ひどい',
  重: 'じゅう',
  開: 'かい',
  陰: 'かげ',
  難くせ: 'なんくせ',
  風車: 'ふうしゃ',
  骨: 'ほね',
  高: 'たか',
  鶏肉: 'とりにく',
  黒人: 'こくじん',
};
