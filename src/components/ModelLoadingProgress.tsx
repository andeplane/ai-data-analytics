import { formatTime } from '../hooks/useWebLLM'

export interface ModelLoadingProgressProps {
  progress: number
  progressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
}

/**
 * Displays model loading progress with a progress bar, percentage,
 * elapsed time, and estimated time remaining.
 */
export function ModelLoadingProgress({
  progress,
  progressText,
  elapsedTime,
  estimatedTimeRemaining,
}: ModelLoadingProgressProps) {
  return (
    <div className="mt-3">
      <div className="text-xs text-zinc-500 mb-1 truncate" title={progressText}>
        {progressText}
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-500 mt-1">
        <span>{Math.round(progress * 100)}%</span>
        <span>
          {formatTime(elapsedTime)}
          {estimatedTimeRemaining !== null && (
            <span className="text-zinc-600"> • ETA {formatTime(estimatedTimeRemaining)}</span>
          )}
        </span>
      </div>
    </div>
  )
}

