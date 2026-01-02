import { parseNetworkError } from '../lib/parseNetworkError'

export interface PandasErrorAlertProps {
  error: string | null
  onRetry: () => void
}

/**
 * Displays a PandasAI error alert with a retry button.
 * Uses parseNetworkError to provide user-friendly error messages.
 */
export function PandasErrorAlert({ error, onRetry }: PandasErrorAlertProps) {
  return (
    <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
      <div className="text-xs text-red-400 mb-2">
        {parseNetworkError(error)}
      </div>
      <button
        onClick={onRetry}
        className="w-full text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 px-3 py-1.5 rounded transition-colors font-medium"
      >
        Retry
      </button>
    </div>
  )
}

