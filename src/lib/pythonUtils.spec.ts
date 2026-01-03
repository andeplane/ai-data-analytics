import { describe, it, expect } from 'vitest'
import {
  escapePythonString,
  escapeCsvForPython,
  escapeNamesForPython,
  sanitizeColumnName,
  sanitizeCsvColumns,
  parseCSVRow,
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

describe(sanitizeColumnName.name, () => {
  const testCases: Array<{ input: string; index: number; expected: string; description: string }> = [
    { input: 'Name', index: 0, expected: 'Name', description: 'simple name unchanged' },
    { input: 'First Name', index: 0, expected: 'First_Name', description: 'space to underscore' },
    { input: 'first-name', index: 0, expected: 'first_name', description: 'hyphen to underscore' },
    { input: 'price.usd', index: 0, expected: 'price_usd', description: 'dot to underscore' },
    { input: 'Price ($)', index: 0, expected: 'Price', description: 'parentheses removed' },
    { input: 'Items [count]', index: 0, expected: 'Items_count', description: 'brackets removed' },
    { input: 'email@work', index: 0, expected: 'emailwork', description: 'at symbol removed' },
    { input: 'tax#', index: 0, expected: 'tax', description: 'hash removed' },
    { input: 'percent%', index: 0, expected: 'percent', description: 'percent removed' },
    { input: 'this & that', index: 0, expected: 'this_that', description: 'ampersand removed' },
    { input: 'rate*', index: 0, expected: 'rate', description: 'asterisk removed' },
    { input: 'path/to', index: 0, expected: 'pathto', description: 'slash removed' },
    { input: 'back\\slash', index: 0, expected: 'backslash', description: 'backslash removed' },
    { input: 'question?', index: 0, expected: 'question', description: 'question mark removed' },
    { input: 'bang!', index: 0, expected: 'bang', description: 'exclamation removed' },
    { input: '  trimmed  ', index: 0, expected: 'trimmed', description: 'whitespace trimmed' },
    { input: 'multiple   spaces', index: 0, expected: 'multiple_spaces', description: 'multiple spaces collapsed' },
    { input: 'under__score', index: 0, expected: 'under_score', description: 'multiple underscores collapsed' },
    { input: '_leading', index: 0, expected: 'leading', description: 'leading underscore removed' },
    { input: 'trailing_', index: 0, expected: 'trailing', description: 'trailing underscore removed' },
    { input: '!!!', index: 2, expected: 'column_2', description: 'all special chars becomes column_index' },
    { input: '', index: 5, expected: 'column_5', description: 'empty becomes column_index' },
    { input: '   ', index: 3, expected: 'column_3', description: 'whitespace only becomes column_index' },
    { input: 'Sales - Q1 (2024)', index: 0, expected: 'Sales_Q1_2024', description: 'complex mixed case' },
    { input: 'unicode: 日本語', index: 0, expected: 'unicode_日本語', description: 'unicode preserved' },
  ]

  it.each(testCases)('should handle $description', ({ input, index, expected }) => {
    expect(sanitizeColumnName(input, index)).toBe(expected)
  })
})

describe(parseCSVRow.name, () => {
  const testCases: Array<{ input: string; expected: string[]; description: string }> = [
    { input: 'a,b,c', expected: ['a', 'b', 'c'], description: 'simple unquoted' },
    { input: '', expected: [''], description: 'empty string' },
    { input: 'single', expected: ['single'], description: 'single field' },
    { input: '"quoted"', expected: ['quoted'], description: 'quoted field' },
    { input: '"has,comma"', expected: ['has,comma'], description: 'comma inside quotes' },
    { input: '"has""quote"', expected: ['has"quote'], description: 'escaped quote' },
    { input: 'a,"b,c",d', expected: ['a', 'b,c', 'd'], description: 'mixed quoted and unquoted' },
    { input: '"","",""', expected: ['', '', ''], description: 'empty quoted fields' },
    { input: 'a,,c', expected: ['a', '', 'c'], description: 'empty unquoted field' },
    { input: '"a""b""c"', expected: ['a"b"c'], description: 'multiple escaped quotes' },
  ]

  it.each(testCases)('should handle $description', ({ input, expected }) => {
    expect(parseCSVRow(input)).toEqual(expected)
  })
})

describe(sanitizeCsvColumns.name, () => {
  it('should sanitize simple header', () => {
    const input = 'First Name,Last Name,Age\nJohn,Doe,30'
    const expected = 'First_Name,Last_Name,Age\nJohn,Doe,30'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })

  it('should handle special characters in header', () => {
    const input = 'Price ($),Tax (%),Total\n100,10,110'
    const expected = 'Price,Tax,Total\n100,10,110'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })

  it('should handle quoted headers', () => {
    const input = '"First Name","Last Name"\nJohn,Doe'
    const expected = 'First_Name,Last_Name\nJohn,Doe'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })

  it('should handle empty columns', () => {
    const input = '!!!,,Name\na,b,c'
    const expected = 'column_0,column_1,Name\na,b,c'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })

  it('should preserve data rows unchanged', () => {
    const input = 'Name,Value\n"quoted,data",100\nregular,200'
    const expected = 'Name,Value\n"quoted,data",100\nregular,200'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })

  it('should handle single row (header only)', () => {
    const input = 'First Name,Last Name'
    const expected = 'First_Name,Last_Name'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })

  it('should handle empty input', () => {
    expect(sanitizeCsvColumns('')).toBe('')
  })

  it('should handle complex real-world header', () => {
    const input = 'Customer ID,First Name,Email Address,Purchase Date (UTC),Amount ($)\n1,John,john@test.com,2024-01-01,99.99'
    const expected = 'Customer_ID,First_Name,Email_Address,Purchase_Date_UTC,Amount\n1,John,john@test.com,2024-01-01,99.99'
    expect(sanitizeCsvColumns(input)).toBe(expected)
  })
})

