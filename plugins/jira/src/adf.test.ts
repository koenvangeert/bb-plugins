import { describe, expect, it } from 'vitest'
import { adfToText } from './adf'

const doc = (content: unknown[]) => ({ type: 'doc', version: 1, content })
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

describe('adfToText', () => {
  it('flattens a single paragraph', () => {
    expect(adfToText(doc([paragraph('Hello world')]))).toBe('Hello world')
  })

  it('separates paragraphs with a blank line', () => {
    expect(adfToText(doc([paragraph('First.'), paragraph('Second.')]))).toBe('First.\n\nSecond.')
  })

  it('renders bullet list items with a dash', () => {
    const value = doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph('One')] },
          { type: 'listItem', content: [paragraph('Two')] },
        ],
      },
    ])
    expect(adfToText(value)).toBe('- One\n- Two')
  })

  it('renders headings as markdown', () => {
    const value = doc([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Acceptance Criteria' }] },
      paragraph('The user can log in.'),
    ])
    expect(adfToText(value)).toBe('## Acceptance Criteria\n\nThe user can log in.')
  })

  it('turns hard breaks into newlines within a paragraph', () => {
    const value = doc([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Line one' }, { type: 'hardBreak' }, { type: 'text', text: 'Line two' }],
      },
    ])
    expect(adfToText(value)).toBe('Line one\nLine two')
  })

  it('keeps every item of a nested list, indented', () => {
    const value = doc([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph('Outer'),
              { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Inner')] }] },
            ],
          },
        ],
      },
    ])
    expect(adfToText(value)).toBe('- Outer\n\n  - Inner')
  })

  it('returns a plain string unchanged', () => {
    expect(adfToText('legacy plain description')).toBe('legacy plain description')
  })

  it('returns empty text for null and unknown shapes', () => {
    expect(adfToText(null)).toBe('')
    expect(adfToText({ type: 'doc' })).toBe('')
    expect(adfToText(42)).toBe('')
  })

  it('keeps the text of unknown block nodes', () => {
    const value = doc([{ type: 'panel', attrs: { panelType: 'info' }, content: [paragraph('Important detail')] }])
    expect(adfToText(value)).toBe('Important detail')
  })

  it('uses the label of inline nodes such as mentions', () => {
    const value = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'Ask ' }, { type: 'mention', attrs: { text: '@Ana' } }] },
    ])
    expect(adfToText(value)).toBe('Ask @Ana')
  })
  it('renders link cards as their URL', () => {
    const value = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'inlineCard', attrs: { url: 'https://x.test/a' } }] },
      { type: 'blockCard', attrs: { url: 'https://x.test/b' } },
    ])
    expect(adfToText(value)).toBe('See https://x.test/a\n\nhttps://x.test/b')
  })
})
