import { describe, expect, it } from 'vitest'
import { SETTINGS } from './settings'

describe('settings', () => {
  it.each([0, 241, 2.5])('rejects a refresh interval of %s minutes', (minutes) => {
    expect(SETTINGS.refreshMinutes.experimental_schema.safeParse(minutes).success).toBe(false)
  })

  it.each([1, 5, 240])('accepts a refresh interval of %s minutes', (minutes) => {
    expect(SETTINGS.refreshMinutes.experimental_schema.safeParse(minutes).success).toBe(true)
  })

  it('has no query setting, because tabs hold the queries', () => {
    expect(Object.keys(SETTINGS)).toEqual(['refreshMinutes'])
  })
})
