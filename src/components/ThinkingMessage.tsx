import { useState } from 'react'
import type { ToolCallProgress } from '../hooks/useLLMChat'
import type { PandasAIProgressStage } from '../hooks/usePyodide'

interface PandasAIProgress {
  stage: PandasAIProgressStage
  detail?: string
}

interface ThinkingMessageProps {
  toolCallProgress: ToolCallProgress[]
  pandasProgress?: PandasAIProgress | null
}

/**
 * Get human-readable label for a PandasAI progress stage.
 */
function getPandasProgressLabel(stage: PandasAIProgressStage): string {
  switch (stage) {
    case 'generating_code':
      return 'Generating Python code...'
    case 'code_generated':
      return 'Code generated'
    case 'executing_code':
      return 'Running code...'
    case 'code_executed':
      return 'Execution complete'
    case 'fixing_error':
      return 'Fixing error, retrying...'
    case 'retrying':
      return 'Retrying...'
    default:
      return 'Processing...'
  }
}

/**
 * Cursor-style thinking message that shows tool call progress.
 * Displays each tool call as it executes with status indicators and result previews.
 * Also shows PandasAI internal progress (generating code, executing, etc.)
 */
export function ThinkingMessage({ toolCallProgress, pandasProgress }: ThinkingMessageProps) {
  const hasToolCalls = toolCallProgress.length > 0
  const executingToolCall = toolCallProgress.find(tc => tc.status === 'executing')
  
  // Show pandas progress only when a tool is actively executing
  const showPandasProgress = executingToolCall && pandasProgress
  
  return (
    <div className="flex flex-col gap-3 max-w-lg">
      {/* Header with animated dots */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span 
            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" 
            style={{ animationDelay: '0ms' }} 
          />
          <span 
            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" 
            style={{ animationDelay: '150ms' }} 
          />
          <span 
            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" 
            style={{ animationDelay: '300ms' }} 
          />
        </div>
        <span className="text-sm text-zinc-400">
          {hasToolCalls ? 'Analyzing your data...' : 'Thinking...'}
        </span>
      </div>
      
      {/* Tool call list */}
      {hasToolCalls && (
        <div className="flex flex-col gap-2">
          {toolCallProgress.map((tc, index) => (
            <ToolCallItem 
              key={tc.id} 
              toolCall={tc} 
              index={index}
              pandasProgress={tc.id === executingToolCall?.id ? pandasProgress : null}
            />
          ))}
        </div>
      )}
      
      {/* Show pandas progress separately when no tool calls visible */}
      {!hasToolCalls && pandasProgress && (
        <PandasProgressIndicator progress={pandasProgress} />
      )}
    </div>
  )
}

interface PandasProgressIndicatorProps {
  progress: PandasAIProgress
}

/**
 * Shows the current PandasAI execution stage with appropriate icon and label.
 * When fixing errors or retrying, shows a tooltip with error details on hover.
 */
function PandasProgressIndicator({ progress }: PandasProgressIndicatorProps) {
  const [copied, setCopied] = useState(false)
  const label = getPandasProgressLabel(progress.stage)
  const isError = progress.stage === 'fixing_error'
  const isRetrying = progress.stage === 'retrying'
  const hasDetail = (isError || isRetrying) && progress.detail
  
  const handleCopy = async () => {
    if (!progress.detail) return
    try {
      // Copy header and detail text
      const headerText = isError ? 'Error Details:' : 'Retrying Details:'
      const textToCopy = `${headerText}\n\n${progress.detail}`
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }
  
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      {isError ? (
        <span className="text-amber-400">⚠</span>
      ) : (
        <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      )}
      {hasDetail ? (
        <div className="relative group">
          <span className={`cursor-help underline decoration-dotted ${
            isError ? 'text-amber-400 decoration-amber-400/50' : 'text-zinc-500 decoration-zinc-500/50'
          }`}>
            {label}
          </span>
          {/* Tooltip on hover - LARGE for full error visibility */}
          <div className="fixed bottom-20 left-4 right-4 hidden group-hover:block z-50">
            <div className="bg-zinc-900 border border-red-700 rounded-lg p-4 shadow-2xl max-w-4xl mx-auto relative">
              {/* Copy button in top right corner */}
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors shrink-0 z-10"
                aria-label="Copy all text"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>
              <div className={`text-sm font-bold mb-3 ${isError ? 'text-red-400' : 'text-zinc-400'}`}>
                {isError ? 'Error Details:' : 'Retrying Details:'}
              </div>
              <div className="text-sm text-zinc-200 font-mono whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto leading-relaxed bg-zinc-950 p-4 rounded border border-zinc-800">
                {progress.detail}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <span className={isError ? 'text-amber-400' : ''}>
          {label}
        </span>
      )}
    </div>
  )
}

interface ToolCallItemProps {
  toolCall: ToolCallProgress
  index: number
  pandasProgress?: PandasAIProgress | null
}

function ToolCallItem({ toolCall, index, pandasProgress }: ToolCallItemProps) {
  const isExecuting = toolCall.status === 'executing'
  const isComplete = toolCall.status === 'complete'
  const isError = toolCall.status === 'error'
  const isPending = toolCall.status === 'pending'
  
  // Get tool display name and icon
  const getToolDisplay = (name: string) => {
    switch (name) {
      case 'analyze_data':
        return { icon: '✨', label: 'Analyzing data' }
      default:
        return { icon: '🔧', label: name }
    }
  }
  
  const { icon, label } = getToolDisplay(toolCall.name)
  
  // Truncate question for display
  const questionPreview = toolCall.question
    ? toolCall.question.length > 80
      ? toolCall.question.substring(0, 80) + '...'
      : toolCall.question
    : null
  
  return (
    <div 
      className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-3 animate-fadeIn"
      style={{ 
        animationDelay: `${index * 100}ms`,
        animationFillMode: 'backwards'
      }}
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="shrink-0 mt-0.5">
          {isPending && (
            <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
          )}
          {isExecuting && (
            <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          )}
          {isComplete && (
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
          {isError && (
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
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">{icon}</span>
            <span className={`text-sm font-medium ${
              isExecuting ? 'text-blue-400' : 
              isComplete ? 'text-green-400' : 
              isError ? 'text-red-400' : 
              'text-zinc-400'
            }`}>
              {label}
            </span>
          </div>
          
          {/* Question preview */}
          {questionPreview && (
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              "{questionPreview}"
            </p>
          )}
          
          {/* PandasAI internal progress (shown when executing) */}
          {isExecuting && pandasProgress && (
            <div className="mt-2">
              <PandasProgressIndicator progress={pandasProgress} />
            </div>
          )}
          
          {/* Result preview (shown when complete) */}
          {(isComplete || isError) && toolCall.resultPreview && (
            <div className={`mt-2 text-xs px-2 py-1.5 rounded ${
              isError 
                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                : 'bg-green-500/10 text-green-400 border border-green-500/20'
            }`}>
              {toolCall.resultPreview.length > 120 
                ? toolCall.resultPreview.substring(0, 120) + '...'
                : toolCall.resultPreview
              }
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

