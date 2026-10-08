import { z } from 'zod'
import { adfToText } from './adf'
import { AcliError } from './acliErrors'
import { EMPTY_VALUE, SEARCHABLE_FIELD_IDS, type FilterValue, type SearchableFieldId } from './filterFields'
import { quoteLiteral } from './filterJql'

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

export interface SearchIssue {
  ticket: Ticket
  values: Record<SearchableFieldId, FilterValue[]>
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

const named = z.object({ name: z.string() })
const user = z.object({ accountId: z.string(), displayName: z.string() })

const issueSchema = z.object({
  key: z.string().regex(TICKET_KEY),
  fields: z.object({
    summary: z.string(),
    status: z.object({
      name: z.string(),
      statusCategory: z.object({ key: z.string() }).optional(),
    }),
    issuetype: named.optional(),
    priority: named.nullish().catch(null),
    assignee: user.nullish().catch(null),
    reporter: user.nullish().catch(null),
    creator: user.nullish().catch(null),
    labels: z.array(z.string()).nullish().catch(null),
    description: z.unknown().optional(),
  }),
})

type Issue = z.infer<typeof issueSchema>

const searchSchema = z.union([z.array(issueSchema), z.object({ issues: z.array(issueSchema) })])

export function parseSearch(stdout: string, siteUrl?: string): SearchIssue[] {
  const parsed = parseJson(stdout, searchSchema)
  return (Array.isArray(parsed) ? parsed : parsed.issues).map((issue) => ({
    ticket: toTicket(issue, siteUrl),
    values: issueValues(issue),
  }))
}

export function fieldValues(issues: SearchIssue[]): Record<SearchableFieldId, FilterValue[]> {
  return Object.fromEntries(
    SEARCHABLE_FIELD_IDS.map((field) => {
      const byJql = new Map<string, FilterValue>()
      for (const issue of issues) for (const value of issue.values[field]) byJql.set(value.jql, value)
      const sorted = [...byJql.values()].sort((a, b) => a.label.localeCompare(b.label))
      return [field, [...sorted, EMPTY_VALUE]]
    }),
  ) as Record<SearchableFieldId, FilterValue[]>
}

function issueValues({ fields }: Issue): Record<SearchableFieldId, FilterValue[]> {
  const byName = (value: { name: string } | null | undefined) => (value ? [{ label: value.name, jql: quoteLiteral(value.name) }] : [])
  const byUser = (value: { accountId: string; displayName: string } | null | undefined) =>
    value ? [{ label: value.displayName, jql: quoteLiteral(value.accountId) }] : []
  return {
    status: byName(fields.status),
    issuetype: byName(fields.issuetype),
    priority: byName(fields.priority),
    assignee: byUser(fields.assignee),
    reporter: byUser(fields.reporter),
    creator: byUser(fields.creator),
    labels: (fields.labels ?? []).map((label) => ({ label, jql: quoteLiteral(label) })),
  }
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
