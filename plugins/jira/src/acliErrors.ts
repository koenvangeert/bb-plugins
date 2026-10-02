import type { AcliResult } from './acli'

export type AcliFailureKind = 'missing' | 'loggedOut' | 'notFound' | 'timeout' | 'failed'

export class AcliError extends Error {
  constructor(
    readonly kind: AcliFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'AcliError'
  }
}

export const LOGIN_HINT = 'Run `acli jira auth login` on the BB server host.'
export const INSTALL_HINT =
  'Install the Atlassian CLI (acli) on the BB server host: https://developer.atlassian.com/cloud/acli/guides/install-acli/'

const LOGGED_OUT = /unauthori[sz]ed|auth login|not logged in|not authenticated|no (active )?account/i
const NOT_FOUND = /not found|does not exist|no work ?item|404/i

export function classifyFailure(result: AcliResult, command: 'search' | 'view' | 'auth'): AcliError | null {
  if (result.spawnError === 'ENOENT') return new AcliError('missing', `acli is not installed. ${INSTALL_HINT}`)
  if (result.spawnError) return new AcliError('failed', `acli could not start: ${result.spawnError}`)
  if (result.timedOut) return new AcliError('timeout', 'acli did not answer within 30 seconds.')
  if (result.exitCode === 0) return null
  const output = (result.stderr.trim() || result.stdout.trim()).slice(0, 500)
  if (command === 'auth' || LOGGED_OUT.test(output)) {
    return new AcliError('loggedOut', `acli is not logged in to Jira. ${LOGIN_HINT}`)
  }
  if (command === 'view' && NOT_FOUND.test(output)) return new AcliError('notFound', output || 'Ticket not found.')
  return new AcliError('failed', output || `acli exited with code ${result.exitCode}.`)
}
