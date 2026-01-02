import { MODEL_ID } from '../hooks/useWebLLM'
import type { SystemStatus } from '../hooks/useSidebarViewModel'
import { ModelLoadingProgress } from './ModelLoadingProgress'
import { PandasErrorAlert } from './PandasErrorAlert'

export interface SidebarHeaderProps {
  systemStatus: SystemStatus
  webllmStatus: 'idle' | 'loading' | 'ready' | 'error'
  webllmProgress: number
  webllmProgressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  pandasStatus: 'idle' | 'loading' | 'ready' | 'error'
  pandasError: string | null
  onRetryPandas: () => void
  onNewConversation: () => void
}

/**
 * Header section of the sidebar containing:
 * - Title and status badge
 * - Model loading progress (when loading)
 * - Model info (when ready)
 * - PandasAI error alert (when error)
 * - New Conversation button
 */
export function SidebarHeader({
  systemStatus,
  webllmStatus,
  webllmProgress,
  webllmProgressText,
  elapsedTime,
  estimatedTimeRemaining,
  pandasStatus,
  pandasError,
  onRetryPandas,
  onNewConversation,
}: SidebarHeaderProps) {
  return (
    <div className="p-4 border-b border-zinc-800">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <span className="text-2xl">📊</span>
        Data Analyst
      </h1>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={`w-2 h-2 rounded-full ${systemStatus.color}`} />
        <span className="text-zinc-400">{systemStatus.text}</span>
      </div>

      {/* Model loading progress */}
      {webllmStatus === 'loading' && (
        <ModelLoadingProgress
          progress={webllmProgress}
          progressText={webllmProgressText}
          elapsedTime={elapsedTime}
          estimatedTimeRemaining={estimatedTimeRemaining}
        />
      )}

      {/* Model info when ready */}
      {webllmStatus === 'ready' && (
        <div className="mt-2 text-xs text-zinc-500">
          Model: {MODEL_ID.split('-').slice(0, 3).join('-')}
        </div>
      )}

      {/* Error details and retry for PandasAI */}
      {pandasStatus === 'error' && (
        <PandasErrorAlert error={pandasError} onRetry={onRetryPandas} />
      )}

      {/* New Conversation button */}
      <button
        onClick={onNewConversation}
        className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors"
      >
        + New Conversation
      </button>
    </div>
  )
}

