# ETHICS.md — what LinguaKu will not do

Most language apps are optimized for daily-active-user counts. That objective
and the learner's objective diverge quickly, and the mechanics below are where
they diverge. This file exists so that "we could bump retention 3% by adding
streak freezes" gets answered with a decision already made, not a debate.

Required by SPEC §2.14. Referenced by the PR checklist.

---

## Banned mechanics

**Loss-aversion machinery.** No lives or hearts. No gems, coins, or any
currency. No streak that can be broken, and therefore no streak repair to sell.
Consistency is shown as a **rolling 7-day band that heals itself** — miss a
day and the band narrows; come back and it widens. Nothing is ever *lost*.

**Social pressure.** No leaderboards, no leagues, no divisions, no
friend-comparison, no "3 of your friends practiced today". LinguaKu is not a
social network (SPEC §1, non-goals).

**Guilt-framed copy.** No "you're falling behind", no sad mascots, no "don't
lose your progress", no counting down what the learner is about to forfeit.
Notification copy names the *cue* the learner chose ("Habis makan siang —
4 menit?"), never their failure. The tone rules live with the copy in
`src/i18n/id.ts`.

**Fake progress.** No XP, points, or levels that are not a direct rendering of
measured ability. If a number goes up, a learner must be able to ask "up in
what?" and get a real answer: words known, coverage of everyday text, accuracy
in a grammar category.

**Fake precision.** No bare "You are B1!". Every level estimate ships with its
uncertainty band — the schema carries `Ability.standardError` so that showing
the band is the path of least resistance, not extra work.

**Recognition-only progression.** Multiple choice cannot carry an item to
"mastered". Four-option recognition inflates the feeling of knowing while
building very little recall, which is precisely the failure mode LinguaKu
exists to fix (SPEC §1, §2.3).

**Timed pressure as a default.** Speed is a diagnostic signal we record
(`ReviewLog.latencyMs`), never a stick. Any timed mode is opt-in.

**Auto-advancing lessons.** No curriculum that marches forward regardless of
memory state. The scheduler decides what is due; a lesson plan does not.

**Dark-pattern retention.** No interstitial upsells, no "are you sure you want
to leave" traps, no artificial delay before the session can be exited, no
notification the learner did not ask for.

**Engagement-driven content selection.** Items are chosen because a memory
model says they are about to be forgotten, or because they target a known
Indonesian-L1 error. Never because they keep sessions longer.

## Learner data

**No account required, ever, for the core product.** An anonymous local profile
is created on first launch. An account exists only as an optional upgrade for
sync (SPEC §10).

**The learner owns their data.** Full JSON export, no account needed (SPEC §9).
Everything is local by default; sync is opt-in and the app is fully functional
without it.

**No analytics on learners.** No third-party telemetry, no tracking pixels, no
behavioural data leaving the device. The only analytics are the ones rendered
back to the learner about their own learning.

**Honest numbers, including bad ones.** If measured retention is far from the
0.90 target, the app says so and offers to retune (SPEC §9). We do not round
the learner's progress up.

## PR checklist

- [ ] No mechanic from the banned list, in code or in copy.
- [ ] New learner-facing mechanics carry `// SCIENCE: … — see SPEC §2.x`, or
      are flagged `// UNVALIDATED:` and raised with the human.
- [ ] Copy addresses the learner as "kamu", frames capability rather than
      points, and contains no loss or shame framing.
- [ ] Any displayed estimate of ability carries its uncertainty.
- [ ] No new data leaves the device.
- [ ] `npm run verify` is green.
