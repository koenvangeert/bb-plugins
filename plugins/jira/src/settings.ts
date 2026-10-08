import { z } from 'zod'

export const SETTINGS = {
  refreshMinutes: {
    type: 'number',
    label: 'Refresh interval (minutes)',
    description: 'How often to read the tickets of every tab from Jira, from 1 to 240 minutes.',
    default: 5,
    experimental_schema: z.number().int().min(1).max(240),
  },
} as const
