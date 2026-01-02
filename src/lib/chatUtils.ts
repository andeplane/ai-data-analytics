import type { MessagePart } from '@llamaindex/chat-ui'
import type { ToolResult } from '../hooks/useToolExecutor'

/**
 * System loading state for tracking initialization progress.
 * Used by createLoadingPart and isSystemReady.
 */
export interface SystemLoadingState {
  webllmStatus: 'idle' | 'loading' | 'ready' | 'error'
  webllmProgress: number
  webllmProgressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  pyodideStatus: 'idle' | 'loading' | 'ready' | 'error'
  pandasStatus: 'idle' | 'loading' | 'ready' | 'error'
  hasQueuedFiles: boolean
  pyodideError?: string | null
  pandasError?: string | null
  onRetryPandas?: () => void
}

export interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

/**
 * Parse <tool_call> XML tags from the model's response content.
 * Hermes models output tool calls in this format:
 * <tool_call>
 * {"arguments": {...}, "name": "function_name"}
 * </tool_call>
 */
export function parseToolCalls(content: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = []

  // Match <tool_call>...</tool_call> blocks
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
  let match

  while ((match = regex.exec(content)) !== null) {
    try {
      const jsonStr = match[1].trim()
      const parsed = JSON.parse(jsonStr)

      // Handle both formats: {"arguments": {...}, "name": "..."} and {"name": "...", "arguments": {...}}
      if (parsed.name && parsed.arguments) {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments,
        })
      }
    } catch {
      // Silently skip malformed JSON - caller can check if array is empty
    }
  }

  return toolCalls
}

/**
 * Check if content contains tool calls
 */
export function hasToolCalls(content: string): boolean {
  return content.includes('<tool_call>') && content.includes('</tool_call>')
}

/**
 * Remove tool call XML tags from content for display
 */
export function removeToolCallsFromContent(content: string): string {
  return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim()
}

/**
 * Sanitize tool result for LLM consumption.
 * Removes chartPath (base64 image data) to avoid polluting the context window.
 * If an image was generated, adds a text message to inform the LLM.
 */
export function sanitizeToolResultForLLM(
  result: ToolResult
): Omit<ToolResult, 'chartPath'> {
  const { chartPath, ...sanitized } = result

  if (chartPath) {
    // Append message to inform the LLM that an image was shown to the user
    sanitized.result = `${sanitized.result}\n\n[An image/chart with the result has been displayed to the user.]`
  }

  return sanitized
}

/**
 * Extract text content from a Message's parts
 */
export function getTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter(
      (p): p is MessagePart & { type: 'text'; text: string } =>
        p.type === 'text' && 'text' in p
    )
    .map((p) => p.text)
    .join('\n')
}

/**
 * Generate a unique ID for messages and requests.
 * Combines timestamp with random string for guaranteed uniqueness.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Create a text message part compatible with @llamaindex/chat-ui
 */
export function createTextPart(text: string): MessagePart {
  return { type: 'text', text }
}

/**
 * Create a file/image message part compatible with @llamaindex/chat-ui
 */
export function createImagePart(imageUrl: string): MessagePart {
  return {
    type: 'data-file',
    data: {
      url: imageUrl,
      filename: 'chart.png',
      mediaType: 'image/png',
    },
  }
}

/**
 * Create a loading message part for displaying loading progress.
 * Uses a custom 'loading' type that can be handled by the UI.
 */
export function createLoadingPart(loadingState: SystemLoadingState): MessagePart {
  return {
    type: 'loading',
    loadingState,
  } as MessagePart
}

/**
 * Check if system is ready to process messages.
 * All components must be ready and no files pending upload.
 */
export function isSystemReady(loadingState: SystemLoadingState): boolean {
  return (
    loadingState.webllmStatus === 'ready' &&
    loadingState.pandasStatus === 'ready' &&
    !loadingState.hasQueuedFiles
  )
}

