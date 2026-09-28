# Lessons

Patterns to avoid repeating. Add one after every correction from the owner.

- **Don't read another project's private sources without explicit approval**, even to
  save time while waiting. Ask, or wait for the approved handoff. (2026-09-27)
- **Specs don't change as the plan progresses.** Keep end-state intent in
  `docs/spec.md` and progress in `tasks/todo.md`; don't mix decisions into the plan.
- **Gate commits on the checks.** Chain `lint && typecheck && test && git commit`; a
  commit that runs after a failing check ships the failure. Tests at a feature's root
  count as the feature's `index` element for boundaries; put them in the segment whose
  imports they need. (2026-09-27)
