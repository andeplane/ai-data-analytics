import type { ToolCallProgress } from '../hooks/useLLMChat'

interface ThinkingMessageProps {
  toolCallProgress: ToolCallProgress[]
}

/**
 * Cursor-style thinking message that shows tool call progress.
 * Displays each tool call as it executes with status indicators and result previews.
 */
export function ThinkingMessage({ toolCallProgress }: ThinkingMessageProps) {
  const hasToolCalls = toolCallProgress.length > 0
  
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ToolCallItemProps {
  toolCall: ToolCallProgress
  index: number
}

function ToolCallItem({ toolCall, index }: ToolCallItemProps) {
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

