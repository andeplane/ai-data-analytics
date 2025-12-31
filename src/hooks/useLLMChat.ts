import { useState, useCallback, useMemo } from 'react'
import type { PyodideInterface } from 'pyodide'
import { buildSystemPrompt, type DataFrameInfo } from '../lib/systemPrompt'
import { tools } from '../lib/tools'
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

interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// Message format for the API - supports both simple and tool-related messages
interface APIMessage {
  role: string
  content: string | null
  toolCalls?: ToolCall[]
  toolCallId?: string
}

interface LLMResponse {
  choices: Array<{
    message: {
      role: string
      content: string | null
      toolCalls?: ToolCall[]
    }
    finishReason: string
  }>
}

interface UseLLMChatOptions {
  pyodide: PyodideInterface | null
  apiUrl: string
  bearerToken: string
  dataframes: DataFrameInfo[]
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Main LLM chat orchestration hook.
 * Handles conversation, tool calling, and response rendering.
 */
export function useLLMChat({
  pyodide,
  apiUrl,
  bearerToken,
  dataframes,
}: UseLLMChatOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [input, setInput] = useState('')

  const { executeTool } = useToolExecutor({ pyodide })

  /**
   * Call the LLM API with messages and tools.
   */
  const callLLM = useCallback(
    async (conversationMessages: APIMessage[]): Promise<LLMResponse> => {
      const systemPrompt = buildSystemPrompt(dataframes)

      const payload = {
        model: 'azure/gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationMessages,
        ],
        tools: dataframes.length > 0 ? tools : undefined,
        temperature: 0.7,
        maxTokens: 2000,
      }

      console.log('Sending to LLM:', JSON.stringify(payload, null, 2))

      const authValue = bearerToken.startsWith('Bearer ')
        ? bearerToken
        : `Bearer ${bearerToken}`

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: authValue,
          'Content-Type': 'application/json',
          'cdf-version': 'alpha',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`LLM API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log('LLM response:', JSON.stringify(result, null, 2))
      return result
    },
    [apiUrl, bearerToken, dataframes]
  )

  /**
   * Process tool calls from LLM response.
   */
  const processToolCalls = useCallback(
    async (toolCalls: ToolCall[]): Promise<Array<{ role: string; content: string; toolCallId: string }>> => {
      const results: Array<{ role: string; content: string; toolCallId: string }> = []

      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments)
        const result: ToolResult = await executeTool(toolCall.function.name, args)

        results.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
        })
      }

      return results
    },
    [executeTool]
  )

  /**
   * Send a message and get a response.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return

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
        const conversationHistory: APIMessage[] = messages.map((msg) => ({
          role: msg.role,
          content: msg.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n'),
        }))

        // Add the new user message
        conversationHistory.push({ role: 'user', content })

        // Call LLM
        let response = await callLLM(conversationHistory)
        let choice = response.choices[0]

        // Track chart path from tool results
        let chartPath: string | undefined

        // Handle tool calls (may need multiple rounds)
        let maxToolRounds = 5
        while (choice.message.toolCalls && choice.message.toolCalls.length > 0 && maxToolRounds > 0) {
          maxToolRounds--

          // Process all tool calls
          const toolResults = await processToolCalls(choice.message.toolCalls)

          // Check for chart in tool results
          for (const result of toolResults) {
            try {
              const parsed = JSON.parse(result.content)
              if (parsed.chartPath) {
                chartPath = parsed.chartPath
              }
            } catch {
              // Ignore
            }
          }

          // Add assistant message with tool calls to history
          conversationHistory.push({
            role: 'assistant',
            content: choice.message.content,
            toolCalls: choice.message.toolCalls,
          })

          // Add tool results to history
          for (const result of toolResults) {
            conversationHistory.push({
              role: 'tool',
              content: result.content,
              toolCallId: result.toolCallId,
            })
          }

          // Call LLM again with tool results
          response = await callLLM(conversationHistory)
          choice = response.choices[0]
        }

        // Extract final response content
        const responseContent = choice.message.content || ''

        // Create assistant message
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          parts: chartPath
            ? [
                { type: 'text', text: responseContent },
                { type: 'image', image: chartPath },
              ]
            : [{ type: 'text', text: responseContent }],
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
    [messages, callLLM, processToolCalls, executeTool]
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

