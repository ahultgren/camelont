import { describe, expect, it } from 'vitest'
import { assertNever } from './assert'
import { err, ok } from './result'

describe('assertNever', () => {
  it('throws with the value', () => {
    expect(() => assertNever('x' as never)).toThrow('Unexpected value: "x"')
  })
})

describe('Result', () => {
  it('builds both variants', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
    expect(err('no')).toEqual({ ok: false, error: 'no' })
  })
})
