/**
 * Utilities for escaping strings for use in Python code.
 * Used when generating Python code dynamically for Pyodide execution.
 */

/**
 * Escape a string for use inside a Python double-quoted string.
 * Handles backslashes and double quotes.
 *
 * @example
 * escapePythonString('hello "world"') // 'hello \\"world\\"'
 * escapePythonString('path\\to\\file') // 'path\\\\to\\\\file'
 */
export function escapePythonString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Escape CSV data for use inside a Python triple-quoted string.
 * Handles backslashes and triple quote sequences.
 *
 * @example
 * escapeCsvForPython('a,b,c') // 'a,b,c'
 * escapeCsvForPython('value with """quotes"""') // 'value with \\"\\"\\"quotes\\"\\"\\"\\'
 */
export function escapeCsvForPython(csv: string): string {
  return csv.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')
}

/**
 * Escape an array of names for use in Python code.
 * Returns the escaped names as an array.
 *
 * @example
 * escapeNamesForPython(['df1', 'my "df"']) // ['df1', 'my \\"df\\"']
 */
export function escapeNamesForPython(names: string[]): string[] {
  return names.map(escapePythonString)
}

