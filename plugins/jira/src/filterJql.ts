import { EMPTY_VALUE, filterField, type Filter } from './filterFields'

export function quoteLiteral(text: string): string {
  return `"${text.replace(/[\\"]/g, (char) => `\\${char}`)}"`
}

const QUOTED_LITERAL = /^"(?:[^"\\]|\\.)*"$/

export function isQuotedLiteral(jql: string): boolean {
  return QUOTED_LITERAL.test(jql)
}

export function effectiveJql(base: string, filters: Filter[]): string {
  if (filters.length === 0) return base
  const { where, orderBy } = splitOrderBy(base)
  const clauses = filters.map(clause)
  const parts = where.trim() ? [`(${where.trim()})`, ...clauses] : clauses
  return [parts.join(' AND '), orderBy].filter(Boolean).join(' ')
}

function clause(filter: Filter): string {
  const field = filterField(filter.field).jql
  const literals = filter.values.filter((value) => value.jql !== EMPTY_VALUE.jql).map((value) => value.jql)
  const withEmpty = literals.length < filter.values.length
  const list = `(${literals.join(', ')})`
  if (filter.operator === 'in') {
    if (literals.length === 0) return `${field} is EMPTY`
    return withEmpty ? `(${field} in ${list} OR ${field} is EMPTY)` : `${field} in ${list}`
  }
  if (literals.length === 0) return `${field} is not EMPTY`
  return withEmpty ? `(${field} not in ${list} AND ${field} is not EMPTY)` : `(${field} not in ${list} OR ${field} is EMPTY)`
}

const ORDER_BY = /^order\s+by\b/i

function splitOrderBy(jql: string): { where: string; orderBy: string } {
  let quote: string | null = null
  for (let index = 0; index < jql.length; index++) {
    const char = jql[index]!
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if ((index === 0 || /[\s)]/.test(jql[index - 1]!)) && ORDER_BY.test(jql.slice(index))) {
      return { where: jql.slice(0, index), orderBy: jql.slice(index).trim() }
    }
  }
  return { where: jql, orderBy: '' }
}
