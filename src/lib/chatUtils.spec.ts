import { describe, expect, it } from 'vitest'
import type { ToolResult } from '../hooks/useToolExecutor'
import {
  getTextFromParts,
  hasToolCalls,
  parseToolCalls,
  removeToolCallsFromContent,
  sanitizeToolResultForLLM,
} from './chatUtils'

describe(parseToolCalls.name, () => {
  it.each([
    [
      'single tool call',
      '<tool_call>\n{"name": "analyze_data", "arguments": {"question": "What is the average?"}}\n</tool_call>',
      [{ name: 'analyze_data', arguments: { question: 'What is the average?' } }],
    ],
    [
      'arguments before name',
      '<tool_call>\n{"arguments": {"dataframe_names": ["sales"]}, "name": "analyze_data"}\n</tool_call>',
      [{ name: 'analyze_data', arguments: { dataframe_names: ['sales'] } }],
    ],
    [
      'multiple tool calls',
      '<tool_call>\n{"name": "tool1", "arguments": {"a": 1}}\n</tool_call>\nSome text\n<tool_call>\n{"name": "tool2", "arguments": {"b": 2}}\n</tool_call>',
      [
        { name: 'tool1', arguments: { a: 1 } },
        { name: 'tool2', arguments: { b: 2 } },
      ],
    ],
    [
      'tool call with whitespace',
      '  <tool_call>  \n  {"name": "test", "arguments": {}}  \n  </tool_call>  ',
      [{ name: 'test', arguments: {} }],
    ],
  ])('should parse %s', (_description, content, expected) => {
    expect(parseToolCalls(content)).toEqual(expected)
  })

  it.each([
    ['empty string', ''],
    ['no tool calls', 'Hello, how can I help you?'],
    ['incomplete opening tag', '<tool_call{"name": "test"}'],
    ['incomplete closing tag', '<tool_call>{"name": "test"}'],
    ['malformed JSON', '<tool_call>\n{invalid json}\n</tool_call>'],
    ['missing name field', '<tool_call>\n{"arguments": {}}\n</tool_call>'],
    ['missing arguments field', '<tool_call>\n{"name": "test"}\n</tool_call>'],
  ])('should return empty array for %s', (_description, content) => {
    expect(parseToolCalls(content)).toEqual([])
  })
})

describe(hasToolCalls.name, () => {
  it.each([
    ['complete tags', '<tool_call>content</tool_call>', true],
    ['tags with content between', 'Hello <tool_call>test</tool_call> world', true],
    ['empty content', '', false],
    ['no tags', 'Hello world', false],
    ['only opening tag', '<tool_call>content', false],
    ['only closing tag', 'content</tool_call>', false],
    ['opening without closing', '<tool_call>some content here', false],
  ])('should return correct result for %s', (_description, content, expected) => {
    expect(hasToolCalls(content)).toBe(expected)
  })
})

describe(removeToolCallsFromContent.name, () => {
  it.each([
    ['single tool call', '<tool_call>{"name": "test"}</tool_call>', ''],
    [
      'tool call with surrounding text',
      'Hello <tool_call>{"name": "test"}</tool_call> world',
      'Hello  world',
    ],
    [
      'multiple tool calls',
      '<tool_call>a</tool_call> text <tool_call>b</tool_call>',
      'text',
    ],
    [
      'multiline tool call',
      'Start\n<tool_call>\n{"name": "test",\n"arguments": {}}\n</tool_call>\nEnd',
      'Start\n\nEnd',
    ],
    ['no tool calls', 'Hello world', 'Hello world'],
    ['empty string', '', ''],
  ])('should handle %s', (_description, content, expected) => {
    expect(removeToolCallsFromContent(content)).toBe(expected)
  })
})

describe(sanitizeToolResultForLLM.name, () => {
  it('should remove chartPath from result', () => {
    const result: ToolResult = {
      success: true,
      result: 'Analysis complete',
      chartPath: 'data:image/png;base64,abc123',
    }

    const sanitized = sanitizeToolResultForLLM(result)

    expect(sanitized).not.toHaveProperty('chartPath')
    expect(sanitized.success).toBe(true)
  })

  it('should add image message when chartPath was present', () => {
    const result: ToolResult = {
      success: true,
      result: 'Here is your chart',
      chartPath: 'data:image/png;base64,abc123',
    }

    const sanitized = sanitizeToolResultForLLM(result)

    expect(sanitized.result).toContain('Here is your chart')
    expect(sanitized.result).toContain(
      '[An image/chart with the result has been displayed to the user.]'
    )
  })

  it('should not modify result when no chartPath', () => {
    const result: ToolResult = {
      success: true,
      result: 'The average is 42',
    }

    const sanitized = sanitizeToolResultForLLM(result)

    expect(sanitized.result).toBe('The average is 42')
    expect(sanitized.success).toBe(true)
  })

  it('should preserve success: false', () => {
    const result: ToolResult = {
      success: false,
      result: 'Error: Something went wrong',
    }

    const sanitized = sanitizeToolResultForLLM(result)

    expect(sanitized.success).toBe(false)
    expect(sanitized.result).toBe('Error: Something went wrong')
  })
})

describe(getTextFromParts.name, () => {
  it('should extract text from text parts', () => {
    const parts = [
      { type: 'text' as const, text: 'Hello' },
      { type: 'text' as const, text: 'World' },
    ]

    expect(getTextFromParts(parts)).toBe('Hello\nWorld')
  })

  it('should ignore non-text parts', () => {
    const parts = [
      { type: 'text' as const, text: 'Hello' },
      { type: 'data-file' as const, data: { url: 'test.png' } },
      { type: 'text' as const, text: 'World' },
    ]

    expect(getTextFromParts(parts as Parameters<typeof getTextFromParts>[0])).toBe('Hello\nWorld')
  })

  it('should return empty string for empty array', () => {
    expect(getTextFromParts([])).toBe('')
  })

  it('should return empty string for no text parts', () => {
    const parts = [
      { type: 'data-file' as const, data: { url: 'image.png' } },
    ]

    expect(getTextFromParts(parts as Parameters<typeof getTextFromParts>[0])).toBe('')
  })

  it('should handle single text part', () => {
    const parts = [{ type: 'text' as const, text: 'Single' }]

    expect(getTextFromParts(parts)).toBe('Single')
  })
})

