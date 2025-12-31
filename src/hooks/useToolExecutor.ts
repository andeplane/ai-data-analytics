import { useCallback } from 'react'
import type { PyodideInterface } from 'pyodide'
import type { AnalyzeDataArgs } from '../lib/tools'
import { isAnalyzeDataArgs } from '../lib/tools'

export interface ToolResult {
  success: boolean
  result: string
  chartPath?: string
}

interface UseToolExecutorOptions {
  pyodide: PyodideInterface | null
}

/**
 * Hook to execute tools called by the LLM.
 * Bridges TypeScript and Pyodide/PandasAI.
 */
export function useToolExecutor({ pyodide }: UseToolExecutorOptions) {
  /**
   * Execute the analyze_data tool using PandasAI Agent.
   */
  const executeAnalyzeData = useCallback(
    async (args: AnalyzeDataArgs): Promise<ToolResult> => {
      if (!pyodide) {
        return {
          success: false,
          result: 'Error: Python environment not ready',
        }
      }

      const { dataframe_names, question } = args

      if (dataframe_names.length === 0) {
        return {
          success: false,
          result: 'Error: No dataframes specified',
        }
      }

      try {
        // Escape for Python strings
        const escapedNames = dataframe_names.map((name) =>
          name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        )
        const escapedQuestion = question.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

        // Build Python code to execute PandasAI
        // For single dataframe: use SmartDataframe.chat() directly (already configured)
        // For multiple dataframes: use Agent with raw DataFrames
        const pythonCode = `
import json
import os

df_names = ${JSON.stringify(escapedNames)}
question = "${escapedQuestion}"

# Validate dataframes exist
missing = [name for name in df_names if name not in dataframes]
if missing:
    result_json = json.dumps({"success": False, "result": f"Dataframes not found: {missing}"})
elif len(df_names) == 0:
    result_json = json.dumps({"success": False, "result": "No dataframes specified"})
else:
    try:
        if len(df_names) == 1:
            # Single dataframe - use SmartDataframe.chat() directly
            sdf = dataframes[df_names[0]]
            print(f"Querying single dataframe: {df_names[0]}")
            result = sdf.chat(question)
        else:
            # Multiple dataframes - use Agent with raw DataFrames
            from pandasai import Agent
            raw_dfs = [dataframes[name]._df for name in df_names]
            print(f"Querying multiple dataframes: {df_names}")
            agent = Agent(raw_dfs, config={"llm": llm})
            result = agent.chat(question)
        
        # Check if result is a path to a chart
        result_str = str(result)
        chart_path = None
        
        print(f"PandasAI result: {result_str[:200]}...")
        
        # PandasAI saves charts to exports/charts/ directory
        if result_str.endswith('.png') or result_str.endswith('.jpg') or result_str.endswith('.jpeg'):
            chart_path = result_str
        
        # Check if there's a recently created chart file
        if chart_path is None and os.path.exists("exports/charts"):
            import glob
            charts = glob.glob("exports/charts/*.png")
            if charts:
                # Get the most recent chart
                charts.sort(key=os.path.getmtime, reverse=True)
                chart_path = charts[0]
                print(f"Found chart: {chart_path}")
        
        result_json = json.dumps({
            "success": True,
            "result": result_str,
            "chartPath": chart_path
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        result_json = json.dumps({"success": False, "result": f"Error: {str(e)}"})

result_json
`

        const resultJson = await pyodide.runPythonAsync(pythonCode)
        const parsed = JSON.parse(String(resultJson))

        return {
          success: parsed.success,
          result: parsed.result,
          chartPath: parsed.chartPath || undefined,
        }
      } catch (err) {
        console.error('Tool execution error:', err)
        return {
          success: false,
          result: `Error executing analysis: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
    [pyodide]
  )

  /**
   * Execute a tool by name with given arguments.
   */
  const executeTool = useCallback(
    async (toolName: string, args: unknown): Promise<ToolResult> => {
      switch (toolName) {
        case 'analyze_data':
          if (!isAnalyzeDataArgs(args)) {
            return {
              success: false,
              result: 'Invalid arguments for analyze_data tool',
            }
          }
          return executeAnalyzeData(args)

        default:
          return {
            success: false,
            result: `Unknown tool: ${toolName}`,
          }
      }
    },
    [executeAnalyzeData]
  )

  return {
    executeTool,
    executeAnalyzeData,
  }
}

