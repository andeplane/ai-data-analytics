import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm'

export interface LLMCallOptions {
  messages: ChatCompletionMessageParam[]
  temperature?: number
  max_tokens?: number
  source?: string // Where the call is coming from (e.g., "chat-ui", "pandasai")
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
    source = 'unknown',
  } = options

  // LOG EVERY SINGLE LLM CALL
  console.log('='.repeat(80))
  console.log(`🔥 LLM CALL [${source.toUpperCase()}]`)
  console.log('='.repeat(80))
  console.log('📤 REQUEST:')
  console.log(JSON.stringify({
    messages,
    temperature,
    max_tokens,
    source,
  }, null, 2))
  console.log('📤 MESSAGES BREAKDOWN:')
  messages.forEach((msg, idx) => {
    console.log(`  [${idx}] ${msg.role}: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : '[object]'}${typeof msg.content === 'string' && msg.content.length > 200 ? '...' : ''}`)
  })
  const totalChars = messages
    .map(m => typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length)
    .reduce((a, b) => a + b, 0)
  console.log(`📏 Total prompt length: ${totalChars} characters`)
  console.log('-'.repeat(80))

  const startTime = Date.now()

  try {
    const response = await engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
    })

    const duration = Date.now() - startTime
    const content = response.choices[0]?.message?.content || ''

    // LOG RESPONSE
    console.log('='.repeat(80))
    console.log(`✅ LLM RESPONSE [${source.toUpperCase()}]`)
    console.log('='.repeat(80))
    console.log('📥 FULL RESPONSE OBJECT:')
    console.log(JSON.stringify(response, null, 2))
    console.log('📥 RESPONSE CONTENT:')
    console.log(content)
    console.log(`📏 Response length: ${content.length} characters`)
    console.log(`⏱️ Duration: ${duration}ms`)
    if (response.usage) {
      console.log(`📊 Tokens: ${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion = ${response.usage.total_tokens} total`)
    }
    console.log('='.repeat(80))

    return content
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('='.repeat(80))
    console.error(`❌ LLM ERROR [${source.toUpperCase()}]`)
    console.error('='.repeat(80))
    console.error('Error:', error)
    console.error(`⏱️ Duration before error: ${duration}ms`)
    console.error('='.repeat(80))
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

  // LOG STREAMING CALL START
  console.log('='.repeat(80))
  console.log(`🔥 LLM STREAMING CALL [${source.toUpperCase()}]`)
  console.log('='.repeat(80))
  console.log('📤 REQUEST:')
  console.log(JSON.stringify({
    messages,
    temperature,
    max_tokens,
    source,
    stream: true,
  }, null, 2))
  console.log('📤 MESSAGES BREAKDOWN:')
  messages.forEach((msg, idx) => {
    console.log(`  [${idx}] ${msg.role}: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : '[object]'}${typeof msg.content === 'string' && msg.content.length > 200 ? '...' : ''}`)
  })
  const totalChars = messages
    .map(m => typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length)
    .reduce((a, b) => a + b, 0)
  console.log(`📏 Total prompt length: ${totalChars} characters`)
  console.log('-'.repeat(80))

  const startTime = Date.now()

  try {
    const stream = await engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
      stream: true,
    })

    let content = ''
    
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''
      if (delta) {
        content += delta
        yield delta
      }
    }

    const duration = Date.now() - startTime

    // LOG STREAMING COMPLETE
    console.log('='.repeat(80))
    console.log(`✅ LLM STREAMING COMPLETE [${source.toUpperCase()}]`)
    console.log('='.repeat(80))
    console.log('📥 FULL RESPONSE CONTENT:')
    console.log(content)
    console.log(`📏 Response length: ${content.length} characters`)
    console.log(`⏱️ Duration: ${duration}ms`)
    console.log('='.repeat(80))

    return content
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('='.repeat(80))
    console.error(`❌ LLM STREAMING ERROR [${source.toUpperCase()}]`)
    console.error('='.repeat(80))
    console.error('Error:', error)
    console.error(`⏱️ Duration before error: ${duration}ms`)
    console.error('='.repeat(80))
    throw error
  }
}

