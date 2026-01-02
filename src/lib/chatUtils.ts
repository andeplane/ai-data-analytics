import type { MessagePart } from '@llamaindex/chat-ui'
import type { ToolResult } from '../hooks/useToolExecutor'

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

