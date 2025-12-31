/**
 * System prompt builder for the LLM chat.
 * Generates dynamic prompts that include available dataframe information.
 */

export interface DataFrameInfo {
  name: string
  rows: number
  columns: string[]
  head: Record<string, unknown>[]
}

/**
 * Build the system prompt with available dataframe information.
 */
export function buildSystemPrompt(dataframes: DataFrameInfo[]): string {
  const basePrompt = `You are a helpful data analysis assistant. You can have normal conversations AND analyze data when asked.

## Your Capabilities
- Answer general questions and have friendly conversations
- Analyze data using the analyze_data tool when users ask about their data
- Create visualizations (charts, histograms, plots)
- Perform aggregations, filtering, and calculations on data
- Join and compare multiple datasets together

## When to Use the analyze_data Tool
Use the analyze_data tool when the user:
- Asks questions about data (e.g., "what's the average...", "show me...", "how many...")
- Requests visualizations (e.g., "create a chart", "plot a histogram")
- Wants to filter, aggregate, or transform data
- Asks to compare or join multiple datasets

Do NOT use the tool for:
- General greetings or casual conversation
- Questions unrelated to the loaded data
- Clarifying questions about what the user wants`

  if (dataframes.length === 0) {
    return `${basePrompt}

## Available DataFrames
No dataframes are currently loaded. Ask the user to upload a CSV or JSON file to get started with data analysis.`
  }

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

  return `${basePrompt}

## Available DataFrames
${dataframesList}

When using the analyze_data tool, select the appropriate dataframe(s) from the list above based on the user's question. You can include multiple dataframes for joins or comparisons.`
}

