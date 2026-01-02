import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import { buildSystemPrompt, type DataFrameInfo } from '../lib/systemPrompt'
import { useToolExecutor, type ToolResult } from './useToolExecutor'
import type { Message, MessagePart, ChatHandler } from '@llamaindex/chat-ui'
import { callLLMStreaming, type LLMCallOptions } from '../lib/llmCaller'
import type { WebLLMStatus } from './useWebLLM'
import type { PandasAIStatus } from './usePandasAI'
import type { PyodideStatus, PyodideProxy } from './usePyodide'

// Internal status includes 'awaiting-deps' for tracking queued messages
export type InternalChatStatus = 'ready' | 'submitted' | 'streaming' | 'awaiting-deps' | 'error'
// External status matches ChatHandler from @llamaindex/chat-ui
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ToolCallProgress {
  id: string
  name: string
  question?: string  // Preview from arguments
  status: 'pending' | 'executing' | 'complete' | 'error'
  resultPreview?: string
}

export interface SystemLoadingState {
  webllmStatus: WebLLMStatus
  webllmProgress: number
  webllmProgressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  pyodideStatus: PyodideStatus
  pandasStatus: PandasAIStatus
  hasQueuedFiles: boolean
  pyodideError?: string | null
  pandasError?: string | null
  onRetryPandas?: () => void
}

interface UseLLMChatOptions {
  pyodide: PyodideProxy | null
  engine: MLCEngineInterface | null
  dataframes: DataFrameInfo[]
  loadingState: SystemLoadingState
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
 * Create a loading message part for displaying loading progress
 */
function createLoadingPart(loadingState: SystemLoadingState): MessagePart {
  return {
    type: 'loading',
    loadingState,
  } as MessagePart
}

/**
 * Check if system is ready to process messages
 */
function isSystemReady(loadingState: SystemLoadingState): boolean {
  return (
    loadingState.webllmStatus === 'ready' &&
    loadingState.pandasStatus === 'ready' &&
    !loadingState.hasQueuedFiles
  )
}

/**
 * Main LLM chat orchestration hook.
 * Handles conversation, tool calling, and response rendering.
 * Uses web-llm for local in-browser inference with manual function calling.
 * Returns a ChatHandler compatible interface for use with @llamaindex/chat-ui.
 * 
 * Supports message queueing: if the system isn't ready when a message is sent,
 * the message is queued and a loading state is shown until dependencies are ready.
 */
export function useLLMChat({
  pyodide,
  engine,
  dataframes,
  loadingState,
}: UseLLMChatOptions): ChatHandler & {
  input: string
  setInput: (input: string) => void
  isLoading: boolean
  loadingState: SystemLoadingState
  toolCallProgress: ToolCallProgress[]
} {
  const [messages, setMessagesInternal] = useState<Message[]>([])
  const [internalStatus, setInternalStatus] = useState<InternalChatStatus>('ready')
  const [input, setInput] = useState('')
  const [toolCallProgress, setToolCallProgress] = useState<ToolCallProgress[]>([])
  
  // Wrap setMessages to automatically clear tool progress when conversation is reset
  const setMessages = useCallback((newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesInternal((prev) => {
      const result = typeof newMessages === 'function' ? newMessages(prev) : newMessages
      // If messages are being cleared, also clear tool progress
      if (result.length === 0) {
        setToolCallProgress([])
      }
      return result
    })
  }, [])
  
  // Map internal status to external ChatHandler-compatible status
  const status: ChatStatus = internalStatus === 'awaiting-deps' ? 'streaming' : internalStatus

  const { executeTool } = useToolExecutor({ pyodide })
  
  // Ref to track current assistant message ID for streaming updates
  const currentAssistantIdRef = useRef<string | null>(null)
  
  // Queue for messages waiting to be processed (supports multiple queued messages)
  const queuedMessagesRef = useRef<Array<{ userMessage: Message; assistantId: string }>>([])
  
  // Track if we're currently processing to avoid double-processing
  const isProcessingRef = useRef(false)

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
   * Process a queued message (called when system becomes ready)
   */
  const processQueuedMessage = useCallback(
    async (userMessage: Message, assistantId: string) => {
      if (!engine) {
        console.error('Cannot process message: web-llm engine not ready')
        
        // Update the loading message to show error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  parts: [
                    createTextPart(
                      'Sorry, the AI engine is not available. Please refresh the page and try again.'
                    ),
                  ],
                }
              : m
          )
        )
        
        setInternalStatus('error')
        isProcessingRef.current = false
        return
      }

      const content = getTextFromParts(userMessage.parts)
      isProcessingRef.current = true
      setInternalStatus('submitted')

      try {
        // Build conversation history for API (excluding the loading message)
        const conversationHistory: ChatCompletionMessageParam[] = messages
          .filter((m) => {
            // Skip the loading assistant message
            if (m.id === assistantId) return false
            // Skip messages with loading parts
            const hasLoadingPart = m.parts.some((p) => (p as { type: string }).type === 'loading')
            if (hasLoadingPart) return false
            return true
          })
          .map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: getTextFromParts(m.parts),
          }))

        // Add the user message
        conversationHistory.push({ role: 'user', content })

        // Track chart paths from tool results
        const chartPaths: string[] = []
        
        // Track if we've updated the assistant message yet
        let assistantMessageUpdated = false

        // Helper to update the assistant message content
        const updateAssistantMessage = (newContent: string) => {
          assistantMessageUpdated = true
          setInternalStatus('streaming')
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, parts: [createTextPart(newContent)] }
                : m
            )
          )
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

          // Add tool calls to progress with pending status
          const newProgress: ToolCallProgress[] = toolCalls.map((tc, idx) => ({
            id: `${Date.now()}-${idx}`,
            name: tc.name,
            question: typeof tc.arguments.question === 'string' ? tc.arguments.question : undefined,
            status: 'pending' as const,
          }))
          setToolCallProgress(prev => [...prev, ...newProgress])

          for (const tc of toolCalls) {
            const questionPreview = typeof tc.arguments.question === 'string'
              ? tc.arguments.question.substring(0, 60) + (tc.arguments.question.length > 60 ? '...' : '')
              : 'Tool call'
            console.log(`🔧 Tool: ${tc.name} - ${questionPreview}`)
            console.groupCollapsed(`📋 Full Tool Arguments [${tc.name}]`)
            console.log(tc.arguments)
            console.groupEnd()
          }

          // Process tool calls one by one with progress updates
          const toolResults: Array<{ name: string; result: ToolResult }> = []
          for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i]
            const progressId = newProgress[i].id
            
            // Mark as executing
            setToolCallProgress(prev => 
              prev.map(p => p.id === progressId ? { ...p, status: 'executing' as const } : p)
            )
            
            const result = await executeTool(toolCall.name, toolCall.arguments)
            toolResults.push({ name: toolCall.name, result })
            
            // Mark as complete with result preview
            const resultPreview = result.chartPath 
              ? 'Chart generated'
              : typeof result.result === 'string'
                ? result.result.substring(0, 100) + (result.result.length > 100 ? '...' : '')
                : 'Tool result'
            
            setToolCallProgress(prev => 
              prev.map(p => p.id === progressId ? { 
                ...p, 
                status: result.success ? 'complete' as const : 'error' as const,
                resultPreview 
              } : p)
            )
          }
          
          for (const { name, result } of toolResults) {
            const resultPreview = result.chartPath 
              ? 'Chart generated'
              : typeof result.result === 'string'
                ? result.result.substring(0, 60) + (result.result.length > 60 ? '...' : '')
                : 'Tool result'
            console.log(`✅ Tool Result [${name}]: ${resultPreview}`)
            console.groupCollapsed(`📋 Full Tool Response [${name}]`)
            console.log(result)
            console.groupEnd()
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
          const toolResponseContent = toolResults
            .map(({ name, result }) => 
              `<tool_response>\n{"name": "${name}", "content": ${JSON.stringify(sanitizeToolResultForLLM(result))}}\n</tool_response>`
            )
            .join('\n')
          
          conversationHistory.push({
            role: 'user',
            content: toolResponseContent,
          })

          // Stream next LLM response
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

        if (assistantMessageUpdated) {
          // Update existing message with final content
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, parts: assistantParts }
                : m
            )
          )
        } else {
          // Message was never updated - update it now
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, parts: assistantParts }
                : m
            )
          )
        }

        setInternalStatus('ready')
        setToolCallProgress([]) // Clear tool progress
        currentAssistantIdRef.current = null
        isProcessingRef.current = false
      } catch (err) {
        console.error('Chat error:', err)

        // Update the loading message to show error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  parts: [
                    createTextPart(
                      `Sorry, I encountered an error: ${err instanceof Error ? err.message : String(err)}`
                    ),
                  ],
                }
              : m
          )
        )

        setInternalStatus('error')
        setToolCallProgress([]) // Clear tool progress on error
        currentAssistantIdRef.current = null
        isProcessingRef.current = false
      }
    },
    [messages, streamLLMResponse, executeTool, engine, setMessages]
  )

  // Effect to process queued messages when system becomes ready (FIFO order)
  useEffect(() => {
    if (
      queuedMessagesRef.current.length > 0 &&
      isSystemReady(loadingState) &&
      !isProcessingRef.current
    ) {
      // Shift the first message from the queue (FIFO)
      const queued = queuedMessagesRef.current.shift()!
      processQueuedMessage(queued.userMessage, queued.assistantId)
    }
  }, [loadingState, processQueuedMessage])

  // Effect to update loading messages with current loading state (for all queued messages)
  useEffect(() => {
    if (queuedMessagesRef.current.length > 0 && !isSystemReady(loadingState) && !isProcessingRef.current) {
      // Get all assistant IDs from the queue
      const queuedAssistantIds = new Set(queuedMessagesRef.current.map(q => q.assistantId))
      
      // Update all loading messages with current loading state
      setMessages((prev) =>
        prev.map((m) =>
          queuedAssistantIds.has(m.id)
            ? { ...m, parts: [createLoadingPart(loadingState)] }
            : m
        )
      )
    }
  }, [loadingState, setMessages])

  /**
   * Send a message and get a streaming response.
   * If system isn't ready, queues the message and shows loading state.
   * Compatible with @llamaindex/chat-ui ChatHandler interface.
   */
  const sendMessage = useCallback(
    async (msg: Message) => {
      const content = getTextFromParts(msg.parts)
      if (!content.trim()) return

      // Add user message to UI
      const userMessage: Message = {
        id: msg.id || generateId(),
        role: 'user',
        parts: [createTextPart(content)],
      }

      // Create assistant message placeholder
      const assistantId = generateId()
      currentAssistantIdRef.current = assistantId

      // Check if system is ready
      if (!isSystemReady(loadingState)) {
        // Queue the message and show loading state
        queuedMessagesRef.current.push({ userMessage, assistantId })
        setInternalStatus('awaiting-deps')

        // Add user message and loading assistant message
        setMessages((prev) => [
          ...prev,
          userMessage,
          {
            id: assistantId,
            role: 'assistant',
            parts: [createLoadingPart(loadingState)],
          },
        ])

        return
      }

      // System is ready, process immediately
      setMessages((prev) => [...prev, userMessage])
      setInternalStatus('submitted')

      try {
        // Build conversation history for API
        const conversationHistory: ChatCompletionMessageParam[] = messages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: getTextFromParts(m.parts),
        }))

        // Add the new user message
        conversationHistory.push({ role: 'user', content })

        // Track chart paths from tool results
        const chartPaths: string[] = []
        
        // Track if we've shown the assistant message yet
        let assistantMessageShown = false

        // Helper to update the assistant message content
        const updateAssistantMessage = (newContent: string) => {
          if (!assistantMessageShown) {
            assistantMessageShown = true
            setInternalStatus('streaming')
            setMessages((prev) => [
              ...prev,
              {
                id: assistantId,
                role: 'assistant',
                parts: [createTextPart(newContent)],
              },
            ])
          } else {
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

          const toolCalls = parseToolCalls(responseContent)
          if (toolCalls.length === 0) break

          // Add tool calls to progress with pending status
          const newProgress: ToolCallProgress[] = toolCalls.map((tc, idx) => ({
            id: `${Date.now()}-${idx}`,
            name: tc.name,
            question: typeof tc.arguments.question === 'string' ? tc.arguments.question : undefined,
            status: 'pending' as const,
          }))
          setToolCallProgress(prev => [...prev, ...newProgress])

          for (const tc of toolCalls) {
            const questionPreview = typeof tc.arguments.question === 'string'
              ? tc.arguments.question.substring(0, 60) + (tc.arguments.question.length > 60 ? '...' : '')
              : 'Tool call'
            console.log(`🔧 Tool: ${tc.name} - ${questionPreview}`)
            console.groupCollapsed(`📋 Full Tool Arguments [${tc.name}]`)
            console.log(tc.arguments)
            console.groupEnd()
          }

          // Process tool calls one by one with progress updates
          const toolResults: Array<{ name: string; result: ToolResult }> = []
          for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i]
            const progressId = newProgress[i].id
            
            // Mark as executing
            setToolCallProgress(prev => 
              prev.map(p => p.id === progressId ? { ...p, status: 'executing' as const } : p)
            )
            
            const result = await executeTool(toolCall.name, toolCall.arguments)
            toolResults.push({ name: toolCall.name, result })
            
            // Mark as complete with result preview
            const resultPreview = result.chartPath 
              ? 'Chart generated'
              : typeof result.result === 'string'
                ? result.result.substring(0, 100) + (result.result.length > 100 ? '...' : '')
                : 'Tool result'
            
            setToolCallProgress(prev => 
              prev.map(p => p.id === progressId ? { 
                ...p, 
                status: result.success ? 'complete' as const : 'error' as const,
                resultPreview 
              } : p)
            )
          }
          
          for (const { name, result } of toolResults) {
            const resultPreview = result.chartPath 
              ? 'Chart generated'
              : typeof result.result === 'string'
                ? result.result.substring(0, 60) + (result.result.length > 60 ? '...' : '')
                : 'Tool result'
            console.log(`✅ Tool Result [${name}]: ${resultPreview}`)
            console.groupCollapsed(`📋 Full Tool Response [${name}]`)
            console.log(result)
            console.groupEnd()
          }

          for (const { result } of toolResults) {
            if (result.chartPath) {
              chartPaths.push(result.chartPath)
            }
          }

          conversationHistory.push({
            role: 'assistant',
            content: responseContent,
          })

          const toolResponseContent = toolResults
            .map(({ name, result }) => 
              `<tool_response>\n{"name": "${name}", "content": ${JSON.stringify(sanitizeToolResultForLLM(result))}}\n</tool_response>`
            )
            .join('\n')
          
          conversationHistory.push({
            role: 'user',
            content: toolResponseContent,
          })

          const streamResult = await streamLLMResponse(
            conversationHistory,
            updateAssistantMessage
          )
          responseContent = streamResult.content
          isToolCall = streamResult.isToolCall
        }

        const displayContent = removeToolCallsFromContent(responseContent) || responseContent

        const assistantParts: MessagePart[] = [createTextPart(displayContent)]
        for (const chartPath of chartPaths) {
          assistantParts.push(createImagePart(chartPath))
        }

        if (assistantMessageShown) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, parts: assistantParts }
                : m
            )
          )
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              parts: assistantParts,
            },
          ])
        }

        setInternalStatus('ready')
        setToolCallProgress([]) // Clear tool progress
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
        setInternalStatus('error')
        setToolCallProgress([]) // Clear tool progress on error
        currentAssistantIdRef.current = null
      }
    },
    [messages, streamLLMResponse, executeTool, loadingState, setMessages]
  )

  const stop = useCallback(async () => {
    setInternalStatus('ready')
  }, [])

  const isLoading = useMemo(
    () => internalStatus === 'submitted' || internalStatus === 'streaming' || internalStatus === 'awaiting-deps',
    [internalStatus]
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
    loadingState,
    toolCallProgress,
  }
}

export { generateId }
export type { Message, MessagePart }
