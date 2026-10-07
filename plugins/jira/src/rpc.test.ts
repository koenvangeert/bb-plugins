import { describe, expect, it } from 'vitest'
import { fakeAcli } from './fakeAcli'
import searchFixture from './fixtures/search.json'
import viewFixture from './fixtures/view.json'
import { createRpcHandlers, rpcContract } from './rpc'
import { migratedDatabase } from './testDatabase'
import { createThreadLinks, type ThreadLinkSdk } from './threadLinks'
import { createTicketService } from './ticketService'

function handlers() {
  const db = migratedDatabase()
  const acli = fakeAcli({ search: { stdout: JSON.stringify(searchFixture) }, view: { stdout: JSON.stringify(viewFixture) } })
  const tickets = createTicketService({ db, acli: acli.runner, readJql: async () => 'jql', now: () => 7 })
  const metadata: Record<string, Record<string, unknown>> = { thr_1: {} }
  const sdk: ThreadLinkSdk = {
    projects: { defaultExecutionOptions: async () => null },
    threads: {
      get: async ({ threadId }) => ({ id: threadId, title: 'Fix it', titleFallback: null, archivedAt: null, deletedAt: null }),
      getPluginMetadata: async ({ threadId }) => ({ ...metadata[threadId] }),
      updatePluginMetadata: async ({ threadId, set = {}, remove = [] }) => {
        const next = { ...metadata[threadId], ...set }
        for (const key of remove) delete next[key]
        return (metadata[threadId] = next)
      },
      spawn: async ({ pluginMetadata }) => {
        metadata.thr_new = { ...pluginMetadata }
        return { id: 'thr_new' }
      },
    },
  }
  const projects = [{ id: 'P-1', name: 'catalog', sources: [] }]
  return createRpcHandlers({
    tickets,
    links: createThreadLinks({ db, sdk, tickets }),
    listProjects: async () => projects,
  })
}

describe('rpc handlers', () => {
  it('return an empty list before, and the tickets after, a refresh', async () => {
    const rpc = handlers()

    expect(rpcContract.tickets.output.parse(await rpc.tickets())).toMatchObject({ tickets: [], refreshedAt: null })
    const refreshed = rpcContract.refresh.output.parse(await rpc.refresh())
    expect(refreshed.tickets.map((entry) => entry.key)).toEqual(['ABC-12', 'ABC-40', 'ABC-77'])
    expect(refreshed.refreshedAt).toBe(7)
  })

  it('return one ticket with a prompt prefill', async () => {
    const detail = rpcContract.ticket.output.parse(await handlers().ticket({ key: 'ABC-12' }))

    expect(detail.prompt).toContain('Work on Jira ticket ABC-12: Fix login')
    expect(detail.prompt).toContain('password reset')
  })

  it('link, show, and unlink a thread, with the link on the ticket row', async () => {
    const rpc = handlers()
    await rpc.refresh()

    expect(rpcContract.link.output.parse(await rpc.link({ threadId: 'thr_1', key: 'ABC-12' }))).toMatchObject({ issueKey: 'ABC-12' })
    expect(rpcContract.threadLink.output.parse(await rpc.threadLink({ threadId: 'thr_1' }))).toMatchObject({ issueKey: 'ABC-12' })
    const list = rpcContract.tickets.output.parse(await rpc.tickets())
    expect(list.tickets[0]!.threads).toEqual([{ threadId: 'thr_1', title: 'Fix it', archived: false }])

    expect(rpcContract.unlink.output.parse(await rpc.unlink({ threadId: 'thr_1' }))).toEqual({ ok: true })
    expect((await rpc.threadLink({ threadId: 'thr_1' })).issueKey).toBeNull()
  })

  it('list projects by id and name only', async () => {
    expect(rpcContract.projects.output.parse(await handlers().projects())).toEqual([{ id: 'P-1', name: 'catalog' }])
  })

  it('start a linked thread', async () => {
    const rpc = handlers()
    await rpc.refresh()

    const started = rpcContract.startThread.output.parse(await rpc.startThread({ projectId: 'P-1', key: 'ABC-40', prompt: 'Go' }))

    expect(started).toEqual({ threadId: 'thr_new' })
    expect((await rpc.threadLink({ threadId: 'thr_new' })).issueKey).toBe('ABC-40')
  })

  it('reject an empty prompt', () => {
    expect(rpcContract.startThread.input.safeParse({ projectId: 'P-1', key: 'ABC-40', prompt: '  ' }).success).toBe(false)
  })
})
