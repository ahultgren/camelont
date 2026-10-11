import type { DroppedRule } from './playlist-diff'
import type { MixRules } from './set'
import type { TrackMark } from './types'

/**
 * What stops a set from being mixed before the solver is asked, in the set's own words
 * (spec §5.4, §8.3). The mix rules themselves (cycles, branches, clashing pairs) are
 * checked by the mixing feature.
 */

/** A mix rule, named by the tracks it holds. */
export type MixRule = DroppedRule

type Marks = Readonly<Record<string, TrackMark>>
type Namer = (trackId: string) => string

/** Every mix rule with the tracks it names. */
function rulesOf(mix: MixRules): { rule: MixRule; trackIds: string[] }[] {
  return [
    ...(mix.opener === null
      ? []
      : [{ rule: { kind: 'opener', trackId: mix.opener } as const, trackIds: [mix.opener] }]),
    ...(mix.closer === null
      ? []
      : [{ rule: { kind: 'closer', trackId: mix.closer } as const, trackIds: [mix.closer] }]),
    ...mix.follows.map(([from, to]) => ({
      rule: { kind: 'follow', from, to } as const,
      trackIds: [from, to],
    })),
  ]
}

export interface ExcludedInRule {
  trackId: string
  rule: MixRule
}

/**
 * Mix rules that name an excluded track (spec §5.4). A rule keeps its tracks in the set
 * and an exclusion takes one out; nothing overrides an exclusion (§8.3), so the rule
 * can't hold and the user has to drop one of the two.
 */
export function excludedInRules(marks: Marks, mix: MixRules): ExcludedInRule[] {
  return rulesOf(mix).flatMap(({ rule, trackIds }) =>
    [...new Set(trackIds)]
      .filter((trackId) => marks[trackId] === 'exclude')
      .map((trackId) => ({ trackId, rule })),
  )
}

export function describeExcludedInRule({ trackId, rule }: ExcludedInRule, name: Namer): string {
  const excluded = `${name(trackId)} is excluded, but`
  switch (rule.kind) {
    case 'opener':
      return `${excluded} it is the opening track. Remove the exclusion or choose another opening track.`
    case 'closer':
      return `${excluded} it is the closing track. Remove the exclusion or choose another closing track.`
    case 'follow':
      return `${excluded} ${name(rule.from)} must be followed by ${name(rule.to)}. Remove the exclusion or the pair.`
  }
}

/**
 * A track that must be in the set but can't be mixed (spec §8.3): what keeps it in, and
 * the way out.
 */
export function describeBlocker(trackId: string, marks: Marks, mix: MixRules, name: Namer): string {
  const noData = 'but has no key or BPM. Fill them in, or'
  if (marks[trackId] === 'mustInclude') {
    return `${name(trackId)} is marked must-include ${noData} remove the mark.`
  }
  const rule = rulesOf(mix).find(({ trackIds }) => trackIds.includes(trackId))?.rule
  switch (rule?.kind) {
    case 'opener':
      return `${name(trackId)} is the opening track ${noData} choose another opening track.`
    case 'closer':
      return `${name(trackId)} is the closing track ${noData} choose another closing track.`
    case 'follow':
      return `${name(trackId)} is in the pair ${name(rule.from)} → ${name(rule.to)} ${noData} remove the pair.`
    case undefined:
      return `${name(trackId)} must be in the set ${noData} leave it out.`
  }
}

/** Why no track is in the set. */
export function describeEmptySet(counts: { playlists: number; pool: number }): string {
  if (counts.playlists === 0) return 'This set has no playlists yet. Add one to start mixing.'
  if (counts.pool === 0) return 'The playlists in this set have no tracks that can be mixed.'
  return `No track is in the set: all ${counts.pool} are left out. Widen a BPM range, raise a limit, or fill in a key and BPM.`
}
