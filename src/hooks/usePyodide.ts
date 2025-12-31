import { useState, useEffect, useCallback } from 'react'
import { loadPyodide } from 'pyodide'
import type { PyodideInterface } from 'pyodide'

export type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UsePyodideReturn {
  pyodide: PyodideInterface | null
  status: PyodideStatus
  error: string | null
  runPython: (code: string) => Promise<unknown>
  runPythonAsync: (code: string) => Promise<unknown>
}

export function usePyodide(): UsePyodideReturn {
  const [pyodide, setPyodide] = useState<PyodideInterface | null>(null)
  const [status, setStatus] = useState<PyodideStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function initPyodide() {
      setStatus('loading')
      setError(null)

      try {
        const py = await loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.6/full/',
        })

        if (!mounted) return

        // Load essential packages (from Pyodide distribution)
        await py.loadPackage(['micropip', 'pandas', 'requests', 'pillow', 'matplotlib'])

        if (!mounted) return

        setPyodide(py)
        setStatus('ready')
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load Pyodide')
        setStatus('error')
      }
    }

    initPyodide()

    return () => {
      mounted = false
    }
  }, [])

  const runPython = useCallback(
    (code: string) => {
      if (!pyodide) {
        return Promise.reject(new Error('Pyodide not loaded'))
      }
      return Promise.resolve(pyodide.runPython(code))
    },
    [pyodide]
  )

  const runPythonAsync = useCallback(
    async (code: string) => {
      if (!pyodide) {
        throw new Error('Pyodide not loaded')
      }
      return pyodide.runPythonAsync(code)
    },
    [pyodide]
  )

  return {
    pyodide,
    status,
    error,
    runPython,
    runPythonAsync,
  }
}

