import { formatTime } from '../hooks/useWebLLM'
import type { WebLLMStatus } from '../hooks/useWebLLM'
import type { PandasAIStatus } from '../hooks/usePandasAI'
import type { PyodideStatus } from '../hooks/usePyodide'

interface LoadingStep {
  label: string
  status: 'pending' | 'loading' | 'complete' | 'error'
  progress?: number
  detail?: string
  error?: string
  onRetry?: () => void
}

interface LoadingMessageProps {
  webllmStatus: WebLLMStatus
  webllmProgress: number
  webllmProgressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  pyodideStatus: PyodideStatus
  pandasStatus: PandasAIStatus
  hasQueuedFiles: boolean
  pyodideError?: string | null
  pandasError?: string | null
  onRetryPandas?: () => void
}

function getStepStatus(
  status: 'idle' | 'loading' | 'ready' | 'error'
): LoadingStep['status'] {
  switch (status) {
    case 'idle':
      return 'pending'
    case 'loading':
      return 'loading'
    case 'ready':
      return 'complete'
    case 'error':
      return 'error'
  }
}

/**
 * Parse error message to provide user-friendly network error messages
 */
function parseErrorMessage(error: string | null | undefined): string | undefined {
  if (!error) return undefined
  
  const errorLower = error.toLowerCase()
  if (
    errorLower.includes('aborterror') ||
    errorLower.includes('failed to fetch') ||
    errorLower.includes('networkerror') ||
    errorLower.includes('network request failed')
  ) {
    return 'Network connection failed. Please check your internet and try again.'
  }
  
  return error
}

export function LoadingMessage({
  webllmStatus,
  webllmProgress,
  webllmProgressText,
  elapsedTime,
  estimatedTimeRemaining,
  pyodideStatus,
  pandasStatus,
  hasQueuedFiles,
  pyodideError,
  pandasError,
  onRetryPandas,
}: LoadingMessageProps) {
  // Build loading steps
  const steps: LoadingStep[] = [
    {
      label: 'Loading AI Model',
      status: getStepStatus(webllmStatus),
      progress: webllmStatus === 'loading' ? webllmProgress : undefined,
      detail:
        webllmStatus === 'loading'
          ? webllmProgressText
          : webllmStatus === 'ready'
          ? 'Model ready'
          : undefined,
    },
    {
      label: 'Loading Python Runtime',
      status: getStepStatus(pyodideStatus),
      detail:
        pyodideStatus === 'ready'
          ? 'Python ready'
          : pyodideStatus === 'loading'
          ? 'Initializing Pyodide...'
          : undefined,
      error: parseErrorMessage(pyodideError),
    },
    {
      label: 'Loading PandasAI',
      status:
        pyodideStatus !== 'ready'
          ? 'pending'
          : getStepStatus(pandasStatus),
      detail:
        pandasStatus === 'ready'
          ? 'PandasAI ready'
          : pandasStatus === 'loading'
          ? 'Installing packages...'
          : undefined,
      error: parseErrorMessage(pandasError),
      onRetry: pandasStatus === 'error' && onRetryPandas ? onRetryPandas : undefined,
    },
  ]

  // Add data files step only if there are queued files
  if (hasQueuedFiles) {
    steps.push({
      label: 'Processing Data Files',
      status: pandasStatus === 'ready' ? 'loading' : 'pending',
      detail: 'Parsing uploaded files...',
    })
  }

  const allComplete = steps.every((s) => s.status === 'complete')

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 max-w-md">
      <div className="flex items-center gap-3 mb-4">
        {!allComplete && (
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full shrink-0" />
        )}
        <span className="text-sm text-zinc-300">
          {allComplete
            ? 'Ready to respond!'
            : 'Getting everything ready...'}
        </span>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {step.status === 'pending' && (
                <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
              )}
              {step.status === 'loading' && (
                <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              )}
              {step.status === 'complete' && (
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
              {step.status === 'error' && (
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm font-medium ${
                  step.status === 'loading'
                    ? 'text-blue-400'
                    : step.status === 'complete'
                    ? 'text-green-400'
                    : step.status === 'error'
                    ? 'text-red-400'
                    : 'text-zinc-500'
                }`}
              >
                {step.label}
              </div>
              {step.detail && (
                <div className="text-xs text-zinc-500 mt-0.5 truncate">
                  {step.detail}
                </div>
              )}
              {step.error && (
                <div className="mt-1.5">
                  <div className="text-xs text-red-400 mb-1.5">
                    {step.error}
                  </div>
                  {step.onRetry && (
                    <button
                      onClick={step.onRetry}
                      className="text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 px-2.5 py-1 rounded transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
              {/* Progress bar for LLM loading */}
              {step.status === 'loading' && step.progress !== undefined && (
                <div className="mt-2">
                  <div className="w-full bg-zinc-700 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(step.progress * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500 mt-1">
                    <span>{Math.round(step.progress * 100)}%</span>
                    <span>
                      {formatTime(elapsedTime)}
                      {estimatedTimeRemaining !== null && (
                        <span className="text-zinc-600">
                          {' '}
                          • ETA {formatTime(estimatedTimeRemaining)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

