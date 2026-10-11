# Camelont — product spec

This document describes the **intended end state** of the app. It changes only when the
product intent changes, not as work progresses. Progress lives in `tasks/todo.md`; the
reasoning behind choices lives in `docs/decisions.md`.

## 1. Purpose

Camelont builds a **harmonically mixed set** from one or more Spotify playlists, using
the Camelot system and the user's own directional compatibility chart. The user chooses
which tracks each playlist contributes, the app proposes several valid mixes and shows
each as a BPM/key progression chart, and the chosen one is saved as a new Spotify
playlist.

The first user is a West Coast Swing DJ/dancer building sets of 15–100 tracks. The app
runs entirely in the browser: no backend, Spotify login via OAuth PKCE.

## 2. Users and access

- The owner plus friends allowlisted in the Spotify developer dashboard (Spotify
  development mode). One Spotify Client ID, configured at build time.
- Only playlists the logged-in user **owns** (or collaborates on) can be used. Spotify
  returns no track list for followed playlists. Those are listed but disabled, with an
  explanation: copy the playlist into one you own in Spotify first.

## 3. User stories

Sets are specified in §8 and the workspace in §9.

| # | As a user I can… | Acceptance |
|---|---|---|
| U1 | log in with Spotify and stay logged in across reloads; log out | PKCE with `state`; the token refreshes silently; logout clears all tokens. Sets and overrides stay on the device. |
| U2 | see my sets and create a new one | The first page after login lists my sets (name, playlists, tracks in the set, last edited, saved to Spotify or not) and offers "New set". A new set gets a name and one or more playlists, chosen from a paginated, searchable list (name, image, track count, owner; followed playlists disabled with the reason). |
| U3 | see every track's key, BPM and energy, with where each value came from | Each track shows its key as the Camelot code ("11B"), with the key name ("A major") in a tooltip, and its BPM. A value set by hand carries a mark; an unmarked value came from ReccoBeats. The edit dialog shows each value's full source. Tracks with no data are clearly marked. Each track also shows its energy as a level from 0 to 10 (ReccoBeats reports 0–1), on a chip whose colour runs with the level; the number is always shown. No mix uses energy. |
| U4 | correct or fill in a track's key, BPM and energy | Edit dialog: Camelot key, BPM, energy (0–10), optional note or source. The override persists on this device, applies in every set, and always beats fetched data. Export/import all overrides as JSON. |
| U5 | mix the set using the Camelot system | Generates mixes where **every** transition is a move in the chart (§5). Runs off the main thread, and the UI stays responsive at 100 tracks. |
| U6 | set mix rules | Opening track, closing track, "track A must be followed by track B" (repeatable, forms chains). A pair can join tracks from different playlists and is made in two clicks (§9.1). |
| U7 | understand why no mix is possible | If no clash-free order exists, the app names the blocking tracks or rules in plain language (e.g. "Bloodstream (2A) can only follow 12A and precede 1B; none are in the set"), and names left-out tracks that would unblock it. The user fixes it by changing which tracks are in the set or changing the rules. |
| U8 | choose between different possible mixes | Several distinct valid mixes of the same tracks, side by side, each with a tempo sparkline and stats: move distribution, peaks, opener and closer, BPM range, total cost. |
| U9 | explore a mix | Tempo-arc chart with a move badge between points and a hover/tap card per track; a key wheel; a running order with transition connectors (§7). |
| U10 | choose a mixing profile, optionally with an energy arc | Default profile = the reference weights (§5.3). Arc presets: none, two waves, steady build. |
| U11 | save a set's mix as a playlist in my account | Only when I press the button, and after I confirm the playlist's name: creates a **new private** playlist with the tracks in mix order and links to it. I'm warned when I already have a playlist with that name. Saving again, I choose between replacing the playlist this set saved before and creating another (§8.5). No source playlist is ever modified. |
| U12 | manage my sets | Rename, duplicate, delete (with confirmation). Everything about a set is saved on this device as I change it; reopening a set shows it as I left it, including the chosen mix. Deleting a set touches nothing in Spotify. |
| U13 | change a set's playlists | Add or remove playlists at any time. Removing one says what goes with it (its tracks, their marks, rules that name them) before it happens. |
| U14 | choose which tracks each playlist contributes | Per playlist: a BPM range, must-include and exclude marks on single tracks, and an optional limit with a pick method (§8.3–8.4). Every track shows whether it is in the set and why or why not. |
| U15 | see what a choice does, at once | On a laptop the mix stays in view while I change tracks, ranges, limits, rules or the arc, and updates in place with a summary of what changed. No scrolling to see the effect (§9). |
| U16 | know when a playlist changed in Spotify | Opening a set checks its playlists and shows e.g. "3 new, 1 removed". Nothing changes until I press Update (§8.2). |

## 4. Track data

- Spotify's audio-features endpoint is closed to new apps. Key, mode, tempo and energy
  come from **ReccoBeats** (`GET https://api.reccobeats.com/v1/audio-features?ids=…`),
  called directly from the browser (CORS is open).
- Coverage is partial (~15% of tracks missing), and keys are sometimes wrong, especially
  relative major/minor swaps at the same wheel number. So:
  - manual overrides are first-class, persisted locally (IndexedDB), exportable and
    importable as JSON, and always win over fetched data;
  - a value set by hand is marked wherever it appears, an unmarked value came from
    ReccoBeats, and the edit dialog shows each value's full source (ReccoBeats, or
    manual with the user's note);
  - fetched features are cached locally, so a playlist isn't refetched on every visit.
- Overrides belong to the track, not to a set: fixing a track fixes it in every set.
- A track without a key or BPM can't be mixed. It is left out of the set and flagged
  as needing data until the user fills it in; it doesn't stop the rest from being mixed
  (§8.3).
- The BPM saved for a track (the fetched value, or the user's override) is the only
  BPM the app uses, in track lists, in BPM ranges, in scoring and in every mix view.
  Nothing halves or doubles it automatically. Detectors often report double or half the
  danced tempo, so the override dialog has **Half** and **Double** buttons to fix a
  track in one click.

## 5. Mixing rules

### 5.1 The chart (fixed rules)

The user's directional Camelot compatibility chart decides which transitions are legal
and what each one is called. It is specified in `docs/domain/camelot-chart.md`, and the
canonical data is `docs/domain/camelot-chart.json`, a transcription of the original
chart image verified against the reference script for all 576 key pairs.

Moves: `perfect`, energy boost `+`/`++`/`+++` (plus a weaker `(+++)` alternative),
energy drop `−`/`−−`/`−−−` (plus a weaker `(−−−)`), and `mood` change. **Anything not in
the chart is a clash, and clashes are never allowed in a generated mix.**

The chart is directional: `8A → 8B` is `+`, `8B → 8A` is `−`, and `2A → 3B` is a clash
while `1B → 2A` is `perfect`.

### 5.2 Tempo

The relative tempo gap between neighbours compares their saved BPMs as they are:

```
gap(a, b) = |a − b| / max(a, b)
```

Half and double time are not matched: 175 next to 88 is a 50% gap until the user halves
the 175 with an override (§4).

### 5.3 Profiles (tunable scoring)

A profile turns a mix into a cost, and lower cost is better. It is kept separate from
the chart, so the scoring can change without touching the rules. A profile contains:

- a cost per move. The default reproduces the reference script: perfect 0; `+`/`−` 1;
  `+++`/`−−−` 2; `++`/`−−` 3; `(+++)`/`(−−−)`/mood 4;
- a tempo weight (default 20, so a 10% gap ≈ one `+++`);
- an optional **energy arc**: a target curve over set position (presets: two waves,
  steady build), a signal it applies to (BPM at first; energy can be added later), and
  a weight.

Mix cost = Σ transitions (move cost + tempo weight × gap) + arc weight × Σ deviation of
the signal from the target curve. Only the default profile ships at first. The design
must allow more profiles later (e.g. "favour +++") without changing the chart or the
solver.

### 5.4 Mix rules

Opening track, closing track, and ordered "A → B" follow pairs (chains allowed). Follow
pairs that form a cycle, branch (A → B and A → C), or are themselves a clash are
reported as rule errors before solving.

Which tracks take part is decided by the set (§8.3), not by the mix rules. A track named
in a mix rule is in the set for as long as the rule exists, as if it were marked
must-include. Excluding such a track is reported as a rule error naming the rule.

### 5.5 Alternatives

The solver returns up to *k* (default 5) valid mixes, best cost first. They must be
**meaningfully different**: two mixes that share most of their adjacencies count as the
same mix. Results are deterministic for the same input and seed. Every alternative
orders the **same tracks**: which tracks are in the set is settled before ordering
(§8.4).

## 6. Non-functional requirements

- **No backend.** Static SPA on GitHub Pages; everything else runs in the browser.
- **Privacy.** Tokens, sets and overrides stay on the device. Nothing is sent anywhere
  except Spotify and ReccoBeats. Only the scopes needed are requested:
  `playlist-read-private playlist-read-collaborative playlist-modify-private`.
- **Performance.** A set of 100 tracks gives its first results within ~2 s on a laptop.
  The solver runs in a Web Worker. The pool a set draws from can be much larger: lists,
  filters and track choices stay responsive with 1,000 tracks across a set's playlists.
  Above 100 tracks in the set the app says mixing may be slow.
- **Resilience.** Honour Spotify `429 Retry-After`. ReccoBeats failures degrade to
  "missing data", never to a crash. All external payloads and everything read back from
  local storage are validated at the boundary. A stored set that can't be read is
  reported, never silently dropped or half-loaded.
- **Accessibility.** Keyboard reachable, and chart points focusable with labels. Colour
  is never the only carrier of meaning: move badges carry a symbol, keys carry text,
  and a track's in/out status carries a word.
- **Responsive.** Designed for a laptop (§9). Works at phone width; charts scroll
  horizontally when needed.
- **Themes.** Light and dark, following the system.

## 7. Visual language

Carried over from the reference pages in `docs/reference/charts/`, which are the look the
user already approved:

- Fonts: Bricolage Grotesque (headings), IBM Plex Sans (body), IBM Plex Mono (numbers,
  keys, codes).
- Cool indigo neutrals; accent `#3A4BD8`; ok `#2E7D5B`; warn `#B4540F` (light theme; full
  token set in the reference HTML).
- **Key colour is derived from the wheel:** `hue = ((n − 1) × 30 + 330) mod 360`. Major
  (B) and minor (A) share the hue at two lightness levels.
- **Move badges:** `=` perfect (green), `+ ++ +++` boost (accent), `− −− −−−` drop (muted),
  `~` mood (warn). A `✗` clash exists only when evaluating an imported or legacy order.
- **A key is shown as its Camelot code** wherever it appears: `11B`. The key name
  (`A major`) is the code's tooltip and is there for assistive tech. Only the list of
  keys to choose from in the edit dialog spells out both (`11B · A major`).
- **Tempo-arc chart** (the primary view): x = set position, y = BPM (auto-ranged), a line
  through the points coloured by key, a move badge above each segment, optional arc
  target curve, hover/tap/focus card (position, title, artist, Camelot code, BPM, energy,
  the move into this track and where it came from).
- **Key wheel:** two rings (outer major, inner minor); used keys filled with their
  colour and a count (`7B×5`).
- **Running order:** track cards (title, artist, key, BPM, energy) with a connector
  between each pair (from → to key, move name, BPM delta), coloured like the badges.
- **Energy** is a level from 0 to 10, shown as the number on a chip. The chip's hue runs
  with the level, from blue (calm) through green and yellow to red (intense), at the
  tone of a key chip so the same ink reads on it in both themes. The colour is never
  the only carrier: the number is always there.

## 8. Sets

### 8.1 What a set is

A set is the unit of work. It holds:

- a **name**;
- one or more **playlists** from the user's Spotify account, in the order they were
  added;
- per playlist, the **track choices** (§8.3): BPM range, limit and pick method;
- per track, an optional **mark**: must-include or exclude;
- the **mix settings**: opening track, closing track, follow pairs, arc (§5.3–5.4);
- the **chosen mix**, and where and when the set was last saved to Spotify.

The *pool* is every track in the set's playlists. The tracks *in the set* are the ones
the track choices let through; the rest are *left out*. Only tracks in the set are mixed.

A set with one playlist and no track choices behaves like mixing that playlist whole.

### 8.2 Playlists in a set

- **Stored copy.** Adding a playlist stores its track list in the set. The set works
  from that copy and never changes behind the user's back.
- **Change notice.** Opening a set checks each of its playlists against Spotify. If one
  changed, the set says how ("3 new, 1 removed") and offers **Update**. Until then the
  stored copy stays in use.
- **Update.** New tracks join the pool unmarked and go through the playlist's track
  choices like any other. Removed tracks leave the pool; their marks and any mix rule
  naming them go too, and the app lists what was dropped.
- **Unreachable playlist.** If a playlist can no longer be read (deleted, no longer
  owned), the set keeps its stored copy and says it can't be checked.
- **A track is in a set at most once.** Sameness is the Spotify track ID. A playlist
  *lets a track in* when the track is must-include, or has a key and a BPM inside that
  playlist's range. When a track sits in several of the set's playlists, one of them
  decides it:
  - the first playlist that lets it in and has no limit: the track is in the set;
  - failing that, the first playlist that lets it in: the track competes for that
    playlist's limit, and if it isn't picked it is left out (it isn't passed on);
  - if no playlist lets it in, it is left out.

  So a track is in the set whenever some playlist would take it. The other playlists
  that would let it in show it as "already in ‹playlist›" and don't count it toward
  their limit; a playlist that wouldn't shows its own reason (outside its range, needs
  key/BPM). A track listed several times in one playlist counts once.
- **Marks belong to the track.** Exclude and must-include apply in every playlist of
  the set that has the track: an excluded track is excluded everywhere.
- **Adding and removing.** Playlists can be added or removed at any time. Removing one
  removes its tracks, their marks and the mix rules naming them, after a confirmation
  that says so.

### 8.3 Choosing tracks from a playlist

For each playlist, a track's fate is decided by the first rule that applies:

| Order | Rule | Result |
|---|---|---|
| 1 | Marked **exclude** | Left out, in every playlist that has it. Nothing overrides this. |
| 2 | Another playlist decides the track (§8.2) | Not counted here. |
| 3 | Marked **must-include** (or named in a mix rule, §5.4) | In the set, whatever its BPM and whatever the limit. |
| 4 | No key or no BPM | Left out, flagged "needs key/BPM". |
| 5 | BPM outside the playlist's **BPM range** | Left out. |
| 6 | The playlist has a **limit** and the track isn't picked (§8.4) | Left out. |
| 7 | Otherwise | In the set. |

- The BPM range is per playlist, inclusive, uses the saved BPM (§4), and either end may
  be left open. No range means every BPM passes.
- A must-include track without a key or BPM can't be mixed. It blocks the mix, by name,
  until the user fills it in or removes the mark.
- Each track shows its status and the reason in words: "in the set", "in the set · must
  include", "in the set · picked", "left out · excluded", "left out · outside 85–110
  BPM", "left out · not picked", "left out · needs key/BPM", "already in ‹playlist›".
- Each playlist shows its counts: tracks in the pool, in the set, and left out per
  reason.

### 8.4 Limits and picks

A playlist may have a **limit**: the most tracks it contributes. The use case is a
playlist of odd tracks from which the set should have just one or two.

- Must-include tracks come first and count toward the limit. With a limit of 3 and one
  must-include track, that track is in and two more are picked.
- If the must-include tracks alone reach or exceed the limit, they are all in, nothing
  more is picked, and the playlist says so ("4 must-include tracks, limit 3").
- The remaining places are filled from the tracks that passed rules 1–5, by the
  playlist's **pick method**:
  - **Random.** A stable draw: the same picks every time the set is opened, and a change
    elsewhere moves only the picks it has to. **Reshuffle** draws again.
  - **Best fit.** The tracks that fit the rest of the set best: ones with good chart
    moves to and from the tracks already in the set, at a tempo close to theirs. The
    same set and choices always give the same picks.
- If fewer tracks are available than the limit, all of them are in.
- **Picks are settled before ordering.** Every alternative mix (§5.5) contains the same
  tracks, so the alternatives stay comparable.
- **Picks are visible.** A picked track is shown as picked. The user can **lock** a pick
  (it becomes must-include) or **reject** it (it becomes excluded), and the playlist
  picks again.
- **Picks move when the set moves.** Best-fit picks depend on the rest of the set, so a
  change to another playlist can change them. When picks change, the app names what
  went out and what came in.
- Best fit keeps the set mixable where it can: a track that has no place in a
  clash-free order of the rest of the set isn't picked while one that has is available.

### 8.5 The chosen mix and saving

- The set remembers which alternative the user chose. Reopening the set shows that mix.
- When the tracks or settings change, the alternatives are worked out again and the
  best one is shown.
- **Save to Spotify** is the only thing that writes to Spotify, and it always asks
  first. The dialog has:
  - the **playlist's name**, filled in with the name used last time, or the set's name
    on the first save. The user confirms or changes it before anything is written;
  - a **warning** when one of the user's own playlists already has that name. Spotify
    allows two playlists with one name, so this never blocks the save;
  - when this set has saved a playlist before, a **choice**: replace that playlist's
    tracks (and name) with this mix, or create another playlist. The dialog says which
    playlist would be replaced and that its current tracks go.
- **What can be replaced.** Only the playlist this set created with its last save, and
  only while it still exists, is still the user's, and is not one of the playlists any
  set on this device draws from. Otherwise the save creates a new playlist. A playlist
  the user made by hand, or one that merely has the same name, is never touched.
- A new playlist is private and holds the tracks in mix order. Afterwards the set shows
  the link and the time of the save, and whether the mix has changed since.

### 8.6 Storage

- Sets are stored in the browser (IndexedDB), on this device only, and saved as the user
  works. There is no save button for a set.
- Clearing the site's data or using another browser loses the sets. Saved Spotify
  playlists are unaffected.
- Logging out keeps the sets.

## 9. Workspace

One screen per set. It is designed for a laptop: at 1280 × 720 and up, the user works
without scrolling the page.

| # | Requirement |
|---|---|
| W1 | **The mix stays in view.** The chosen mix's tempo chart and headline numbers (tracks, BPM range, moves, cost) are visible while the user edits any input: playlists, track choices, marks, mix rules, arc. |
| W2 | **No page scroll.** Long content (the track list, the running order) scrolls inside its own area. The result never leaves the screen. |
| W3 | **Changes land in place.** A change updates the mix where it is, within about a second for 100 tracks. While it is being worked out, the previous mix stays on screen marked as updating; the screen doesn't empty or jump. |
| W4 | **Changes are explained.** After each update, a short summary says what moved: tracks in and out of the set, picks that changed, cost before and after. |
| W5 | **One step between tools.** Playlists and their track choices, the track list, mix rules, arc, the alternatives and the mix views (chart, key wheel, running order) are each one click or key press away. Switching keeps each tool's state (scroll position, filter, selection). |
| W6 | **One track, everywhere.** Pointing at or selecting a track in any view highlights it in all the others. |
| W7 | **One track list for the set.** All playlists' tracks in one list, grouped or filtered by playlist and by status (in the set, left out and why, needs data), sortable by BPM and key. Marks, and key/BPM fixes, are made from the row. |
| W8 | **Ranges show what they cut.** The BPM range control shows the playlist's BPM distribution, so the user sees which tracks a range lets through before settling on it. |
| W9 | **Problems appear where the mix would be.** A missing key on a must-include track, a rule error or "no mix possible" replaces the result in place, with the fix one step away. |
| W10 | **Phone.** At phone width the same tools are reachable as tabs under a compact chart. The no-scroll promise applies to laptop widths only. |

### 9.1 Layout

Two columns at laptop width, under a top bar with the set's name and **Save to Spotify**.

- **Tracks (left, about 60%).** The one track list (W7), grouped by playlist. Each
  playlist is a header bar over its own tracks, and the bar carries that playlist's
  controls: name, tracks in the set out of tracks in the pool, the BPM range over the
  BPM distribution (W8), the limit, the pick method (shown only when there is a limit),
  and the change notice (shown only when Spotify changed). A playlist's tracks can be
  folded away; any number of playlists can be open. The column scrolls by itself.
- **Track rows.** One line per track: title and artist, key (Camelot code), BPM,
  energy (0–10), and one group of toggles of which at most one is on: opener, closer, always include,
  exclude. Left-out rows are dimmed. A short tag gives the reason only when the app
  made the call (outside range, not picked, picked, needs key/BPM, already in
  ‹playlist›); an excluded row needs none, its toggle says it. Locking a pick is turning
  on "always include" and rejecting it is turning on "exclude"; there are no separate
  controls. Rows that joined or left the set in the last change are marked.
- **Key, BPM and energy on the row.** Clicking a track's key, BPM or energy opens the
  edit dialog (U4), which shows where each value came from. On the row, only a value
  set by hand is marked. All three are on the row at phone width too.
- **Playlist menu.** The header bar has a small menu with **Update** (when Spotify
  changed) and **Remove from set**.
- **Follow pairs** are made in two ways, and both work across playlists:
  - *Pin a transition.* In the running order, the connector between two neighbouring
    tracks has a pin: keep these two together.
  - *"Followed by…" from a row.* A link button on a track row arms it; a notice at the
    top of the track column says which track is waiting and how to cancel (Esc). The
    next row the user chooses, in any playlist, completes the pair. While armed, the
    list scrolls, folds and filters as usual, every other row shows the chart move it
    would make, and rows that would clash can't be chosen. It works from the keyboard.
    Arming the second track of a pair extends it into a chain.

  A pair shows on both rows (the partner's name, and pointing at it highlights the
  partner), in the mix column's list of pairs (where it can be removed), and as the pin
  in the running order. The link button is separate from the row's toggle group: an
  opener can also have a follower.
- **Mix (right, about 40%).** Always in view: the change summary (W4), the tempo chart,
  the headline numbers, the alternatives, the arc, the follow pairs, and the key wheel
  and running order. The running order scrolls in its own area.

The prototype this came from settles the layout only. The look follows §7.

## 10. Out of scope (for now)

Hand-editing a generated mix (drag/reorder); a set-wide target size or duration;
letting each alternative mix use different tracks; moving sets between devices
(export/import or sync); treating different releases of the same song as one track;
multiple languages; a backend or shared storage; modifying playlists the app didn't create; playback;
automatic BPM halving; a second data provider or in-browser audio analysis; public
(non-allowlisted) access.

## 11. Likely future directions

These shape the design without being built: more profiles ("lots of +++", stricter
tempo), energy as an arc signal, user-drawn arcs, chart tweaks, second-opinion key data
with relative-key-swap warnings, a set-wide length target, export/import of sets, more
pick methods (e.g. "fill gaps in the arc"). Keep the seams (chart as data, profile as
data, arc as a separate scoring term, provider behind an interface, track choice as a
step before the solver) so these slot in cleanly.
