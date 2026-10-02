type AdfNode = { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; content?: unknown }

export function adfToText(value: unknown): string {
  if (typeof value === 'string') return value
  return normalize(renderNode(value))
}

function renderNode(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const node = value as AdfNode
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? node.text : ''
    case 'hardBreak':
      return '\n'
    case 'inlineCard':
      return cardUrl(node)
    case 'blockCard':
      return cardUrl(node) && `${cardUrl(node)}\n\n`
    case 'doc':
      return renderChildren(node)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))
      return `${'#'.repeat(level)} ${renderChildren(node)}\n\n`
    }
    case 'bulletList':
    case 'orderedList':
      return `${renderChildren(node)}\n`
    case 'listItem': {
      const inner = normalize(renderChildren(node))
      return inner ? `- ${inner.replaceAll('\n', '\n  ')}\n` : ''
    }
    default:
      if ('content' in node) return `${renderChildren(node)}\n\n`
      return typeof node.attrs?.text === 'string' ? node.attrs.text : ''
  }
}

function cardUrl(node: AdfNode): string {
  return typeof node.attrs?.url === 'string' ? node.attrs.url : ''
}

function renderChildren(node: AdfNode): string {
  return Array.isArray(node.content) ? node.content.map(renderNode).join('') : ''
}

function normalize(raw: string): string {
  const lines: string[] = []
  let blankRun = 0
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trimEnd()
    blankRun = line ? 0 : blankRun + 1
    if (blankRun <= 1) lines.push(line)
  }
  return lines.join('\n').trim()
}
