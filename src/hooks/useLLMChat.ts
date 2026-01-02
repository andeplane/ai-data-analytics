import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import { buildSystemPrompt, type DataFrameInfo } from '../lib/systemPrompt'
import { useToolExecutor, type ToolResult } from './useToolExecutor'
import type { Message, MessagePart, ChatHandler } from '@llamaindex/chat-ui'
import { callLLMStreaming, type LLMCallOptions } from '../lib/llmCaller'
import type { PyodideProxy } from './usePyodide'
import {
  parseToolCalls,
  hasToolCalls,
  removeToolCallsFromContent,
  sanitizeToolResultForLLM,
  getTextFromParts,
  generateId,
  createTextPart,
  createImagePart,
  createLoadingPart,
  isSystemReady,
  type SystemLoadingState,
} from '../lib/chatUtils'

// Internal status includes 'awaiting-deps' for tracking queued messages
export type InternalChatStatus = 'ready' | 'submitted' | 'streaming' | 'awaiting-deps' | 'error'
// External status matches ChatHandler from @llamaindex/chat-ui
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export interface ToolCallProgress {
  id: string
  name: string
  question?: string  // Preview from arguments
  status: 'pending' | 'executing' | 'complete' | 'error'
  resultPreview?: string
}

// Re-export SystemLoadingState from chatUtils for backwards compatibility
export type { SystemLoadingState }

interface UseLLMChatOptions {
  pyodide: PyodideProxy | null
  engine: MLCEngineInterface | null
  dataframes: DataFrameInfo[]
  loadingState: SystemLoadingState
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
  
  const setMessages = useCallback((newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesInternal(newMessages)
  }, [])
  
  // Clear tool progress when messages are cleared
  useEffect(() => {
    if (messages.length === 0 && toolCallProgress.length > 0) {
      setToolCallProgress([])
    }
  }, [messages.length, toolCallProgress.length])
  
  // Map internal status to external ChatHandler-compatible status
  const status: ChatStatus = internalStatus === 'awaiting-deps' ? 'streaming' : internalStatus

  const { executeTool } = useToolExecutor({ pyodide })
  
  // Ref to track current assistant message ID for streaming updates
  const currentAssistantIdRef = useRef<string | null>(null)
  
  // Queue for messages waiting to be processed (supports multiple queued messages)
  // Stores the original message and the ID of the loading placeholder to remove when replaying
  const queuedMessagesRef = useRef<Array<{ message: Message; loadingId: string }>>([])
  
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

  // Ref to store sendMessage callback to avoid dependency issues in effects
  const sendMessageRef = useRef<((msg: Message) => Promise<void>) | null>(null)

  // Keep a ref with latest loading state for reading current values
  const loadingStateRef = useRef(loadingState)
  
  // Update ref whenever loadingState changes
  useEffect(() => {
    loadingStateRef.current = loadingState
  }, [loadingState])

  // Effect to update loading messages with current loading state (for all queued messages)
  useEffect(() => {
    if (queuedMessagesRef.current.length === 0 || isSystemReady(loadingState) || isProcessingRef.current) {
      return
    }
    
    const queuedLoadingIds = new Set(queuedMessagesRef.current.map(q => q.loadingId))
    
    setMessages((prev) =>
      prev.map((m) =>
        queuedLoadingIds.has(m.id)
          ? { ...m, parts: [createLoadingPart(loadingStateRef.current)] }
          : m
      )
    )
    // Only depend on status fields, not progress/elapsed time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingState.webllmStatus, loadingState.pandasStatus, loadingState.pyodideStatus, loadingState.hasQueuedFiles, setMessages])

  /**
   * Send a message and get a streaming response.
   * If system isn't ready, queues the message and shows loading state.
   * When system becomes ready, queued messages are replayed through this same function.
   * Compatible with @llamaindex/chat-ui ChatHandler interface.
   */
  const sendMessage = useCallback(
    async (msg: Message) => {
      const content = getTextFromParts(msg.parts)
      if (!content.trim()) return

      // Ensure message has an ID for consistent tracking
      const messageId = msg.id || generateId()
      if (!msg.id) {
        // Assign the generated ID to the message object so it's consistent when replaying
        msg.id = messageId
      }

      // Check if system is ready
      if (!isSystemReady(loadingState)) {
        // Queue the message and show loading state
        const loadingId = generateId()
        queuedMessagesRef.current.push({ message: msg, loadingId })
        setInternalStatus('awaiting-deps')

        // Add user message and loading assistant message placeholder
        setMessages((prev) => [
          ...prev,
          {
            id: messageId,
            role: 'user',
            parts: [createTextPart(content)],
          },
          {
            id: loadingId,
            role: 'assistant',
            parts: [createLoadingPart(loadingState)],
          },
        ])

        return
      }

      // System is ready, process immediately
      // Check if this message was already added (e.g., when it was queued)
      // If a message with this ID already exists, skip adding it
      const messageAlreadyExists = messages.some((m) => m.id === messageId)
      
      // Add user message to UI only if it doesn't already exist
      if (!messageAlreadyExists) {
        const userMessage: Message = {
          id: messageId,
          role: 'user',
          parts: [createTextPart(content)],
        }
        setMessages((prev) => [...prev, userMessage])
      }
      
      // Create assistant message placeholder
      const assistantId = generateId()
      currentAssistantIdRef.current = assistantId
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
  
  // Keep the ref updated with the latest callback
  // This allows the effect to call the latest version without having it in the dependency array
  useEffect(() => {
    sendMessageRef.current = sendMessage
  }, [sendMessage])

  // Effect to replay queued messages when system becomes ready (FIFO order)
  // Removes the loading placeholder and re-sends through the normal sendMessage path
  useEffect(() => {
    if (
      queuedMessagesRef.current.length > 0 &&
      isSystemReady(loadingState) &&
      !isProcessingRef.current &&
      sendMessageRef.current
    ) {
      // Shift the first message from the queue (FIFO)
      const queued = queuedMessagesRef.current.shift()!
      
      // Remove the loading placeholder message
      setMessages((prev) => prev.filter((m) => m.id !== queued.loadingId))
      
      // Re-send through the normal path (system is now ready, so it will process immediately)
      sendMessageRef.current(queued.message)
    }
  }, [loadingState, setMessages])

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
