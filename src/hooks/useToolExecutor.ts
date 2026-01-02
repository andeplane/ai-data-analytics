import { useCallback } from 'react'
import type { PyodideProxy } from './usePyodide'
import type { AnalyzeDataArgs } from '../lib/tools'
import { isAnalyzeDataArgs } from '../lib/tools'
import { escapePythonString, escapeNamesForPython } from '../lib/pythonUtils'
import {
  buildAnalyzeDataPythonCode,
  parseToolExecutionResult,
} from '../lib/toolExecutorUtils'

export interface ToolResult {
  success: boolean
  result: string
  chartPath?: string
}

interface UseToolExecutorOptions {
  pyodide: PyodideProxy | null
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
        const escapedNames = escapeNamesForPython(dataframe_names)
        const escapedQuestion = escapePythonString(question)

        // Build Python code to execute PandasAI
        const pythonCode = buildAnalyzeDataPythonCode(escapedNames, escapedQuestion)

        const resultJson = await pyodide.runPythonAsync(pythonCode)
        return parseToolExecutionResult(String(resultJson))
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
      // Tool execution is logged in useLLMChat.ts, so we keep this minimal
      console.groupCollapsed(`🔧 Executing tool: ${toolName}`)
      console.log('Arguments:', args)
      console.groupEnd()
      
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
