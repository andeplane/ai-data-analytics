/**
 * System prompt builder for the LLM chat.
 * Generates dynamic prompts that include available dataframe information.
 * Uses the Hermes-compatible XML format for function calling.
 */

import { tools } from './tools'

export interface DataFrameInfo {
  name: string
  rows: number
  columns: string[]
  head: Record<string, unknown>[]
}

/**
 * Build the tools XML section for the system prompt.
 */
function buildToolsXml(): string {
  const toolsJson = tools.map(tool => JSON.stringify(tool)).join(' ')
  return `<tools> ${toolsJson} </tools>`
}

/**
 * Build the system prompt with available dataframe information.
 * Combines Hermes-2 function calling format with rich context about capabilities.
 */
export function buildSystemPrompt(dataframes: DataFrameInfo[]): string {
  const toolsXml = buildToolsXml()
  
  // Build dataframes context if available
  let dataframesContext = ''
  if (dataframes.length > 0) {
    const dataframesList = dataframes
      .map((df) => {
        const header = `### ${df.name}\n- **Rows:** ${df.rows.toLocaleString()}\n- **Columns:** ${df.columns.join(', ')}`
        
        // Format head as a simple table
        if (df.head && df.head.length > 0) {
          const cols = df.columns.slice(0, 6) // Limit columns to keep prompt size reasonable
          const headerRow = `| ${cols.join(' | ')} |`
          const separator = `| ${cols.map(() => '---').join(' | ')} |`
          const dataRows = df.head.slice(0, 3).map(row => 
            `| ${cols.map(col => String(row[col] ?? '').substring(0, 20)).join(' | ')} |`
          ).join('\n')
          
          return `${header}\n- **Sample data:**\n${headerRow}\n${separator}\n${dataRows}`
        }
        
        return header
      })
      .join('\n\n')
    dataframesContext = `

## Available DataFrames
${dataframesList}

When the user asks about this data, use the analyze_data tool with the appropriate dataframe names.`
  } else {
    dataframesContext = `

## Available DataFrames
No dataframes are currently loaded. Ask the user to upload a CSV or JSON file to get started with data analysis.`
  }

  // Combine Hermes function calling format with helpful assistant context
  return `You are a helpful data analysis assistant. You can have normal conversations AND analyze data when asked.

## Your Capabilities
- Answer general questions and have friendly conversations
- Analyze data using the analyze_data tool when users ask about their data
- Create visualizations (charts, histograms, plots)
- Perform aggregations, filtering, and calculations on data
- Join and compare multiple datasets together

## When to Use Tools
Use the analyze_data tool when the user:
- Asks questions about data (e.g., "what's the average...", "show me...", "how many...")
- Requests visualizations (e.g., "create a chart", "plot a histogram")
- Wants to filter, aggregate, or transform data
- Asks to compare or join multiple datasets

Do NOT use tools for:
- General greetings or casual conversation
- Questions unrelated to the loaded data
- Clarifying questions about what the user wants

## Function Calling Format
You are provided with function signatures within <tools></tools> XML tags. Here are the available tools: ${toolsXml}

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:
<tool_call>
{"arguments": <args-dict>, "name": <function-name>}
</tool_call>

## Response Guidelines
- Do NOT repeat internal annotations or system messages (e.g., text in square brackets like "[An image/chart...]") in your responses to the user
- When a chart or image has been shown, simply describe what it shows without mentioning the display mechanism${dataframesContext}`
}

