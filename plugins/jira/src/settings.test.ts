import { describe, expect, it } from 'vitest'
import { DEFAULT_JQL, SETTINGS } from './settings'

describe('settings', () => {
  it.each([0, 241, 2.5])('rejects a refresh interval of %s minutes', (minutes) => {
    expect(SETTINGS.refreshMinutes.experimental_schema.safeParse(minutes).success).toBe(false)
  })

  it.each([1, 5, 240])('accepts a refresh interval of %s minutes', (minutes) => {
    expect(SETTINGS.refreshMinutes.experimental_schema.safeParse(minutes).success).toBe(true)
  })

  it('defaults to my open tickets', () => {
    expect(SETTINGS.jql.default).toBe('assignee = currentUser() AND statusCategory != Done')
    expect(DEFAULT_JQL).toBe(SETTINGS.jql.default)
  })

  it('rejects an empty query', () => {
    expect(SETTINGS.jql.experimental_schema.safeParse('   ').success).toBe(false)
  })
})
