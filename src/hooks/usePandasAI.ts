import { useState, useCallback } from 'react'
import type { PyodideProxy } from './usePyodide'
import pandasaiLoaderCode from '../lib/pandasai-loader.py?raw'

export type PandasAIStatus = 'idle' | 'loading' | 'ready' | 'error'

interface DataframeInfo {
  rows: number
  columns: string[]
  head: Record<string, unknown>[]
}

interface UsePandasAIReturn {
  status: PandasAIStatus
  error: string | null
  loadPandasAI: () => Promise<void>
  chat: (dataframeName: string, question: string) => Promise<string>
  loadDataframe: (name: string, csvData: string) => Promise<void>
  getDataframeInfo: (name: string) => Promise<DataframeInfo>
}

export function usePandasAI(pyodide: PyodideProxy | null): UsePandasAIReturn {
  const [status, setStatus] = useState<PandasAIStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const loadPandasAI = useCallback(
    async () => {
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

        // Then call the patch function (no longer needs API URL or bearer token)
        await pyodide.runPythonAsync(`
pandasai_modules = await patch_and_load_pandasai()
DataFrame = pandasai_modules["DataFrame"]
Agent = pandasai_modules["Agent"]
llm = pandasai_modules["llm"]
dataframes = pandasai_modules["dataframes"]
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
      const escapedName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

      await pyodide.runPythonAsync(`
import pandas as pd
from io import StringIO

csv_data = """${escapedCsv}"""
_temp_df = pd.read_csv(StringIO(csv_data))
dataframes["${escapedName}"] = DataFrame(_temp_df)
print(f"Loaded dataframe '${escapedName}' with {len(_temp_df)} rows")
`)
    },
    [pyodide, status]
  )

  const chat = useCallback(
    async (dataframeName: string, question: string) => {
      if (!pyodide || status !== 'ready') {
        throw new Error('PandasAI not ready')
      }

      // Escape for Python strings
      const escapedName = dataframeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const escapedQuestion = question.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

      const result = await pyodide.runPythonAsync(`
result = dataframes["${escapedName}"].chat("${escapedQuestion}")
str(result)
`)

      return String(result)
    },
    [pyodide, status]
  )

  const getDataframeInfo = useCallback(
    async (name: string): Promise<DataframeInfo> => {
      if (!pyodide || status !== 'ready') {
        throw new Error('PandasAI not ready')
      }

      const escapedName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

      const result = await pyodide.runPythonAsync(`
import json
_df = dataframes["${escapedName}"]
json.dumps({
    "rows": len(_df),
    "columns": list(_df.columns),
    "head": _df.head(5).to_dict('records')
})
`)

      return JSON.parse(String(result))
    },
    [pyodide, status]
  )

  return {
    status,
    error,
    loadPandasAI,
    chat,
    loadDataframe,
    getDataframeInfo,
  }
}
