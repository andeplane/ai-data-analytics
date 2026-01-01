import { useState, useCallback, useMemo, useRef } from 'react'
import type { PyodideInterface } from 'pyodide'
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import { buildSystemPrompt, type DataFrameInfo } from '../lib/systemPrompt'
import { useToolExecutor, type ToolResult } from './useToolExecutor'
import type { Message, MessagePart, ChatHandler } from '@llamaindex/chat-ui'
import { callLLMStreaming, type LLMCallOptions } from '../lib/llmCaller'

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

interface UseLLMChatOptions {
  pyodide: PyodideInterface | null
  engine: MLCEngineInterface | null
  dataframes: DataFrameInfo[]
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Parse <tool_call> XML tags from the model's response content.
 * Hermes models output tool calls in this format:
 * <tool_call>
 * {"arguments": {...}, "name": "function_name"}
 * </tool_call>
 */
function parseToolCalls(content: string): ParsedToolCall[] {
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
    } catch (e) {
      console.warn('Failed to parse tool call JSON:', match[1], e)
    }
  }
  
  return toolCalls
}

/**
 * Check if content contains tool calls
 */
function hasToolCalls(content: string): boolean {
  return content.includes('<tool_call>') && content.includes('</tool_call>')
}

/**
 * Remove tool call XML tags from content for display
 */
function removeToolCallsFromContent(content: string): string {
  return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim()
}

/**
 * Sanitize tool result for LLM consumption.
 * Removes chartPath (base64 image data) to avoid polluting the context window.
 * If an image was generated, adds a text message to inform the LLM.
 */
function sanitizeToolResultForLLM(result: ToolResult): Omit<ToolResult, 'chartPath'> {
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
function getTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p): p is MessagePart & { type: 'text'; text: string } => p.type === 'text' && 'text' in p)
    .map((p) => p.text)
    .join('\n')
}

/**
 * Create a text message part compatible with @llamaindex/chat-ui
 */
function createTextPart(text: string): MessagePart {
  return { type: 'text', text }
}

/**
 * Create a file/image message part compatible with @llamaindex/chat-ui
 */
function createImagePart(imageUrl: string): MessagePart {
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
 * Main LLM chat orchestration hook.
 * Handles conversation, tool calling, and response rendering.
 * Uses web-llm for local in-browser inference with manual function calling.
 * Returns a ChatHandler compatible interface for use with @llamaindex/chat-ui.
 */
export function useLLMChat({
  pyodide,
  engine,
  dataframes,
}: UseLLMChatOptions): ChatHandler & {
  input: string
  setInput: (input: string) => void
  isLoading: boolean
} {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [input, setInput] = useState('')

  const { executeTool } = useToolExecutor({ pyodide })
  
  // Ref to track current assistant message ID for streaming updates
  const currentAssistantIdRef = useRef<string | null>(null)

  /**
   * Build LLM call options with system prompt prepended.
   */
  const buildLLMOptions = useCallback(
    (conversationMessages: ChatCompletionMessageParam[]): LLMCallOptions => {
      const systemPrompt = buildSystemPrompt(dataframes)
      const fullMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
      ]
      return {
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 2000,
        source: 'chat-ui',
      }
    },
    [dataframes]
  )

  /**
   * Stream LLM response with tool call detection.
   * If response starts with <tool_call>, accumulates silently and doesn't update UI.
   * Otherwise, streams tokens to UI via onUpdate callback.
   * Returns the full content and whether it's a tool call.
   */
  const streamLLMResponse = useCallback(
    async (
      conversationMessages: ChatCompletionMessageParam[],
      onUpdate: (content: string) => void
    ): Promise<{ content: string; isToolCall: boolean }> => {
      if (!engine) {
        throw new Error('web-llm engine not ready')
      }

      const options = buildLLMOptions(conversationMessages)
      let content = ''
      let detectedToolCall = false
      const TOOL_CALL_PREFIX = '<tool_call>'

      const generator = callLLMStreaming(engine, options)
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value: token, done } = await generator.next()
        
        if (done) {
          // Generator returned final content
          if (typeof token === 'string') {
            content = token
          }
          break
        }
        
        if (typeof token === 'string') {
          content += token
          
          // Check for tool call prefix once we have enough characters
          if (!detectedToolCall && content.length >= TOOL_CALL_PREFIX.length) {
            if (content.trimStart().startsWith(TOOL_CALL_PREFIX)) {
              detectedToolCall = true
              console.log('🔧 Tool call detected, accumulating silently...')
              // Don't update UI for tool calls
            }
          }
          
          // Only stream to UI if not a tool call
          if (!detectedToolCall) {
            onUpdate(content)
          }
        }
      }

      // Final check for tool calls anywhere in the content
      const hasToolCallsInContent = hasToolCalls(content)
      
      return { 
        content, 
        isToolCall: detectedToolCall || hasToolCallsInContent 
      }
    },
    [engine, buildLLMOptions]
  )

  /**
   * Process parsed tool calls and return results.
   */
  const processToolCalls = useCallback(
    async (toolCalls: ParsedToolCall[]): Promise<Array<{ name: string; result: ToolResult }>> => {
      const results: Array<{ name: string; result: ToolResult }> = []

      for (const toolCall of toolCalls) {
        const result: ToolResult = await executeTool(toolCall.name, toolCall.arguments)
        results.push({ name: toolCall.name, result })
      }

      return results
    },
    [executeTool]
  )

  /**
   * Send a message and get a streaming response.
   * Uses streaming with tool call detection:
   * - If response starts with <tool_call>, accumulates silently and processes tools
   * - Otherwise, streams tokens to UI progressively
   * Compatible with @llamaindex/chat-ui ChatHandler interface.
   */
  const sendMessage = useCallback(
    async (msg: Message) => {
      const content = getTextFromParts(msg.parts)
      if (!content.trim()) return
      if (!engine) {
        console.error('Cannot send message: web-llm engine not ready')
        return
      }

      // Add user message to UI
      const userMessage: Message = {
        id: msg.id || generateId(),
        role: 'user',
        parts: [createTextPart(content)],
      }
      setMessages((prev) => [...prev, userMessage])
      setStatus('submitted')

      // Create assistant message placeholder for streaming
      const assistantId = generateId()
      currentAssistantIdRef.current = assistantId

      try {
        // Build conversation history for API
        const conversationHistory: ChatCompletionMessageParam[] = messages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: getTextFromParts(m.parts),
        }))

        // Add the new user message
        conversationHistory.push({ role: 'user', content })

        // Track chart paths from tool results (can have multiple charts)
        const chartPaths: string[] = []
        
        // Track if we've shown the assistant message yet
        let assistantMessageShown = false

        // Helper to update the assistant message content
        const updateAssistantMessage = (newContent: string) => {
          if (!assistantMessageShown) {
            // First update - add the assistant message
            assistantMessageShown = true
            setStatus('streaming')
            setMessages((prev) => [
              ...prev,
              {
                id: assistantId,
                role: 'assistant',
                parts: [createTextPart(newContent)],
              },
            ])
          } else {
            // Subsequent updates - update existing message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, parts: [createTextPart(newContent)] }
                  : m
              )
            )
          }
        }

        // Stream first LLM response
        let { content: responseContent, isToolCall } = await streamLLMResponse(
          conversationHistory,
          updateAssistantMessage
        )

        // Handle tool calls (may need multiple rounds)
        let maxToolRounds = 5
        while (isToolCall && maxToolRounds > 0) {
          maxToolRounds--

          // Parse tool calls from response
          const toolCalls = parseToolCalls(responseContent)
          
          if (toolCalls.length === 0) break

          for (const tc of toolCalls) {
            console.log(`🔧 CALLING TOOL: ${tc.name}`, tc.arguments)
          }

          // Process all tool calls
          const toolResults = await processToolCalls(toolCalls)
          
          for (const { name, result } of toolResults) {
            console.log(`✅ TOOL RESPONSE [${name}]:`, result)
          }

          // Collect all charts from tool results
          for (const { result } of toolResults) {
            if (result.chartPath) {
              chartPaths.push(result.chartPath)
            }
          }

          // Add assistant response with tool calls to history
          conversationHistory.push({
            role: 'assistant',
            content: responseContent,
          })

          // Build tool response in Hermes format and add to history
          // Use 'user' role since 'tool' role requires automatic function calling mode
          // The model identifies tool responses by the <tool_response> tags, not the role
          // Use sanitized results to avoid sending base64 image data to the LLM
          const toolResponseContent = toolResults
            .map(({ name, result }) => 
              `<tool_response>\n{"name": "${name}", "content": ${JSON.stringify(sanitizeToolResultForLLM(result))}}\n</tool_response>`
            )
            .join('\n')
          
          conversationHistory.push({
            role: 'user',
            content: toolResponseContent,
          })

          // Stream next LLM response (same logic - will show if not a tool call)
          const streamResult = await streamLLMResponse(
            conversationHistory,
            updateAssistantMessage
          )
          responseContent = streamResult.content
          isToolCall = streamResult.isToolCall
        }

        // Remove any remaining tool call tags from final response for display
        const displayContent = removeToolCallsFromContent(responseContent) || responseContent

        // Finalize assistant message with final content and all charts
        const assistantParts: MessagePart[] = [createTextPart(displayContent)]
        for (const chartPath of chartPaths) {
          assistantParts.push(createImagePart(chartPath))
        }

        if (assistantMessageShown) {
          // Update existing message with final content (including chart if any)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, parts: assistantParts }
                : m
            )
          )
        } else {
          // Message was never shown (all responses were tool calls?) - add it now
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              parts: assistantParts,
            },
          ])
        }

        setStatus('ready')
        currentAssistantIdRef.current = null
      } catch (err) {
        console.error('Chat error:', err)

        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          parts: [
            createTextPart(`Sorry, I encountered an error: ${err instanceof Error ? err.message : String(err)}`),
          ],
        }

        setMessages((prev) => [...prev, errorMessage])
        setStatus('error')
        currentAssistantIdRef.current = null
      }
    },
    [messages, streamLLMResponse, processToolCalls, engine]
  )

  const stop = useCallback(async () => {
    // For now, just reset status - actual cancellation would require AbortController
    setStatus('ready')
  }, [])

  const isLoading = useMemo(
    () => status === 'submitted' || status === 'streaming',
    [status]
  )

  return {
    messages,
    setMessages,
    status,
    sendMessage,
    stop,
    input,
    setInput,
    isLoading,
  }
}

export { generateId }
export type { Message, MessagePart }
