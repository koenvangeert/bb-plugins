import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AcliError } from './acliErrors'
import { isTicketKey, parseSearch, parseSiteUrl, parseView } from './tickets'
import searchFixture from './fixtures/search.json'
import viewFixture from './fixtures/view.json'

describe('parseSearch', () => {
  it('reads key, summary, status, and issue type from real acli output', () => {
    expect(parseSearch(JSON.stringify(searchFixture), 'https://example.atlassian.net')).toEqual([
      {
        key: 'ABC-12',
        summary: 'Fix login',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        issueType: 'User Story',
        url: 'https://example.atlassian.net/browse/ABC-12',
      },
      {
        key: 'ABC-40',
        summary: 'Add export',
        status: 'In Review',
        statusCategory: 'indeterminate',
        issueType: 'User Story',
        url: 'https://example.atlassian.net/browse/ABC-40',
      },
      {
        key: 'ABC-77',
        summary: 'Blank page instead of an error message',
        status: 'In Review',
        statusCategory: 'indeterminate',
        issueType: 'Bug',
        url: 'https://example.atlassian.net/browse/ABC-77',
      },
    ])
  })

  it('accepts a result wrapped in an issues object', () => {
    expect(parseSearch(JSON.stringify({ issues: searchFixture }))).toHaveLength(3)
  })

  it('builds the browse URL from the site, not from the internal self link', () => {
    expect(parseSearch(JSON.stringify(searchFixture), 'https://site.atlassian.net')[0]!.url).toBe(
      'https://site.atlassian.net/browse/ABC-12',
    )
  })

  it('leaves the browse URL empty when the site is unknown', () => {
    expect(parseSearch(JSON.stringify(searchFixture))[0]!.url).toBe('')
  })

  it('rejects output that is not the expected JSON', () => {
    expect(() => parseSearch('Signed in as someone')).toThrow(AcliError)
    expect(() => parseSearch('[{"id": 1}]')).toThrow(/unexpected acli output/)
  })
})

describe('parseView', () => {
  it('reads real acli view output with the description as plain text, keeping link URLs', () => {
    expect(parseView(JSON.stringify(viewFixture), 'https://example.atlassian.net')).toEqual({
      key: 'ABC-12',
      summary: 'Fix login',
      status: 'In Progress',
      statusCategory: 'indeterminate',
      issueType: 'User Story',
      url: 'https://example.atlassian.net/browse/ABC-12',
      description: 'Login fails after a password reset:\nhttps://www.figma.com/design/EXAMPLE/Login\nReuse the existing login form.',
    })
  })

  it('returns an empty description when the ticket has none', () => {
    const noDescription = { ...viewFixture, fields: { ...viewFixture.fields, description: null } }

    expect(parseView(JSON.stringify(noDescription)).description).toBe('')
  })
})

describe('isTicketKey', () => {
  it.each(['ABC-12', 'A1-7', 'DATA2-12345'])('accepts %s', (key) => expect(isTicketKey(key)).toBe(true))

  it.each(['abc-12', 'ABC', 'ABC-', '-12', 'A-12', 'ABC-12 x', '1AB-2'])('rejects %s', (key) =>
    expect(isTicketKey(key)).toBe(false),
  )
})

describe('parseSiteUrl', () => {
  it.each([
    ['Site: https://mysite.atlassian.net/', 'https://mysite.atlassian.net'],
    ['✓ Authenticated\n  Site: mysite.atlassian.net', 'https://mysite.atlassian.net'],
    ['  Site: jira.example.com', 'https://jira.example.com'],
    ['Update available: https://developer.atlassian.com/acli\n  Site: mysite.atlassian.net', 'https://mysite.atlassian.net'],
    ['no site here https://developer.atlassian.com', undefined],
  ])('reads %j', (text, expected) => expect(parseSiteUrl(text)).toBe(expected))

  it('reads the site from real acli auth status output', () => {
    expect(parseSiteUrl(readFileSync(new URL('./fixtures/auth-status.txt', import.meta.url), 'utf8'))).toBe(
      'https://example.atlassian.net',
    )
  })
})
