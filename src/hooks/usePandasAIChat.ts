import { useState, useCallback, useMemo } from 'react'
import type { PyodideInterface } from 'pyodide'
import type { Message, ChatHandler } from '@llamaindex/chat-ui'

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

interface UsePandasAIChatOptions {
  pyodide: PyodideInterface | null
  activeDataframe: string | null
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export function usePandasAIChat({ pyodide, activeDataframe }: UsePandasAIChatOptions): ChatHandler & {
  input: string
  setInput: (input: string) => void
  isLoading: boolean
} {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [input, setInput] = useState('')

  const sendMessage = useCallback(
    async (msg: Message) => {
      if (!pyodide || !activeDataframe) {
        console.error('Pyodide or activeDataframe not available')
        return
      }

      // Extract text from the message
      const textPart = msg.parts.find((p) => p.type === 'text')
      const question = textPart && 'text' in textPart ? textPart.text : ''
      if (!question) return

      // Add user message
      setMessages((prev) => [...prev, msg])
      setStatus('submitted')

      try {
        // Escape for Python strings
        const escapedName = activeDataframe.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const escapedQuestion = question.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

        // Call PandasAI chat
        const result = await pyodide.runPythonAsync(`
result = dataframes["${escapedName}"].chat("${escapedQuestion}")
str(result)
`)

        const responseText = String(result)

        // Create assistant message
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          parts: [{ type: 'text', text: responseText }],
        }

        setMessages((prev) => [...prev, assistantMessage])
        setStatus('ready')
      } catch (err) {
        console.error('Chat error:', err)
        
        // Create error message
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          parts: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        }

        setMessages((prev) => [...prev, errorMessage])
        setStatus('error')
      }
    },
    [pyodide, activeDataframe]
  )

  const stop = useCallback(async () => {
    // No-op for now - PandasAI calls are synchronous in Pyodide
    setStatus('ready')
  }, [])

  const isLoading = useMemo(() => status === 'submitted' || status === 'streaming', [status])

  return {
    messages,
    status,
    sendMessage,
    stop,
    setMessages,
    input,
    setInput,
    isLoading,
  }
}

export { generateId }
export type { Message }
