import { describe, expect, it } from 'vitest'
import docsChart from '../../docs/domain/camelot-chart.json'
import docsWcs from '../../docs/reference/wcs-set.json'
import chart from './fixtures/camelot-chart.json'
import wcs from './fixtures/wcs-set.json'

describe('test fixtures', () => {
  it('are exact copies of the canonical docs', () => {
    expect(chart).toEqual(docsChart)
    expect(wcs).toEqual(docsWcs)
  })
})
