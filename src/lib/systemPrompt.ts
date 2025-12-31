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
  const basePrompt = `You are a helpful data analysis assistant with access to tools.

## CRITICAL: How to Use Tools
When you need to use a tool, you MUST output it in this EXACT format:
<tool_call>
{"name": "tool_name", "arguments": {"param1": value1, "param2": value2}}
</tool_call>

## Available Tools
1. add_numbers - Adds two numbers. Arguments: a (number), b (number)
2. analyze_data - Analyzes dataframes. Arguments: dataframe_names (array of strings), question (string)

## Examples

User: "add 5 and 3"
<tool_call>
{"name": "add_numbers", "arguments": {"a": 5, "b": 3}}
</tool_call>

User: "show me the top 10 countries"
<tool_call>
{"name": "analyze_data", "arguments": {"dataframe_names": ["customers"], "question": "show top 10 countries"}}
</tool_call>

## Rules
- When user asks to add/sum numbers → use add_numbers tool
- When user asks about loaded data → use analyze_data tool
- For greetings or unrelated questions → respond normally without tools`

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

When the user asks about this data, call the analyze_data tool immediately with the appropriate dataframe names. Do not explain what you will do - just do it.`
}

