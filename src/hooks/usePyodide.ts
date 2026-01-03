import { useState, useEffect, useCallback, useRef } from 'react'
import { generateId } from '../lib/chatUtils'
import type { PandasAIProgressStage } from '../workers/pyodide.worker'

export type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error'

// Re-export the progress stage type
export type { PandasAIProgressStage }

// Message types for worker communication
interface StatusMessage {
  type: 'status'
  status: 'loading' | 'ready' | 'error'
  error?: string
}

interface ResultMessage {
  type: 'result'
  id: string
  success: boolean
  result?: unknown
  error?: string
}

interface LLMRequestMessage {
  type: 'llmRequest'
  id: string
  prompt: string
}

interface ProgressUpdateMessage {
  type: 'progressUpdate'
  stage: PandasAIProgressStage
  detail?: string
}

type WorkerResponse = StatusMessage | ResultMessage | LLMRequestMessage | ProgressUpdateMessage

/**
 * Interface for the Pyodide proxy that communicates with the worker.
 * This replaces the PyodideInterface from pyodide package.
 */
export interface PyodideProxy {
  runPython: (code: string) => Promise<unknown>
  runPythonAsync: (code: string) => Promise<unknown>
  writeFile: (path: string, content: string) => Promise<void>
}

/**
 * Function type for handling LLM calls from the worker
 */
export type LLMHandler = (prompt: string) => Promise<string>

/**
 * Function type for handling progress updates from PandasAI
 */
export type ProgressHandler = (stage: PandasAIProgressStage, detail?: string) => void

interface UsePyodideOptions {
  /**
   * Handler function to call when the worker needs LLM inference.
   * This should call the WebLLM engine and return the response.
   */
  onLLMRequest?: LLMHandler
  
  /**
   * Handler function to call when PandasAI reports progress.
   * Used to update UI with current execution stage.
   */
  onProgressUpdate?: ProgressHandler
}

interface UsePyodideReturn {
  pyodide: PyodideProxy | null
  status: PyodideStatus
  error: string | null
  runPython: (code: string) => Promise<unknown>
  runPythonAsync: (code: string) => Promise<unknown>
  writeFile: (path: string, content: string) => Promise<void>
}

// Pending promise resolvers keyed by request ID
type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export function usePyodide(options: UsePyodideOptions = {}): UsePyodideReturn {
  const { onLLMRequest, onProgressUpdate } = options
  
  const [status, setStatus] = useState<PyodideStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  
  const workerRef = useRef<Worker | null>(null)
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map())
  const onLLMRequestRef = useRef<LLMHandler | undefined>(onLLMRequest)
  const onProgressUpdateRef = useRef<ProgressHandler | undefined>(onProgressUpdate)
  
  // Keep the LLM handler ref updated
  useEffect(() => {
    onLLMRequestRef.current = onLLMRequest
  }, [onLLMRequest])
  
  // Keep the progress handler ref updated
  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate
  }, [onProgressUpdate])

  // Initialize worker on mount
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/pyodide.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker
    
    // Capture ref value at effect start for cleanup
    const pendingRequests = pendingRequestsRef.current

    // Handle messages from worker
    worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
      const message = event.data

      if (message.type === 'status') {
        if (message.status === 'loading') {
          setStatus('loading')
          setError(null)
        } else if (message.status === 'ready') {
          setStatus('ready')
          setError(null)
        } else if (message.status === 'error') {
          setStatus('error')
          setError(message.error ?? 'Unknown error')
        }
      } else if (message.type === 'result') {
        const pending = pendingRequestsRef.current.get(message.id)
        if (pending) {
          pendingRequestsRef.current.delete(message.id)
          if (message.success) {
            pending.resolve(message.result)
          } else {
            pending.reject(new Error(message.error ?? 'Unknown error'))
          }
        }
      } else if (message.type === 'llmRequest') {
        // Worker is requesting an LLM call - forward to the handler
        const handler = onLLMRequestRef.current
        if (handler) {
          try {
            const result = await handler(message.prompt)
            worker.postMessage({
              type: 'llmResponse',
              id: message.id,
              success: true,
              result,
            })
          } catch (err) {
            worker.postMessage({
              type: 'llmResponse',
              id: message.id,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        } else {
          // No handler registered - send error back
          worker.postMessage({
            type: 'llmResponse',
            id: message.id,
            success: false,
            error: 'No LLM handler registered',
          })
        }
      } else if (message.type === 'progressUpdate') {
        // PandasAI is reporting progress - forward to the handler
        const handler = onProgressUpdateRef.current
        if (handler) {
          handler(message.stage, message.detail)
        }
      }
    }

    worker.onerror = (event) => {
      console.error('Pyodide worker error:', event)
      setStatus('error')
      setError(event.message || 'Worker error')
    }

    // Start initialization
    worker.postMessage({ type: 'init' })

    return () => {
      worker.terminate()
      workerRef.current = null
      // Reject all pending requests using captured ref value
      pendingRequests.forEach((pending) => {
        pending.reject(new Error('Worker terminated'))
      })
      pendingRequests.clear()
    }
  }, [])

  const runPython = useCallback(
    (code: string): Promise<unknown> => {
      const worker = workerRef.current
      if (!worker || status !== 'ready') {
        return Promise.reject(new Error('Pyodide not loaded'))
      }

      const id = generateId()
      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject })
        worker.postMessage({ type: 'runPython', id, code })
      })
    },
    [status]
  )

  const runPythonAsync = useCallback(
    (code: string): Promise<unknown> => {
      const worker = workerRef.current
      if (!worker || status !== 'ready') {
        return Promise.reject(new Error('Pyodide not loaded'))
      }

      const id = generateId()
      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject })
        worker.postMessage({ type: 'runPythonAsync', id, code })
      })
    },
    [status]
  )

  const writeFile = useCallback(
    (path: string, content: string): Promise<void> => {
      const worker = workerRef.current
      if (!worker || status !== 'ready') {
        return Promise.reject(new Error('Pyodide not loaded'))
      }

      const id = generateId()
      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, {
          resolve: () => resolve(),
          reject,
        })
        worker.postMessage({ type: 'writeFile', id, path, content })
      })
    },
    [status]
  )

  // Create a proxy object that mimics the interface consumers expect
  const pyodideProxy: PyodideProxy | null = status === 'ready' ? {
    runPython,
    runPythonAsync,
    writeFile,
  } : null

  return {
    pyodide: pyodideProxy,
    status,
    error,
    runPython,
    runPythonAsync,
    writeFile,
  }
}
