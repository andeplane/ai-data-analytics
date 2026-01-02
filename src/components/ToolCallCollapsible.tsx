import { useState } from 'react'
import { usePart } from '@llamaindex/chat-ui'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ChartImage } from './ChartImage'

interface ToolCallPartData {
  toolName: string
  input: string
  code?: string
  language?: string
  result?: string
  chartPath?: string
}

/**
 * Collapsible component to display tool call executions.
 * Shows tool name and input in the header, with optional code display.
 * 
 * Uses the part context from @llamaindex/chat-ui to only render when the current part
 * is a tool-call part.
 */
export function ToolCallCollapsible() {
  const part = usePart('tool-call')
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  // Only render if current part is a tool-call part
  if (!part || part.type !== 'tool-call') return null

  // TypeScript doesn't know that tool-call parts have data, so we need to assert
  const data = (part as { type: 'tool-call'; data: ToolCallPartData }).data
  if (!data?.toolName || !data?.input) return null

  // Check if we have any details to show (code, result, or chart)
  const hasDetails = Boolean(data.code || data.result || data.chartPath)

  const handleCopy = async () => {
    if (!data.code) return
    try {
      await navigator.clipboard.writeText(data.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const headerText = `${data.toolName}: "${data.input}"`

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${data.toolName}` : `Expand ${data.toolName}`}
        >
          <svg
            className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          <span className="truncate">{headerText}</span>
        </button>
        {isExpanded && data.code && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors ml-2 flex-shrink-0"
            aria-label="Copy code"
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
                <span>Copy code</span>
              </>
            )}
          </button>
        )}
        {!isExpanded && hasDetails && (
          <button
            onClick={() => setIsExpanded(true)}
            className="text-xs text-zinc-400 hover:text-zinc-200 ml-2 flex-shrink-0 transition-colors"
            aria-label="Show details"
          >
            Show details
          </button>
        )}
      </div>

      {/* Details content */}
      {isExpanded && hasDetails && (
        <div className="border-t border-zinc-800">
          {/* Code section */}
          {data.code && (
            <div>
              <div className="px-4 py-2 text-xs font-medium text-zinc-400 bg-zinc-950 border-b border-zinc-800">
                Code
              </div>
              <SyntaxHighlighter
                language={data.language || 'python'}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  fontSize: '0.875rem',
                  background: '#09090b', // zinc-950
                  borderRadius: 0,
                }}
                showLineNumbers={false}
              >
                {data.code}
              </SyntaxHighlighter>
            </div>
          )}
          
          {/* Result section */}
          {(data.result || data.chartPath) && (
            <div>
              {(data.code || data.result) && (
                <div className="px-4 py-2 text-xs font-medium text-zinc-400 bg-zinc-950 border-b border-zinc-800">
                  Result
                </div>
              )}
              {data.result && (
                <div className="px-4 py-3 text-sm text-zinc-300 bg-zinc-950 whitespace-pre-wrap">
                  {data.result}
                </div>
              )}
              {data.chartPath && (
                <div className="px-4 py-3 bg-zinc-950">
                  <ChartImage src={data.chartPath} alt="Generated chart" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

