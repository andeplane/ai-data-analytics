import { describe, expect, it } from 'vitest'
import type { DataFrameInfo } from '../lib/systemPrompt'
import {
  buildQuestionGenerationPrompt,
  DEFAULT_QUESTIONS,
  hashDataframes,
  parseQuestionsResponse,
} from './useStarterQuestions'

describe(parseQuestionsResponse.name, () => {
  it('should parse valid JSON with questions array', () => {
    const response = JSON.stringify({
      questions: ['Question 1?', 'Question 2?', 'Question 3?'],
    })

    const result = parseQuestionsResponse(response)

    expect(result).toEqual(['Question 1?', 'Question 2?', 'Question 3?'])
  })

  it('should parse direct array format', () => {
    const response = JSON.stringify(['Q1', 'Q2', 'Q3'])

    const result = parseQuestionsResponse(response)

    expect(result).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('should limit to 5 questions', () => {
    const response = JSON.stringify({
      questions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
    })

    const result = parseQuestionsResponse(response)

    expect(result).toHaveLength(5)
    expect(result).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5'])
  })

  it('should return default questions for invalid JSON', () => {
    const result = parseQuestionsResponse('not valid json')

    expect(result).toEqual(DEFAULT_QUESTIONS)
  })

  it('should return default questions for empty response', () => {
    const result = parseQuestionsResponse('')

    expect(result).toEqual(DEFAULT_QUESTIONS)
  })

  it('should return default questions when questions is not an array', () => {
    const response = JSON.stringify({ questions: 'not an array' })

    const result = parseQuestionsResponse(response)

    expect(result).toEqual(DEFAULT_QUESTIONS)
  })

  it('should return default questions when array contains non-strings', () => {
    const response = JSON.stringify({
      questions: [1, 2, { nested: true }],
    })

    const result = parseQuestionsResponse(response)

    expect(result).toEqual(DEFAULT_QUESTIONS)
  })

  it('should handle response with whitespace', () => {
    const response = `  ${JSON.stringify({ questions: ['Test?'] })}  `

    const result = parseQuestionsResponse(response)

    expect(result).toEqual(['Test?'])
  })

  it('should handle object without questions key', () => {
    const response = JSON.stringify({ data: ['Q1', 'Q2'] })

    const result = parseQuestionsResponse(response)

    expect(result).toEqual(DEFAULT_QUESTIONS)
  })
})

describe(hashDataframes.name, () => {
  it('should create hash from dataframe properties', () => {
    const dataframes: DataFrameInfo[] = [
      { name: 'sales', rows: 100, columns: ['id', 'amount'], head: [] },
    ]

    const hash = hashDataframes(dataframes)

    expect(hash).toBe('sales:100:id,amount')
  })

  it('should create sorted hash for multiple dataframes', () => {
    const dataframes: DataFrameInfo[] = [
      { name: 'beta', rows: 50, columns: ['a'], head: [] },
      { name: 'alpha', rows: 100, columns: ['b', 'c'], head: [] },
    ]

    const hash = hashDataframes(dataframes)

    // Should be sorted alphabetically
    expect(hash).toBe('alpha:100:b,c|beta:50:a')
  })

  it('should return same hash for same dataframes in different order', () => {
    const df1: DataFrameInfo[] = [
      { name: 'a', rows: 1, columns: ['x'], head: [] },
      { name: 'b', rows: 2, columns: ['y'], head: [] },
    ]
    const df2: DataFrameInfo[] = [
      { name: 'b', rows: 2, columns: ['y'], head: [] },
      { name: 'a', rows: 1, columns: ['x'], head: [] },
    ]

    expect(hashDataframes(df1)).toBe(hashDataframes(df2))
  })

  it('should return different hash when row count changes', () => {
    const df1: DataFrameInfo[] = [
      { name: 'test', rows: 100, columns: ['a'], head: [] },
    ]
    const df2: DataFrameInfo[] = [
      { name: 'test', rows: 200, columns: ['a'], head: [] },
    ]

    expect(hashDataframes(df1)).not.toBe(hashDataframes(df2))
  })

  it('should return different hash when columns change', () => {
    const df1: DataFrameInfo[] = [
      { name: 'test', rows: 100, columns: ['a', 'b'], head: [] },
    ]
    const df2: DataFrameInfo[] = [
      { name: 'test', rows: 100, columns: ['a', 'c'], head: [] },
    ]

    expect(hashDataframes(df1)).not.toBe(hashDataframes(df2))
  })

  it('should return empty string for empty array', () => {
    expect(hashDataframes([])).toBe('')
  })
})

describe(buildQuestionGenerationPrompt.name, () => {
  it('should include dataframe name and row count', () => {
    const dataframes: DataFrameInfo[] = [
      { name: 'sales', rows: 1000, columns: ['id', 'amount'], head: [] },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    expect(prompt).toContain('### sales')
    expect(prompt).toContain('1,000') // Formatted row count
    expect(prompt).toContain('id, amount')
  })

  it('should include column names', () => {
    const dataframes: DataFrameInfo[] = [
      {
        name: 'customers',
        rows: 500,
        columns: ['name', 'email', 'country'],
        head: [],
      },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    expect(prompt).toContain('name, email, country')
  })

  it('should include sample data when available', () => {
    const dataframes: DataFrameInfo[] = [
      {
        name: 'orders',
        rows: 100,
        columns: ['id', 'product'],
        head: [
          { id: 1, product: 'Widget' },
          { id: 2, product: 'Gadget' },
        ],
      },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    expect(prompt).toContain('Sample data')
    expect(prompt).toContain('Widget')
    expect(prompt).toContain('Gadget')
  })

  it('should include instructions for JSON response', () => {
    const dataframes: DataFrameInfo[] = [
      { name: 'test', rows: 10, columns: ['a'], head: [] },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    expect(prompt).toContain('JSON')
    expect(prompt).toContain('questions')
  })

  it('should mention available capabilities', () => {
    const dataframes: DataFrameInfo[] = [
      { name: 'test', rows: 10, columns: ['a'], head: [] },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    expect(prompt).toContain('pandas')
    expect(prompt).toContain('matplotlib')
    expect(prompt).toContain('Statistical analysis')
    expect(prompt).toContain('visualization')
  })

  it('should handle multiple dataframes', () => {
    const dataframes: DataFrameInfo[] = [
      { name: 'sales', rows: 100, columns: ['id'], head: [] },
      { name: 'customers', rows: 50, columns: ['name'], head: [] },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    expect(prompt).toContain('### sales')
    expect(prompt).toContain('### customers')
  })

  it('should limit columns shown in sample data', () => {
    const dataframes: DataFrameInfo[] = [
      {
        name: 'wide',
        rows: 10,
        columns: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        head: [
          { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 },
        ],
      },
    ]

    const prompt = buildQuestionGenerationPrompt(dataframes)

    // Should only show first 6 columns in sample
    expect(prompt).toContain('| a |')
    expect(prompt).toContain('| f |')
    // Should not contain columns beyond 6
    expect(prompt).not.toContain('| g |')
  })
})

