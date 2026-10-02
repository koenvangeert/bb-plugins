import { describe, expect, it } from 'vitest'
import { EMPTY_VALUE, FILTER_FIELDS, type FieldId, type Filter } from './filterFields'
import { effectiveJql, quoteLiteral } from './filterJql'

const value = (label: string) => ({ label, jql: quoteLiteral(label) })

const filter = (field: FieldId, operator: Filter['operator'], values: Filter['values']): Filter => ({
  field,
  label: field,
  operator,
  values,
})

describe('effectiveJql', () => {
  it('returns the base JQL unchanged without filters', () => {
    expect(effectiveJql('project = DEV ORDER BY rank', [])).toBe('project = DEV ORDER BY rank')
  })

  it('wraps the base JQL and appends one clause per filter with AND', () => {
    expect(
      effectiveJql('project = DEV OR project = OPS', [
        filter('status', 'in', [value('To Do')]),
        filter('fixVersions', 'in', [value('26.10')]),
      ]),
    ).toBe('(project = DEV OR project = OPS) AND status in ("To Do") AND fixVersion in ("26.10")')
  })

  it('keeps ORDER BY at the end', () => {
    expect(effectiveJql('project = DEV ORDER BY priority DESC', [filter('status', 'in', [value('To Do')])])).toBe(
      '(project = DEV) AND status in ("To Do") ORDER BY priority DESC',
    )
  })

  it('splits a lowercase order by', () => {
    expect(effectiveJql('project = DEV order by created', [filter('status', 'in', [value('To Do')])])).toBe(
      '(project = DEV) AND status in ("To Do") order by created',
    )
  })

  it('does not split an order by inside a quoted string', () => {
    expect(effectiveJql('summary ~ "sort order by date"', [filter('status', 'in', [value('To Do')])])).toBe(
      '(summary ~ "sort order by date") AND status in ("To Do")',
    )
  })

  it('does not split an order by inside a single-quoted string with an escaped quote', () => {
    expect(effectiveJql("summary ~ 'it\\'s order by'", [filter('status', 'in', [value('To Do')])])).toBe(
      "(summary ~ 'it\\'s order by') AND status in (\"To Do\")",
    )
  })

  it('uses only the filters when the base JQL is only an ORDER BY', () => {
    expect(effectiveJql('ORDER BY created', [filter('status', 'in', [value('To Do')])])).toBe(
      'status in ("To Do") ORDER BY created',
    )
  })
})

describe('filter clauses', () => {
  const clause = (operator: Filter['operator'], values: Filter['values']) =>
    effectiveJql('ORDER BY rank', [filter('assignee', operator, values)]).replace(/ ORDER BY rank$/, '')

  it.each([
    ['in', [value('a'), value('b')], 'assignee in ("a", "b")'],
    ['in', [value('a'), EMPTY_VALUE], '(assignee in ("a") OR assignee is EMPTY)'],
    ['in', [EMPTY_VALUE], 'assignee is EMPTY'],
    ['not in', [value('a')], '(assignee not in ("a") OR assignee is EMPTY)'],
    ['not in', [value('a'), EMPTY_VALUE], '(assignee not in ("a") AND assignee is not EMPTY)'],
    ['not in', [EMPTY_VALUE], 'assignee is not EMPTY'],
  ] as const)('%s %j gives %s', (operator, values, expected) => {
    expect(clause(operator, [...values])).toBe(expected)
  })

  it('uses the JQL name of each field', () => {
    expect(Object.fromEntries(FILTER_FIELDS.map((field) => [field.id, field.jql]))).toEqual({
      status: 'status',
      issuetype: 'type',
      priority: 'priority',
      assignee: 'assignee',
      reporter: 'reporter',
      creator: 'creator',
      labels: 'labels',
      fixVersions: 'fixVersion',
      versions: 'affectedVersion',
      components: 'component',
      resolution: 'resolution',
      project: 'project',
      parent: 'parent',
    })
  })
})

describe('quoteLiteral', () => {
  it('escapes quotes and backslashes', () => {
    expect(quoteLiteral('say "hi" \\ bye')).toBe('"say \\"hi\\" \\\\ bye"')
  })
})
