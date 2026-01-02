import { describe, it, expect } from 'vitest'
import {
  escapePythonString,
  escapeCsvForPython,
  escapeNamesForPython,
} from './pythonUtils'

describe(escapePythonString.name, () => {
  const testCases: Array<{ input: string; expected: string; description: string }> = [
    { input: 'hello', expected: 'hello', description: 'simple string unchanged' },
    { input: '', expected: '', description: 'empty string' },
    { input: 'hello world', expected: 'hello world', description: 'string with spaces' },
    { input: 'hello"world', expected: 'hello\\"world', description: 'single double quote' },
    { input: '"quoted"', expected: '\\"quoted\\"', description: 'double quotes at boundaries' },
    { input: 'path\\to\\file', expected: 'path\\\\to\\\\file', description: 'backslashes' },
    { input: 'mixed\\and"quotes', expected: 'mixed\\\\and\\"quotes', description: 'backslash and quote' },
    { input: 'line1\nline2', expected: 'line1\nline2', description: 'newline preserved' },
    { input: 'tab\there', expected: 'tab\there', description: 'tab preserved' },
    { input: 'unicode: 日本語', expected: 'unicode: 日本語', description: 'unicode characters' },
    { input: "single'quote", expected: "single'quote", description: 'single quote unchanged' },
    { input: '\\\\double\\\\', expected: '\\\\\\\\double\\\\\\\\', description: 'double backslashes' },
    { input: '""', expected: '\\"\\"', description: 'consecutive double quotes' },
  ]

  it.each(testCases)('should handle $description', ({ input, expected }) => {
    expect(escapePythonString(input)).toBe(expected)
  })
})

describe(escapeCsvForPython.name, () => {
  const testCases: Array<{ input: string; expected: string; description: string }> = [
    { input: 'a,b,c', expected: 'a,b,c', description: 'simple CSV unchanged' },
    { input: '', expected: '', description: 'empty string' },
    { input: 'value with spaces', expected: 'value with spaces', description: 'spaces preserved' },
    { input: 'has"""triple', expected: 'has\\"\\"\\"triple', description: 'triple quotes escaped' },
    { input: '"""start', expected: '\\"\\"\\"start', description: 'triple quotes at start' },
    { input: 'end"""', expected: 'end\\"\\"\\"', description: 'triple quotes at end' },
    { input: 'path\\to\\file', expected: 'path\\\\to\\\\file', description: 'backslashes escaped' },
    { input: '\\"""\\', expected: '\\\\\\"\\"\\"\\\\', description: 'mixed backslash and triple quotes' },
    { input: 'a"b"c', expected: 'a"b"c', description: 'single/double quotes unchanged' },
    { input: '""not triple""', expected: '""not triple""', description: 'double quotes unchanged' },
    { input: 'line1\nline2', expected: 'line1\nline2', description: 'newlines preserved' },
    { input: '"","",""', expected: '"","",""', description: 'CSV with quoted empty fields' },
  ]

  it.each(testCases)('should handle $description', ({ input, expected }) => {
    expect(escapeCsvForPython(input)).toBe(expected)
  })
})

describe(escapeNamesForPython.name, () => {
  it('should return empty array for empty input', () => {
    expect(escapeNamesForPython([])).toEqual([])
  })

  it('should escape single name', () => {
    expect(escapeNamesForPython(['my"df'])).toEqual(['my\\"df'])
  })

  it('should escape multiple names', () => {
    const input = ['df1', 'my "dataframe"', 'path\\name']
    const expected = ['df1', 'my \\"dataframe\\"', 'path\\\\name']
    expect(escapeNamesForPython(input)).toEqual(expected)
  })

  it('should preserve order', () => {
    const input = ['c', 'b', 'a']
    const result = escapeNamesForPython(input)
    expect(result).toEqual(['c', 'b', 'a'])
  })

  it('should handle names with mixed special characters', () => {
    const input = ['normal', 'with"quote', 'with\\slash', 'with\\"both']
    const expected = ['normal', 'with\\"quote', 'with\\\\slash', 'with\\\\\\"both']
    expect(escapeNamesForPython(input)).toEqual(expected)
  })
})

