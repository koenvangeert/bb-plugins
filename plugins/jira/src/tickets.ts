import { z } from 'zod'
import { adfToText } from './adf'
import { AcliError } from './acliErrors'

export interface Ticket {
  key: string
  summary: string
  status: string
  statusCategory: string
  issueType: string
  url: string
}

export interface TicketDetail extends Ticket {
  description: string
}

export const TICKET_LIMIT = 200

const TICKET_KEY = /^[A-Z][A-Z0-9]+-[0-9]+$/

export function isTicketKey(value: string): boolean {
  return TICKET_KEY.test(value)
}

export class InvalidKeyError extends Error {
  constructor(key: string) {
    super(`"${key}" is not a Jira key. Use the form ABC-123.`)
    this.name = 'InvalidKeyError'
  }
}

export function parseSiteUrl(authStatus: string): string | undefined {
  const site = authStatus.match(/^\s*Site:\s*(\S+)/m)?.[1]?.replace(/\/+$/, '')
  if (!site) return undefined
  return /^https?:\/\//.test(site) ? site : `https://${site}`
}

export function buildPrompt(ticket: TicketDetail): string {
  const lines = [`Work on Jira ticket ${ticket.key}: ${ticket.summary}`]
  if (ticket.url) lines.push(ticket.url)
  if (ticket.description) lines.push('', ticket.description)
  return lines.join('\n')
}

const issueSchema = z.object({
  key: z.string().regex(TICKET_KEY),
  fields: z.object({
    summary: z.string(),
    status: z.object({
      name: z.string(),
      statusCategory: z.object({ key: z.string() }).optional(),
    }),
    issuetype: z.object({ name: z.string() }).optional(),
    description: z.unknown().optional(),
  }),
})

type Issue = z.infer<typeof issueSchema>

const searchSchema = z.union([z.array(issueSchema), z.object({ issues: z.array(issueSchema) })])

export function parseSearch(stdout: string, siteUrl?: string): Ticket[] {
  const parsed = parseJson(stdout, searchSchema)
  return (Array.isArray(parsed) ? parsed : parsed.issues).map((issue) => toTicket(issue, siteUrl))
}

export function parseView(stdout: string, siteUrl?: string): TicketDetail {
  const issue = parseJson(stdout, issueSchema)
  return { ...toTicket(issue, siteUrl), description: adfToText(issue.fields.description ?? null) }
}

function toTicket(issue: Issue, siteUrl?: string): Ticket {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    statusCategory: issue.fields.status.statusCategory?.key ?? '',
    issueType: issue.fields.issuetype?.name ?? '',
    url: siteUrl ? `${siteUrl}/browse/${issue.key}` : '',
  }
}

function parseJson<T>(stdout: string, schema: z.ZodType<T>): T {
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    throw unexpected(stdout)
  }
  const result = schema.safeParse(json)
  if (!result.success) throw unexpected(stdout)
  return result.data
}

function unexpected(stdout: string) {
  return new AcliError('failed', `unexpected acli output: ${stdout.trim().slice(0, 200)}`)
}
