import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import type { ChatCompletionMessageParam, ResponseFormat } from '@mlc-ai/web-llm'
import type { LLMCallMetrics } from './analytics'

export interface LLMCallOptions {
  messages: ChatCompletionMessageParam[]
  temperature?: number
  max_tokens?: number
  response_format?: ResponseFormat
  source?: string // Where the call is coming from (e.g., "chat-ui", "pandasai")
  onMetrics?: (metrics: LLMCallMetrics) => void // Optional analytics callback
}

/**
 * UNIFIED LLM CALL INTERFACE
 * All LLM calls go through this function for consistent logging and behavior
 */
export async function callLLM(
  engine: MLCEngineInterface,
  options: LLMCallOptions
): Promise<string> {
  const {
    messages,
    temperature = 0.7,
    max_tokens = 2000,
    response_format,
    source = 'unknown',
  } = options

  // Extract last user message for summary
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find(msg => msg.role === 'user')
  const userMessagePreview = lastUserMessage && typeof lastUserMessage.content === 'string'
    ? lastUserMessage.content.substring(0, 80) + (lastUserMessage.content.length > 80 ? '...' : '')
    : `[${source.toUpperCase()}] LLM Call`

  // LOG SUMMARY
  console.log(`📤 User: ${userMessagePreview}`)
  
  // Collapsible details
  console.groupCollapsed(`📋 Full LLM Request Details [${source.toUpperCase()}]`)
  console.log('Request:', {
    messages,
    temperature,
    max_tokens,
    response_format,
    source,
  })
  const totalChars = messages
    .map(m => typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length)
    .reduce((a, b) => a + b, 0)
  console.log(`Total prompt length: ${totalChars} characters`)
  console.groupEnd()

  const startTime = Date.now()

  try {
    const response = await engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
      ...(response_format && { response_format }),
    })

    const duration = Date.now() - startTime
    const content = response.choices[0]?.message?.content || ''

    // LOG SUMMARY
    const contentPreview = content.substring(0, 100) + (content.length > 100 ? '...' : '')
    console.log(`📥 Response: ${contentPreview}`)
    
    // Collapsible details
    console.groupCollapsed(`📋 Full LLM Response Details [${source.toUpperCase()}]`)
    console.log('Full response object:', response)
    console.log('Full content:', content)
    console.log(`Response length: ${content.length} characters`)
    console.log(`Duration: ${duration}ms`)
    if (response.usage) {
      console.log(`Tokens: ${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion = ${response.usage.total_tokens} total`)
    }
    console.groupEnd()

    // Track metrics if callback provided
    if (options.onMetrics && response.usage) {
      options.onMetrics({
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
        durationMs: duration,
        source,
      })
    }

    return content
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`❌ LLM Error [${source.toUpperCase()}]:`, error instanceof Error ? error.message : String(error))
    console.groupCollapsed(`📋 Full Error Details [${source.toUpperCase()}]`)
    console.error('Error:', error)
    console.error(`Duration before error: ${duration}ms`)
    console.groupEnd()
    throw error
  }
}

/**
 * STREAMING LLM CALL INTERFACE
 * Async generator that yields tokens as they arrive.
 * Returns the full accumulated content when done.
 */
export async function* callLLMStreaming(
  engine: MLCEngineInterface,
  options: LLMCallOptions
): AsyncGenerator<string, string, unknown> {
  const {
    messages,
    temperature = 0.7,
    max_tokens = 2000,
    source = 'unknown',
  } = options

  // Extract last user message for summary
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find(msg => msg.role === 'user')
  const userMessagePreview = lastUserMessage && typeof lastUserMessage.content === 'string'
    ? lastUserMessage.content.substring(0, 80) + (lastUserMessage.content.length > 80 ? '...' : '')
    : `[${source.toUpperCase()}] LLM Streaming Call`

  // LOG SUMMARY
  console.log(`📤 User: ${userMessagePreview}`)
  
  // Collapsible details
  console.groupCollapsed(`📋 Full LLM Streaming Request Details [${source.toUpperCase()}]`)
  console.log('Request:', {
    messages,
    temperature,
    max_tokens,
    source,
    stream: true,
  })
  const totalChars = messages
    .map(m => typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length)
    .reduce((a, b) => a + b, 0)
  console.log(`Total prompt length: ${totalChars} characters`)
  console.groupEnd()

  const startTime = Date.now()
  let firstTokenTime: number | undefined = undefined

  try {
    const stream = await engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
      stream: true,
    })

    let content = ''
    let inputTokens = 0
    let outputTokens = 0
    
    for await (const chunk of stream) {
      // Track time to first token
      if (firstTokenTime === undefined && chunk.choices[0]?.delta?.content) {
        firstTokenTime = Date.now() - startTime
      }
      
      // Track token usage if available
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || 0
        outputTokens = chunk.usage.completion_tokens || 0
      }
      
      const delta = chunk.choices[0]?.delta?.content || ''
      if (delta) {
        content += delta
        yield delta
      }
    }

    const duration = Date.now() - startTime

    // LOG SUMMARY
    const contentPreview = content.substring(0, 100) + (content.length > 100 ? '...' : '')
    console.log(`📥 Response: ${contentPreview}`)
    
    // Collapsible details
    console.groupCollapsed(`📋 Full LLM Streaming Response Details [${source.toUpperCase()}]`)
    console.log('Full content:', content)
    console.log(`Response length: ${content.length} characters`)
    console.log(`Duration: ${duration}ms`)
    if (inputTokens > 0 || outputTokens > 0) {
      console.log(`Tokens: ${inputTokens} prompt + ${outputTokens} completion = ${inputTokens + outputTokens} total`)
    }
    console.groupEnd()

    // Track metrics if callback provided
    if (options.onMetrics && (inputTokens > 0 || outputTokens > 0)) {
      options.onMetrics({
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: duration,
        timeToFirstTokenMs: firstTokenTime,
        source,
      })
    }

    return content
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`❌ LLM Streaming Error [${source.toUpperCase()}]:`, error instanceof Error ? error.message : String(error))
    console.groupCollapsed(`📋 Full Error Details [${source.toUpperCase()}]`)
    console.error('Error:', error)
    console.error(`Duration before error: ${duration}ms`)
    console.groupEnd()
    throw error
  }
}

