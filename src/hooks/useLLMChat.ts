import { useState, useCallback, useMemo } from 'react'
import type { PyodideInterface } from 'pyodide'
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm'
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
  engine: MLCEngineInterface | null
  dataframes: DataFrameInfo[]
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Extract the output message from a ToolCallOutputParseError.
 * web-llm throws this when it tries to parse a normal response as a tool call.
 * The error message contains the actual output which we can extract.
 */
function extractMessageFromToolCallError(error: Error): string | null {
  const errorMsg = error.message
  // Error format: "...Got outputMessage: <actual message>\nGot error:..."
  const match = errorMsg.match(/Got outputMessage:\s*([\s\S]*?)(?:\nGot error:|$)/)
  if (match && match[1]) {
    return match[1].trim()
  }
  return null
}

/**
 * Check if an error is a ToolCallOutputParseError from web-llm
 */
function isToolCallParseError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('error encountered when parsing outputMessage for function calling')
  }
  return false
}

/**
 * Main LLM chat orchestration hook.
 * Handles conversation, tool calling, and response rendering.
 * Uses web-llm for local in-browser inference.
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
   * Call the local web-llm engine with messages and tools.
   */
  const callLLM = useCallback(
    async (conversationMessages: ChatCompletionMessageParam[]): Promise<LLMResponse> => {
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

      try {
        const response = await engine.chat.completions.create({
          messages: fullMessages,
          tools: dataframes.length > 0 ? tools : undefined,
          tool_choice: dataframes.length > 0 ? 'auto' : undefined,
          temperature: 0.7,
          max_tokens: 2000,
        })

        console.log('web-llm response:', JSON.stringify(response, null, 2))

        // Convert web-llm response format to our internal format
        const choice = response.choices[0]
        return {
          choices: [{
            message: {
              role: choice.message.role,
              content: choice.message.content,
              toolCalls: choice.message.tool_calls?.map(tc => ({
                id: tc.id,
                type: tc.type as 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              })),
            },
            finishReason: choice.finish_reason,
          }],
        }
      } catch (err) {
        // web-llm throws ToolCallOutputParseError when the model responds with
        // plain text instead of a tool call (which is valid behavior).
        // We extract the actual message from the error and return it.
        if (isToolCallParseError(err)) {
          console.log('Model responded with text instead of tool call, extracting message...')
          const extractedMessage = extractMessageFromToolCallError(err as Error)
          if (extractedMessage) {
            return {
              choices: [{
                message: {
                  role: 'assistant',
                  content: extractedMessage,
                  toolCalls: undefined,
                },
                finishReason: 'stop',
              }],
            }
          }
        }
        // Re-throw other errors
        throw err
      }
    },
    [engine, dataframes]
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
            content: choice.message.content || '',
            tool_calls: choice.message.toolCalls.map(tc => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          } as ChatCompletionMessageParam)

          // Add tool results to history
          for (const result of toolResults) {
            conversationHistory.push({
              role: 'tool',
              content: result.content,
              tool_call_id: result.toolCallId,
            } as ChatCompletionMessageParam)
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
