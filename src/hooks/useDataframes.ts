import { useState, useEffect, useCallback } from 'react'
import type { PyodideProxy } from './usePyodide'

export interface DataFrame {
  name: string
  rows: number
  columns: string[]
  head: Record<string, unknown>[]
}

interface QueuedFile {
  name: string
  content: string
  type: 'csv' | 'json'
}

interface UseDataframesOptions {
  pyodide: PyodideProxy | null
  pandasStatus: 'idle' | 'loading' | 'ready' | 'error'
  loadDataframe: (name: string, csvContent: string) => Promise<void>
  getDataframeInfo: (name: string) => Promise<{ rows: number; columns: string[]; head: Record<string, unknown>[] }>
}

interface UseDataframesResult {
  dataframes: DataFrame[]
  hasQueuedFiles: boolean
  handleFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>
}

/**
 * Convert JSON content to CSV format
 */
function jsonToCsv(content: string): string {
  const json = JSON.parse(content)
  const arr = Array.isArray(json) ? json : [json]
  if (arr.length === 0) {
    throw new Error('JSON array is empty')
  }
  const headers = Object.keys(arr[0])
  const rows = arr.map((obj: Record<string, unknown>) => 
    headers.map(h => String(obj[h] ?? '')).join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

/**
 * Hook for managing dataframes and file loading
 */
export function useDataframes({
  pyodide,
  pandasStatus,
  loadDataframe,
  getDataframeInfo,
}: UseDataframesOptions): UseDataframesResult {
  const [dataframes, setDataframes] = useState<DataFrame[]>([])
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([])

  /**
   * Process a file and load it into PandasAI
   */
  const processFile = useCallback(async (name: string, content: string, type: 'csv' | 'json') => {
    // Convert JSON to CSV if needed
    const csvContent = type === 'json' ? jsonToCsv(content) : content

    await loadDataframe(name, csvContent)
    
    // Get dataframe info
    const info = await getDataframeInfo(name)
    
    setDataframes(prev => {
      const existing = prev.findIndex(df => df.name === name)
      const newDf: DataFrame = { name, rows: info.rows, columns: info.columns, head: info.head }
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = newDf
        return updated
      }
      return [...prev, newDf]
    })
  }, [loadDataframe, getDataframeInfo])

  /**
   * Handle file upload - queues if PandasAI not ready, processes immediately otherwise
   */
  const handleFileLoad = useCallback(async (name: string, content: string, type: 'csv' | 'json') => {
    // If PandasAI is not ready, queue the file
    if (pandasStatus !== 'ready') {
      setQueuedFiles(prev => [...prev, { name, content, type }])
      // Add placeholder to dataframes list (will be updated when processed)
      setDataframes(prev => {
        const existing = prev.findIndex(df => df.name === name)
        if (existing >= 0) return prev
        const newDf: DataFrame = { name, rows: 0, columns: [], head: [] }
        return [...prev, newDf]
      })
      return
    }

    try {
      await processFile(name, content, type)
    } catch (err) {
      console.error('Failed to load file:', err)
      alert(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [pandasStatus, processFile])

  // Process queued files when PandasAI becomes ready
  useEffect(() => {
    if (pandasStatus === 'ready' && queuedFiles.length > 0 && pyodide) {
      const processQueue = async () => {
        const filesToProcess = [...queuedFiles]
        setQueuedFiles([])
        for (const file of filesToProcess) {
          try {
            await processFile(file.name, file.content, file.type)
          } catch (err) {
            console.error('Failed to process queued file:', err)
          }
        }
      }
      processQueue()
    }
  }, [pandasStatus, queuedFiles, pyodide, processFile])

  return {
    dataframes,
    hasQueuedFiles: queuedFiles.length > 0,
    handleFileLoad,
  }
}
