import { useState } from 'react'
import { usePart } from '@llamaindex/chat-ui'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface CodePartData {
  code: string
  language: string
}

/**
 * Collapsible component to display executed Python code from PandasAI.
 * Similar to ChatGPT's "Analyzed" section, showing code that was executed.
 * 
 * Uses the part context from @llamaindex/chat-ui to only render when the current part
 * is a data-code part.
 */
export function AnalysisCodeCollapsible() {
  const part = usePart('data-code')
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  // Only render if current part is a code part
  if (!part || part.type !== 'data-code') return null

  const data = part.data as CodePartData
  if (!data?.code) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-4">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse analysis code' : 'Expand analysis code'}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
          <span>Analysis code</span>
        </div>
        {isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleCopy()
            }}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
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
      </button>

      {/* Code content */}
      {isExpanded && (
        <div className="border-t border-zinc-800">
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
    </div>
  )
}

