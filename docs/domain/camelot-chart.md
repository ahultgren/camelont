# The Camelot compatibility chart

**Canonical data:** [`camelot-chart.json`](camelot-chart.json). It is a cell-by-cell hand
transcription of the user's chart image, cross-checked against the rule encoding in
[`../reference/camelot.py`](../reference/camelot.py) for all 24 × 24 = 576 key pairs, with
zero mismatches. The image itself is third-party and not committed; the JSON is the spec.
If code and JSON ever disagree, the JSON wins.

## Camelot notation

`n` + mode, where `n` ∈ 1..12 is the position on the wheel and mode `A` = minor,
`B` = major. `8A` = A minor, `8B` = C major.

From Spotify/ReccoBeats pitch class (`key` 0–11, 0 = C) and `mode` (1 = major):

```
n = (key × 7 + (mode ? 8 : 5)) mod 12, with 0 → 12
```

Anchors: `(9, minor) → 8A` (A minor), `(0, major) → 8B` (C major),
`(1, minor) → 12A` (C♯ minor), `(11, major) → 1B` (B major).

Key names use flats except F♯/C♯, following the reference script:
`C C# D Eb E F F# G Ab A Bb B`, plus "major"/"minor".

## Moves

Columns of the chart, in the JSON's naming:

| JSON | Symbol | Meaning |
|---|---|---|
| `perfect` | `=` | perfect match |
| `boost1` / `boost2` / `boost3` | `+` / `++` / `+++` | energy boost |
| `boost3Alt` | `(+++)` | weaker alternative for +++ (parenthesised in the image) |
| `drop1` / `drop2` / `drop3` | `−` / `−−` / `−−−` | energy drop |
| `drop3Alt` | `(−−−)` | weaker alternative for −−− |
| `mood` | `~` | mood change (parallel major/minor, same root note) |

A target not listed for a source key is a **clash**, and clashes are never used in a
generated mix.

## The same rules, as wheel arithmetic

With `d = (n_target − n_source) mod 12`:

| From | perfect | + | ++ | +++ | (+++) | − | −− | −−− | (−−−) | mood |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** | A d=0; B d=11 | B d=0; A d=1 | A d=9 | A d=2 | A d=7 | A d=11 | A d=3 | A d=10 | A d=5 | B d=3 |
| **B** | B d=0; A d=1 | B d=1 | B d=9 | B d=2 | B d=7 | A d=0; B d=11 | B d=3 | B d=10 | B d=5 | A d=9 |

An implementation may encode either form, but its tests must assert equality with the
JSON for all 576 pairs.

## Things that look wrong but are right

These are deliberate. Do not "fix" them toward the textbook symmetric rule
(same / ±1 / relative), which the user explicitly replaced with this chart:

- **Directional.** `8A → 8B` is `+`; `8B → 8A` is `−`.
- **Asymmetric legality.** `1B → 2A` is `perfect`, but `2A → 3B` is a clash.
- **Three steps down is `++`, three steps up is `−−`.**
- The relative major of `nA` in the "perfect" column is `(n−1)B`, not `nB`. `nA → nB` is
  a `+` boost.

## Spot checks (from the original verification)

```
1A → 12B  perfect      1B → 2A   perfect
1A → 2A   +            1B → 2B   +
1A → 10A  ++           1B → 10B  ++
1A → 3A   +++          1B → 3B   +++
1A → 8A   (+++)        1B → 8B   (+++)
1A → 12A  −            1B → 1A   −
1A → 4A   −−           1B → 12B  −
1A → 11A  −−−          1B → 4B   −−
1A → 6A   (−−−)        1B → 11B  −−−
1A → 4B   mood         1B → 6B   (−−−)
12A → 11B perfect      1B → 10A  mood
12B → 1A  perfect      7B → 4A   mood
2A → 3B   clash
```
