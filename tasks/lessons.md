# Lessons

Patterns to avoid repeating. Add one after every correction from the owner.

- **Don't read another project's private sources without explicit approval**, even to
  save time while waiting. Ask, or wait for the approved handoff. (2026-09-27)
- **Specs don't change as the plan progresses.** Keep end-state intent in
  `docs/spec.md` and progress in `tasks/todo.md`; don't mix decisions into the plan.
- **Gate commits on the checks.** Chain `lint && typecheck && test && git commit`; a
  commit that runs after a failing check ships the failure. A pipe hides the exit code
  (`pnpm lint | tail && git commit` commits on a lint error): use `set -o pipefail`
  or don't pipe. Tests at a feature's root
  count as the feature's `index` element for boundaries; put them in the segment whose
  imports they need. (2026-09-27)
- **Test heuristics on the owner's real data, not only hand-picked small sets.** The
  first set-tempo fold passed tests whose sets all spanned under 1.5× and failed on the
  owner's playlist (78–184 BPM). When a rule chooses between interpretations (octave,
  reference, tie-break), add the real input as a fixture, plus a stability test that
  small edits don't flip the result, and get an adversarial review. (2026-09-28)
- **A value that disagrees with another signal isn't thereby wrong.** Brother's energy
  (0.929 at 78 BPM) was written up as proof that ReccoBeats energy is unreliable, and
  repeated from the docs as fact; the owner knows the song and says the value is right.
  Before calling data bad because it looks odd, ask the owner or show it to them. A
  claim about data quality in the docs is a hypothesis until it was checked. (2026-10-11)
