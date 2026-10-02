import { z } from 'zod'

export const DEFAULT_JQL = 'assignee = currentUser() AND statusCategory != Done'

export const SETTINGS = {
  jql: {
    type: 'string',
    label: 'Ticket query (JQL)',
    description: 'Which Jira tickets the Jira page shows.',
    default: DEFAULT_JQL,
    experimental_schema: z.string().trim().min(1),
  },
  refreshMinutes: {
    type: 'number',
    label: 'Refresh interval (minutes)',
    description: 'How often to read the tickets from Jira, from 1 to 240 minutes.',
    default: 5,
    experimental_schema: z.number().int().min(1).max(240),
  },
} as const
