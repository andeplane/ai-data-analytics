import { useState, useCallback, useEffect, useRef } from 'react'
import * as webllm from '@mlc-ai/web-llm'
import { callLLM } from '../lib/llmCaller'

export type WebLLMStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseWebLLMReturn {
  engine: webllm.MLCEngineInterface | null
  status: WebLLMStatus
  progress: number
  progressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  error: string | null
  loadModel: () => Promise<void>
}

// Model that supports function calling
const MODEL_ID = 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC'

// How many seconds of progress history to keep for ETA calculation
const ETA_WINDOW_SECONDS = 10

interface ProgressSample {
  timestamp: number
  progress: number
}

/**
 * Format seconds into a human-readable string like "2m 30s" or "45s"
 */
export function formatTime(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return '--'
  
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  
  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

/**
 * Calculate ETA based on recent progress rate (rolling window).
 * This handles the case where cached files load instantly.
 */
function calculateETA(samples: ProgressSample[], currentProgress: number): number | null {
  if (samples.length < 2 || currentProgress >= 1) {
    return null
  }

  const now = Date.now()
  const windowStart = now - ETA_WINDOW_SECONDS * 1000
  
  // Filter to samples within the window
  const recentSamples = samples.filter(s => s.timestamp >= windowStart)
  
  if (recentSamples.length < 2) {
    // Not enough recent samples, use all samples but cap at oldest 10
    const samplesToUse = samples.slice(-10)
    if (samplesToUse.length < 2) return null
    
    const oldest = samplesToUse[0]
    const newest = samplesToUse[samplesToUse.length - 1]
    const timeDelta = (newest.timestamp - oldest.timestamp) / 1000
    const progressDelta = newest.progress - oldest.progress
    
    if (timeDelta <= 0 || progressDelta <= 0) return null
    
    const rate = progressDelta / timeDelta // progress per second
    const remaining = (1 - currentProgress) / rate
    return remaining > 0 ? remaining : null
  }
  
  // Calculate rate from recent samples
  const oldest = recentSamples[0]
  const newest = recentSamples[recentSamples.length - 1]
  const timeDelta = (newest.timestamp - oldest.timestamp) / 1000
  const progressDelta = newest.progress - oldest.progress
  
  if (timeDelta <= 0 || progressDelta <= 0) {
    // No progress in window - either stalled or cached files loading
    return null
  }
  
  const rate = progressDelta / timeDelta // progress per second
  const remaining = (1 - currentProgress) / rate
  
  return remaining > 0 ? remaining : null
}

/**
 * Hook to manage the web-llm engine lifecycle.
 * Also exposes a global function for Python/Pyodide to call.
 */
export function useWebLLM(): UseWebLLMReturn {
  const [engine, setEngine] = useState<webllm.MLCEngineInterface | null>(null)
  const [status, setStatus] = useState<WebLLMStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [elapsedTime, setElapsedTime] = useState(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const engineRef = useRef<webllm.MLCEngineInterface | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressSamplesRef = useRef<ProgressSample[]>([])

  // Expose global function for Python/Pyodide to call
  useEffect(() => {
    // This function will be called from Python via Pyodide's JS interop
    const webllmChat = async (prompt: string): Promise<string> => {
      const currentEngine = engineRef.current
      if (!currentEngine) {
        throw new Error('web-llm engine not ready')
      }

      // Use unified LLM caller
      return callLLM(currentEngine, {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 2000,
        source: 'pandasai',
      })
    }

    // Expose to global scope for Pyodide
    ;(window as unknown as Record<string, unknown>).webllmChat = webllmChat

    return () => {
      delete (window as unknown as Record<string, unknown>).webllmChat
    }
  }, [])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const loadModel = useCallback(async () => {
    if (status === 'loading' || status === 'ready') {
      return
    }

    setStatus('loading')
    setError(null)
    setProgress(0)
    setProgressText('Initializing...')
    setElapsedTime(0)
    setEstimatedTimeRemaining(null)
    progressSamplesRef.current = []
    
    // Start timing
    startTimeRef.current = Date.now()
    
    // Update elapsed time every second
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000)
      }
    }, 1000)

    try {
      const initProgressCallback = (report: webllm.InitProgressReport) => {
        setProgress(report.progress)
        setProgressText(report.text)
        
        // Record progress sample
        const now = Date.now()
        progressSamplesRef.current.push({
          timestamp: now,
          progress: report.progress,
        })
        
        // Keep only samples from the last 30 seconds to avoid memory buildup
        const cutoff = now - 30000
        progressSamplesRef.current = progressSamplesRef.current.filter(
          s => s.timestamp >= cutoff
        )
        
        // Calculate ETA based on recent progress rate
        const eta = calculateETA(progressSamplesRef.current, report.progress)
        setEstimatedTimeRemaining(eta)
      }

      // Use Web Worker to isolate WebLLM's WASM from Pyodide's WASM
      // This prevents the "VectorInt" binding error caused by WASM memory conflicts
      const newEngine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL('../workers/webllm.worker.ts', import.meta.url), { type: 'module' }),
        MODEL_ID,
        { initProgressCallback }
      )

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      engineRef.current = newEngine
      setEngine(newEngine)
      setStatus('ready')
      setProgress(1)
      setProgressText('Model loaded!')
      setEstimatedTimeRemaining(null)
    } catch (err) {
      // Stop timer on error
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      setStatus('error')
      console.error('web-llm loading error:', err)
    }
  }, [status])

  return {
    engine,
    status,
    progress,
    progressText,
    elapsedTime,
    estimatedTimeRemaining,
    error,
    loadModel,
  }
}

export { MODEL_ID }
