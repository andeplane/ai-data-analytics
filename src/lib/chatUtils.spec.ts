import { describe, expect, it } from 'vitest'
import type { ToolResult } from '../hooks/useToolExecutor'
import {
  createToolCallPart,
  createImagePart,
  createLoadingPart,
  createTextPart,
  generateId,
  getTextFromParts,
  hasToolCalls,
  isSystemReady,
  parseToolCalls,
  removeToolCallsFromContent,
  sanitizeToolResultForLLM,
  type SystemLoadingState,
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

describe(generateId.name, () => {
  it('should return a string', () => {
    expect(typeof generateId()).toBe('string')
  })

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('should include timestamp component', () => {
    const before = Date.now()
    const id = generateId()
    const after = Date.now()

    // ID format: timestamp-randomstring
    const timestampPart = parseInt(id.split('-')[0], 10)
    expect(timestampPart).toBeGreaterThanOrEqual(before)
    expect(timestampPart).toBeLessThanOrEqual(after)
  })

  it('should have random suffix', () => {
    const id = generateId()
    const parts = id.split('-')

    // Should have timestamp and random parts
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts[1].length).toBeGreaterThan(0)
  })
})

describe(createTextPart.name, () => {
  it('should create text part with correct type', () => {
    const part = createTextPart('Hello')

    expect(part.type).toBe('text')
    expect(part).toHaveProperty('text', 'Hello')
  })

  it('should handle empty string', () => {
    const part = createTextPart('')

    expect(part.type).toBe('text')
    expect(part).toHaveProperty('text', '')
  })

  it('should preserve multiline text', () => {
    const text = 'Line 1\nLine 2\nLine 3'
    const part = createTextPart(text)

    expect(part).toHaveProperty('text', text)
  })
})

describe(createImagePart.name, () => {
  it('should create data-file part with correct structure', () => {
    const imageUrl = 'data:image/png;base64,abc123'
    const part = createImagePart(imageUrl)

    expect(part.type).toBe('data-file')
    expect(part).toHaveProperty('data')
  })

  it('should set url in data property', () => {
    const imageUrl = 'data:image/png;base64,xyz'
    const part = createImagePart(imageUrl) as { type: string; data: { url: string } }

    expect(part.data.url).toBe(imageUrl)
  })

  it('should set default filename', () => {
    const part = createImagePart('url') as { type: string; data: { filename: string } }

    expect(part.data.filename).toBe('chart.png')
  })

  it('should set mediaType to image/png', () => {
    const part = createImagePart('url') as { type: string; data: { mediaType: string } }

    expect(part.data.mediaType).toBe('image/png')
  })
})

describe(createLoadingPart.name, () => {
  const mockLoadingState: SystemLoadingState = {
    webllmStatus: 'loading',
    webllmProgress: 50,
    webllmProgressText: 'Loading model...',
    elapsedTime: 5000,
    estimatedTimeRemaining: 10000,
    pyodideStatus: 'ready',
    pandasStatus: 'loading',
    hasQueuedFiles: false,
  }

  it('should create loading part with correct type', () => {
    const part = createLoadingPart(mockLoadingState)

    expect(part.type).toBe('loading')
  })

  it('should include loadingState', () => {
    const part = createLoadingPart(mockLoadingState) as { type: string; loadingState: SystemLoadingState }

    expect(part.loadingState).toBe(mockLoadingState)
  })

  it('should preserve all loading state properties', () => {
    const part = createLoadingPart(mockLoadingState) as { type: string; loadingState: SystemLoadingState }

    expect(part.loadingState.webllmProgress).toBe(50)
    expect(part.loadingState.webllmProgressText).toBe('Loading model...')
    expect(part.loadingState.pyodideStatus).toBe('ready')
  })
})

describe(createToolCallPart.name, () => {
  it('should create tool-call part with correct type', () => {
    const part = createToolCallPart('Analyze data', 'How many customers?')

    expect(part.type).toBe('tool-call')
    expect(part).toHaveProperty('data')
  })

  it('should set toolName and input in data property', () => {
    const part = createToolCallPart('Analyze data', 'What is the average?') as {
      type: string
      data: { toolName: string; input: string }
    }

    expect(part.data.toolName).toBe('Analyze data')
    expect(part.data.input).toBe('What is the average?')
  })

  it('should include code when provided', () => {
    const code = 'import pandas as pd\ndf = pd.read_csv("data.csv")'
    const part = createToolCallPart('Analyze data', 'Question', code) as {
      type: string
      data: { code: string }
    }

    expect(part.data.code).toBe(code)
  })

  it('should set language to python by default', () => {
    const part = createToolCallPart('Tool', 'Input') as {
      type: string
      data: { language: string }
    }

    expect(part.data.language).toBe('python')
  })

  it('should allow custom language', () => {
    const part = createToolCallPart('Tool', 'Input', 'SELECT * FROM users', 'sql') as {
      type: string
      data: { language: string }
    }

    expect(part.data.language).toBe('sql')
  })

  it('should handle empty input', () => {
    const part = createToolCallPart('Tool', '')

    expect(part.type).toBe('tool-call')
    const dataPart = part as { type: string; data: { input: string } }
    expect(dataPart.data.input).toBe('')
  })

  it('should preserve multiline code', () => {
    const code = 'def fib(n):\n    if n <= 1:\n        return n\n    return fib(n-1) + fib(n-2)'
    const part = createToolCallPart('Tool', 'Input', code) as {
      type: string
      data: { code: string }
    }

    expect(part.data.code).toBe(code)
  })

  it('should include result when provided', () => {
    const result = 'The average is 42.5'
    const part = createToolCallPart('Analyze data', 'Question', undefined, 'python', result) as {
      type: string
      data: { result: string }
    }

    expect(part.data.result).toBe(result)
  })

  it('should handle all parameters together', () => {
    const code = 'print("Hello")'
    const result = 'Hello'
    const part = createToolCallPart('Tool', 'Input', code, 'python', result) as {
      type: string
      data: { code: string; result: string; language: string }
    }

    expect(part.data.code).toBe(code)
    expect(part.data.result).toBe(result)
    expect(part.data.language).toBe('python')
  })

  it('should include chartPath when provided', () => {
    const chartPath = 'exports/charts/temp_chart.png'
    const part = createToolCallPart('Analyze data', 'Question', undefined, 'python', undefined, chartPath) as {
      type: string
      data: { chartPath: string }
    }

    expect(part.data.chartPath).toBe(chartPath)
  })

  it('should handle chartPath with all other parameters', () => {
    const code = 'plt.plot([1, 2, 3])'
    const result = 'Chart generated'
    const chartPath = 'exports/charts/temp_chart.png'
    const part = createToolCallPart('Analyze data', 'Question', code, 'python', result, chartPath) as {
      type: string
      data: { code: string; result: string; chartPath: string }
    }

    expect(part.data.code).toBe(code)
    expect(part.data.result).toBe(result)
    expect(part.data.chartPath).toBe(chartPath)
  })
})

describe(isSystemReady.name, () => {
  const createLoadingState = (
    overrides: Partial<SystemLoadingState> = {}
  ): SystemLoadingState => ({
    webllmStatus: 'ready',
    webllmProgress: 100,
    webllmProgressText: 'Ready',
    elapsedTime: 0,
    estimatedTimeRemaining: null,
    pyodideStatus: 'ready',
    pandasStatus: 'ready',
    hasQueuedFiles: false,
    ...overrides,
  })

  it('should return true when all systems ready and no queued files', () => {
    expect(isSystemReady(createLoadingState())).toBe(true)
  })

  it.each([
    ['webllm loading', { webllmStatus: 'loading' as const }],
    ['webllm idle', { webllmStatus: 'idle' as const }],
    ['webllm error', { webllmStatus: 'error' as const }],
    ['pandas loading', { pandasStatus: 'loading' as const }],
    ['pandas idle', { pandasStatus: 'idle' as const }],
    ['pandas error', { pandasStatus: 'error' as const }],
    ['queued files', { hasQueuedFiles: true }],
  ])('should return false when %s', (_description, overrides) => {
    expect(isSystemReady(createLoadingState(overrides))).toBe(false)
  })

  it('should return false when multiple conditions not met', () => {
    const state = createLoadingState({
      webllmStatus: 'loading',
      pandasStatus: 'idle',
      hasQueuedFiles: true,
    })

    expect(isSystemReady(state)).toBe(false)
  })

  it('should ignore pyodide status (pyodide ready is implied by pandas ready)', () => {
    // Pyodide status doesn't directly affect isSystemReady
    // because if pandas is ready, pyodide must be ready
    const state = createLoadingState({
      pyodideStatus: 'loading',
    })

    expect(isSystemReady(state)).toBe(true)
  })
})

