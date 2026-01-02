import { describe, expect, test } from 'vitest'
import { buildSystemPrompt } from './systemPrompt'
import type { DataFrameInfo } from './systemPrompt'

describe('buildSystemPrompt', () => {
  test('with empty dataframes mentions no data loaded', () => {
    const result = buildSystemPrompt([])
    expect(result).toContain('No dataframes are currently loaded')
  })

  test('with dataframes includes table info', () => {
    const df: DataFrameInfo = {
      name: 'sales',
      rows: 1000,
      columns: ['id', 'amount', 'date'],
      head: [{ id: 1, amount: 100, date: '2024-01-01' }],
    }
    const result = buildSystemPrompt([df])
    expect(result).toContain('### sales')
    expect(result).toContain('1,000') // formatted row count
    expect(result).toContain('id, amount, date')
  })

  test('with multiple dataframes includes all of them', () => {
    const df1: DataFrameInfo = {
      name: 'sales',
      rows: 100,
      columns: ['id', 'amount'],
      head: [{ id: 1, amount: 100 }],
    }
    const df2: DataFrameInfo = {
      name: 'customers',
      rows: 50,
      columns: ['name', 'email'],
      head: [{ name: 'John', email: 'john@example.com' }],
    }
    const result = buildSystemPrompt([df1, df2])
    expect(result).toContain('### sales')
    expect(result).toContain('### customers')
    expect(result).toContain('100')
    expect(result).toContain('50')
  })

  test('with dataframe but no head data still includes basic info', () => {
    const df: DataFrameInfo = {
      name: 'empty',
      rows: 0,
      columns: ['col1', 'col2'],
      head: [],
    }
    const result = buildSystemPrompt([df])
    expect(result).toContain('### empty')
    expect(result).toContain('0')
    expect(result).toContain('col1, col2')
  })

  test('includes tools XML section', () => {
    const result = buildSystemPrompt([])
    expect(result).toContain('<tools>')
    expect(result).toContain('</tools>')
  })

  test('includes function calling instructions', () => {
    const result = buildSystemPrompt([])
    expect(result).toContain('<tool_call>')
    expect(result).toContain('analyze_data')
  })
})

