/**
 * Tool definitions for the LLM to use.
 * These follow the OpenAI function calling format.
 */

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        items?: { type: string }
        description: string
      }>
      required: string[]
    }
  }
}

export interface AnalyzeDataArgs {
  dataframe_names: string[]
  question: string
}

/**
 * Tool definitions that will be sent to the LLM.
 */
export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'analyze_data',
      description: 'Query or analyze one or more loaded dataframes using natural language. Use this for data questions, visualizations, aggregations, joins, or comparisons between datasets.',
      parameters: {
        type: 'object',
        properties: {
          dataframe_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of the dataframes to include in the analysis',
          },
          question: {
            type: 'string',
            description: 'Natural language question about the data',
          },
        },
        required: ['dataframe_names', 'question'],
      },
    },
  },
]

/**
 * Type guard to check if args match AnalyzeDataArgs
 */
export function isAnalyzeDataArgs(args: unknown): args is AnalyzeDataArgs {
  if (typeof args !== 'object' || args === null) return false
  const obj = args as Record<string, unknown>
  return (
    Array.isArray(obj.dataframe_names) &&
    obj.dataframe_names.every((name) => typeof name === 'string') &&
    typeof obj.question === 'string'
  )
}

