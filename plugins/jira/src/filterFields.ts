export interface FilterValue {
  label: string
  jql: string
}

export interface Filter {
  field: FieldId
  label: string
  operator: 'in' | 'not in'
  values: FilterValue[]
}

export const EMPTY_VALUE: FilterValue = { label: '(empty)', jql: 'EMPTY' }

export const FILTER_FIELDS = [
  { id: 'status', name: 'Status', jql: 'status', searchable: true },
  { id: 'issuetype', name: 'Type', jql: 'type', searchable: true },
  { id: 'priority', name: 'Priority', jql: 'priority', searchable: true },
  { id: 'assignee', name: 'Assignee', jql: 'assignee', searchable: true },
  { id: 'reporter', name: 'Reporter', jql: 'reporter', searchable: true },
  { id: 'creator', name: 'Creator', jql: 'creator', searchable: true },
  { id: 'labels', name: 'Labels', jql: 'labels', searchable: true },
  { id: 'fixVersions', name: 'Fix versions', jql: 'fixVersion', searchable: false },
  { id: 'versions', name: 'Affects versions', jql: 'affectedVersion', searchable: false },
  { id: 'components', name: 'Components', jql: 'component', searchable: false },
  { id: 'resolution', name: 'Resolution', jql: 'resolution', searchable: false },
  { id: 'project', name: 'Project', jql: 'project', searchable: false },
  { id: 'parent', name: 'Parent', jql: 'parent', searchable: false },
] as const

export type FilterField = (typeof FILTER_FIELDS)[number]
export type FieldId = FilterField['id']

export const FIELD_IDS = FILTER_FIELDS.map((field) => field.id) as [FieldId, ...FieldId[]]

type SearchableField = Extract<FilterField, { searchable: true }>
export type SearchableFieldId = SearchableField['id']
export type FieldValues = Partial<Record<SearchableFieldId, FilterValue[]>>

export const SEARCHABLE_FIELD_IDS = FILTER_FIELDS.filter((field): field is SearchableField => field.searchable).map(
  (field) => field.id,
) as [SearchableFieldId, ...SearchableFieldId[]]

export function filterField(id: FieldId): FilterField {
  return FILTER_FIELDS.find((field) => field.id === id)!
}
