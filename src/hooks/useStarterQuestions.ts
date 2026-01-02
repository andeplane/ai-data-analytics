import { useState, useEffect, useRef } from 'react'
import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import type { DataFrameInfo } from '../lib/systemPrompt'
import { callLLM } from '../lib/llmCaller'

// Default questions to show while loading or if generation fails
const DEFAULT_QUESTIONS = [
  'Show first 10 rows',
  'What columns are in my data?',
  'Give me a summary of the data',
  'Show basic statistics',
]

/**
 * Build a prompt for generating starter questions based on dataframe info.
 * Uses the same format as the system prompt for consistency.
 */
export function buildQuestionGenerationPrompt(dataframes: DataFrameInfo[]): string {
  const dataframesList = dataframes
    .map((df) => {
      const header = `### ${df.name}\n- Rows: ${df.rows.toLocaleString()}\n- Columns: ${df.columns.join(', ')}`
      
      // Format head as a simple table
      if (df.head && df.head.length > 0) {
        const cols = df.columns.slice(0, 6) // Limit columns
        const headerRow = `| ${cols.join(' | ')} |`
        const separator = `| ${cols.map(() => '---').join(' | ')} |`
        const dataRows = df.head.slice(0, 3).map(row => 
          `| ${cols.map(col => String(row[col] ?? '').substring(0, 20)).join(' | ')} |`
        ).join('\n')
        
        return `${header}\n- Sample data:\n${headerRow}\n${separator}\n${dataRows}`
      }
      
      return header
    })
    .join('\n\n')

  return `Given these dataframes:

${dataframesList}

You have access to pandas and matplotlib for analysis. Available capabilities:
- Statistical analysis (correlations, distributions, outliers, aggregations)
- Data visualization (histograms, scatter plots, bar charts, line plots, pie charts)
- Data filtering, grouping, and transformations

Generate 4-5 short, specific questions a user might want to ask about this data. Include a mix of:
- Data exploration questions
- Statistical analysis questions  
- Visualization/plotting requests

Questions should be actionable and relevant to the actual columns and data shown.

Return a JSON object with a "questions" key containing an array of question strings.
Example: {"questions": ["What is the correlation between price and sales?", "Plot a histogram of ages", "Show average revenue by category"]}`
}

/**
 * Parse the LLM response to extract questions array.
 * With JSON mode, the response should be a valid JSON object.
 */
export function parseQuestionsResponse(response: string): string[] {
  try {
    const parsed = JSON.parse(response.trim())
    
    // Handle both {"questions": [...]} format and direct array format
    const questions = parsed.questions || (Array.isArray(parsed) ? parsed : null)
    
    if (Array.isArray(questions) && questions.every(q => typeof q === 'string')) {
      return questions.slice(0, 5) // Limit to 5 questions
    }
  } catch (e) {
    console.warn('Failed to parse questions response:', e)
  }
  
  return DEFAULT_QUESTIONS
}

/**
 * Create a stable hash of dataframes for comparison.
 * Used to detect when dataframes have actually changed.
 */
export function hashDataframes(dataframes: DataFrameInfo[]): string {
  return dataframes
    .map(df => `${df.name}:${df.rows}:${df.columns.join(',')}`)
    .sort()
    .join('|')
}

interface UseStarterQuestionsOptions {
  engine: MLCEngineInterface | null
  dataframes: DataFrameInfo[]
}

interface UseStarterQuestionsReturn {
  questions: string[]
  isLoading: boolean
}

/**
 * Hook to generate context-aware starter questions based on loaded dataframes.
 * Calls the LLM when dataframes change to generate relevant questions.
 */
export function useStarterQuestions({
  engine,
  dataframes,
}: UseStarterQuestionsOptions): UseStarterQuestionsReturn {
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS)
  const [isLoading, setIsLoading] = useState(false)
  
  // Track which dataframes we've already generated questions for
  const lastDataframesHashRef = useRef<string>('')
  // Track if generation is in progress to prevent duplicate calls
  const isGeneratingRef = useRef(false)

  useEffect(() => {
    // Skip if no engine or no dataframes
    if (!engine || dataframes.length === 0) {
      setQuestions(DEFAULT_QUESTIONS)
      return
    }

    // Check if dataframes have actually changed
    const currentHash = hashDataframes(dataframes)
    if (currentHash === lastDataframesHashRef.current) {
      return // No change, skip generation
    }

    // Prevent duplicate calls
    if (isGeneratingRef.current) {
      return
    }

    const generateQuestions = async () => {
      isGeneratingRef.current = true
      setIsLoading(true)
      
      try {
        const prompt = buildQuestionGenerationPrompt(dataframes)
        
        const response = await callLLM(engine, {
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500,
          response_format: { type: 'json_object' },
          source: 'starter-questions',
        })
        
        const parsedQuestions = parseQuestionsResponse(response)
        setQuestions(parsedQuestions)
        lastDataframesHashRef.current = currentHash
      } catch (error) {
        console.error('Failed to generate starter questions:', error)
        setQuestions(DEFAULT_QUESTIONS)
      } finally {
        setIsLoading(false)
        isGeneratingRef.current = false
      }
    }

    generateQuestions()
  }, [engine, dataframes])

  return { questions, isLoading }
}

export { DEFAULT_QUESTIONS }

