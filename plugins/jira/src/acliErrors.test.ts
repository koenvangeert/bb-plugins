import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AcliResult } from './acli'
import { classifyFailure } from './acliErrors'

const result = (overrides: Partial<AcliResult>): AcliResult => ({ stdout: '', stderr: '', exitCode: 1, ...overrides })

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('classifyFailure', () => {
  it('reads real acli logged-out output as logged out', () => {
    expect(classifyFailure(result({ stderr: fixture('auth-status-logged-out.txt') }), 'search')?.kind).toBe('loggedOut')
  })

  it('reads real acli output for an unknown key as not found', () => {
    expect(classifyFailure(result({ stderr: fixture('view-not-found.txt') }), 'view')?.kind).toBe('notFound')
  })

  it('passes a successful run', () => {
    expect(classifyFailure(result({ exitCode: 0, stdout: '[]' }), 'search')).toBeNull()
  })

  it('reports a missing acli binary with the install link', () => {
    const error = classifyFailure(result({ spawnError: 'ENOENT', exitCode: -1 }), 'search')

    expect(error?.kind).toBe('missing')
    expect(error?.message).toContain('developer.atlassian.com')
  })

  it('reports a logged-out acli with the login command', () => {
    const error = classifyFailure(
      result({ stderr: "✗ Error: unauthorized: use 'acli jira auth login' to authenticate" }),
      'search',
    )

    expect(error?.kind).toBe('loggedOut')
    expect(error?.message).toContain('acli jira auth login')
  })

  it('treats any failing auth status as logged out', () => {
    expect(classifyFailure(result({ stderr: '✗ Error: failed to retrieve authenticated status' }), 'auth')?.kind).toBe(
      'loggedOut',
    )
  })

  it('reports an unknown key on view as not found', () => {
    expect(classifyFailure(result({ stderr: 'Work item does not exist: NOPE-1' }), 'view')?.kind).toBe('notFound')
  })

  it('reports a timeout', () => {
    expect(classifyFailure(result({ timedOut: true, exitCode: -1 }), 'search')?.kind).toBe('timeout')
  })

  it('reports any other failure with the acli output', () => {
    const error = classifyFailure(result({ stderr: 'Error in the JQL query: unexpected token' }), 'search')

    expect(error?.kind).toBe('failed')
    expect(error?.message).toBe('Error in the JQL query: unexpected token')
  })
})
