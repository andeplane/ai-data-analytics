import { useState, useCallback, useMemo } from 'react'
import type { PyodideInterface } from 'pyodide'
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import { buildSystemPrompt, type DataFrameInfo } from '../lib/systemPrompt'
import { useToolExecutor, type ToolResult } from './useToolExecutor'

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export interface MessagePart {
  type: 'text' | 'image'
  text?: string
  image?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]
}

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
 * Main LLM chat orchestration hook.
 * Handles conversation, tool calling, and response rendering.
 * Uses web-llm for local in-browser inference with manual function calling.
 */
export function useLLMChat({
  pyodide,
  engine,
  dataframes,
}: UseLLMChatOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [input, setInput] = useState('')

  const { executeTool } = useToolExecutor({ pyodide })

  /**
   * Call the local web-llm engine with messages.
   * Does NOT pass tools parameter - Hermes uses system prompt for tools.
   */
  const callLLM = useCallback(
    async (conversationMessages: ChatCompletionMessageParam[]): Promise<string> => {
      if (!engine) {
        throw new Error('web-llm engine not ready')
      }

      const systemPrompt = buildSystemPrompt(dataframes)

      // Build the full messages array with system prompt
      const fullMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
      ]

      console.log('Sending to web-llm:', JSON.stringify(fullMessages, null, 2))

      // No tools parameter - Hermes uses manual function calling via system prompt
      const response = await engine.chat.completions.create({
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 2000,
      })

      console.log('web-llm response:', JSON.stringify(response, null, 2))

      return response.choices[0]?.message?.content || ''
    },
    [engine, dataframes]
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
   * Send a message and get a response.
   * Uses manual function calling - parses <tool_call> tags from response content.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return
      if (!engine) {
        console.error('Cannot send message: web-llm engine not ready')
        return
      }

      // Add user message to UI
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        parts: [{ type: 'text', text: content }],
      }
      setMessages((prev) => [...prev, userMessage])
      setStatus('submitted')
      setInput('')

      try {
        // Build conversation history for API
        const conversationHistory: ChatCompletionMessageParam[] = messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n'),
        }))

        // Add the new user message
        conversationHistory.push({ role: 'user', content })

        // Call LLM
        let responseContent = await callLLM(conversationHistory)

        // Track chart path from tool results
        let chartPath: string | undefined

        // Handle tool calls (may need multiple rounds)
        let maxToolRounds = 5
        while (hasToolCalls(responseContent) && maxToolRounds > 0) {
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

          // Check for chart in tool results
          for (const { result } of toolResults) {
            if (result.chartPath) {
              chartPath = result.chartPath
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

          // Call LLM again with tool results
          responseContent = await callLLM(conversationHistory)
        }

        // Remove any remaining tool call tags from final response for display
        const displayContent = removeToolCallsFromContent(responseContent) || responseContent

        // Create assistant message
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          parts: chartPath
            ? [
                { type: 'text', text: displayContent },
                { type: 'image', image: chartPath },
              ]
            : [{ type: 'text', text: displayContent }],
        }

        setMessages((prev) => [...prev, assistantMessage])
        setStatus('ready')
      } catch (err) {
        console.error('Chat error:', err)

        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: `Sorry, I encountered an error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }

        setMessages((prev) => [...prev, errorMessage])
        setStatus('error')
      }
    },
    [messages, callLLM, processToolCalls, engine]
  )

  const stop = useCallback(() => {
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
