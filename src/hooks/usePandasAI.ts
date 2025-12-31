import { useState, useCallback } from 'react'
import type { PyodideInterface } from 'pyodide'
import pandasaiLoaderCode from '../lib/pandasai-loader.py?raw'

export type PandasAIStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UsePandasAIReturn {
  status: PandasAIStatus
  error: string | null
  loadPandasAI: (apiUrl: string, bearerToken: string) => Promise<void>
  chat: (dataframeName: string, question: string) => Promise<string>
  loadDataframe: (name: string, csvData: string) => Promise<void>
}

export function usePandasAI(pyodide: PyodideInterface | null): UsePandasAIReturn {
  const [status, setStatus] = useState<PandasAIStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const loadPandasAI = useCallback(
    async (apiUrl: string, bearerToken: string) => {
      if (!pyodide) {
        setError('Pyodide not loaded')
        setStatus('error')
        return
      }

      setStatus('loading')
      setError(null)

      try {
        // First, run the patch code to define the function
        await pyodide.runPythonAsync(pandasaiLoaderCode)

        // Then call the patch function with the API URL and bearer token
        await pyodide.runPythonAsync(`
pandasai_modules = await patch_and_load_pandasai("${apiUrl}", "${bearerToken}")
SmartDataframe = pandasai_modules["SmartDataframe"]
Agent = pandasai_modules["Agent"]
llm = pandasai_modules["llm"]
print("PandasAI loaded successfully!")
`)

        setStatus('ready')
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(errorMsg)
        setStatus('error')
        console.error('PandasAI loading error:', err)
      }
    },
    [pyodide]
  )

  const loadDataframe = useCallback(
    async (name: string, csvData: string) => {
      if (!pyodide || status !== 'ready') {
        throw new Error('PandasAI not ready')
      }

      // Escape the CSV data for Python string
      const escapedCsv = csvData.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')

      await pyodide.runPythonAsync(`
import pandas as pd
from io import StringIO

csv_data = """${escapedCsv}"""
${name}_df = pd.read_csv(StringIO(csv_data))
${name} = SmartDataframe(${name}_df, config={"llm": llm})
print(f"Loaded dataframe '${name}' with {len(${name}_df)} rows")
`)
    },
    [pyodide, status]
  )

  const chat = useCallback(
    async (dataframeName: string, question: string) => {
      if (!pyodide || status !== 'ready') {
        throw new Error('PandasAI not ready')
      }

      // Escape question for Python
      const escapedQuestion = question.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

      const result = await pyodide.runPythonAsync(`
result = ${dataframeName}.chat("${escapedQuestion}")
str(result)
`)

      return String(result)
    },
    [pyodide, status]
  )

  return {
    status,
    error,
    loadPandasAI,
    chat,
    loadDataframe,
  }
}
