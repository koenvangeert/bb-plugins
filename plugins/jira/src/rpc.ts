import { defineRpcContract } from '@get-bb/plugin-sdk'
import { z } from 'zod'
import type { ThreadLinks } from './threadLinks'
import { buildPrompt, isTicketKey } from './tickets'
import type { TicketService } from './ticketService'

const ticket = z.object({
  key: z.string(),
  summary: z.string(),
  status: z.string(),
  statusCategory: z.string(),
  issueType: z.string(),
  url: z.string(),
})

const linkedThread = z.object({ threadId: z.string(), title: z.string(), archived: z.boolean() })

const ticketList = z.object({
  tickets: z.array(ticket.extend({ threads: z.array(linkedThread) })),
  refreshedAt: z.number().nullable(),
  error: z.string().nullable(),
  health: z.enum(['ok', 'missing', 'loggedOut']),
  limitReached: z.boolean(),
  refreshing: z.boolean(),
})

const threadLink = z.object({ issueKey: z.string().nullable(), ticket: ticket.nullable(), error: z.string().nullable() })

const threadInput = z.object({ threadId: z.string().min(1) }).strict()

const ticketKey = z.string().trim().toUpperCase().refine(isTicketKey, 'Not a Jira key. Use the form ABC-123.')

export type TicketList = z.infer<typeof ticketList>
export type ThreadLinkResult = z.infer<typeof threadLink>

export const rpcContract = defineRpcContract({
  tickets: { input: z.null(), output: ticketList },
  refresh: { input: z.null(), output: ticketList },
  ticket: {
    input: z.object({ key: ticketKey }).strict(),
    output: ticket.extend({ prompt: z.string() }),
  },
  threadLink: { input: threadInput, output: threadLink },
  link: { input: z.object({ threadId: z.string().min(1), key: ticketKey }).strict(), output: threadLink },
  unlink: { input: threadInput, output: z.object({ ok: z.literal(true) }) },
  projects: { input: z.null(), output: z.array(z.object({ id: z.string(), name: z.string() })) },
  startThread: {
    input: z.object({ projectId: z.string().min(1), key: ticketKey, prompt: z.string().trim().min(1) }).strict(),
    output: z.object({ threadId: z.string() }),
  },
})

export function createRpcHandlers(deps: {
  tickets: TicketService
  links: ThreadLinks
  listProjects(): Promise<{ id: string; name: string }[]>
}) {
  const { tickets, links, listProjects } = deps

  const withThreads = async (snapshot: ReturnType<TicketService['snapshot']>): Promise<TicketList> => {
    const byKey = await links.linkedThreads(new Set(snapshot.tickets.map((entry) => entry.key)))
    return { ...snapshot, tickets: snapshot.tickets.map((entry) => ({ ...entry, threads: byKey[entry.key] ?? [] })) }
  }

  return {
    tickets: () => withThreads(tickets.snapshot()),
    refresh: async () => withThreads(await tickets.refresh()),
    ticket: async ({ key }: { key: string }) => {
      const { description, ...detail } = await tickets.ticket(key)
      return { ...detail, prompt: buildPrompt({ ...detail, description }) }
    },
    threadLink: ({ threadId }: { threadId: string }) => links.threadLink(threadId),
    link: ({ threadId, key }: { threadId: string; key: string }) => links.link(threadId, key),
    unlink: async ({ threadId }: { threadId: string }) => {
      await links.unlink(threadId)
      return { ok: true as const }
    },
    projects: async () => (await listProjects()).map(({ id, name }) => ({ id, name })),
    startThread: ({ projectId, key, prompt }: { projectId: string; key: string; prompt: string }) =>
      links.startThread(projectId, key, prompt),
  }
}
