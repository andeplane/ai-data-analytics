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

/**
 * Sanitize a column name for SQL/Python compatibility.
 * Replaces spaces, hyphens, dots with underscores, removes special characters,
 * and handles empty results.
 *
 * @example
 * sanitizeColumnName('First Name', 0) // 'First_Name'
 * sanitizeColumnName('Price ($)', 1) // 'Price'
 * sanitizeColumnName('!!!', 2) // 'column_2'
 */
export function sanitizeColumnName(col: string, index: number): string {
  let result = col.trim()
  result = result.replace(/[\s\-.]+/g, '_') // Replace spaces, hyphens, dots with _
  result = result.replace(/[()[\]@#%&*/\\?!$:]+/g, '') // Remove special chars
  result = result.replace(/_+/g, '_') // Collapse multiple underscores
  result = result.replace(/^_|_$/g, '') // Remove leading/trailing underscores
  // Handle empty column names (e.g., if column was only special chars)
  if (!result) {
    result = `column_${index}`
  }
  return result
}

/**
 * Sanitize all column names in a CSV string.
 * Parses the header row, sanitizes each column name, and returns the modified CSV.
 *
 * @example
 * sanitizeCsvColumns('First Name,Price ($)\na,1') // 'First_Name,Price\na,1'
 */
export function sanitizeCsvColumns(csvData: string): string {
  if (!csvData) {
    return csvData
  }

  const lines = csvData.split('\n')

  // Parse the header row - handle quoted fields
  const headerLine = lines[0]
  const columns = parseCSVRow(headerLine)

  // Sanitize column names
  const sanitizedColumns = columns.map((col, index) => sanitizeColumnName(col, index))

  // Reconstruct the header - quote fields that contain commas or quotes
  const newHeader = sanitizedColumns.map(col => {
    if (col.includes(',') || col.includes('"')) {
      return `"${col.replace(/"/g, '""')}"`
    }
    return col
  }).join(',')

  // Return with sanitized header
  lines[0] = newHeader
  return lines.join('\n')
}

/**
 * Parse a single CSV row, handling quoted fields.
 * Returns an array of field values with quotes removed.
 */
export function parseCSVRow(row: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    const nextChar = row[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true
      } else if (char === ',') {
        // Field separator
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }

  // Push the last field
  result.push(current)

  return result
}

