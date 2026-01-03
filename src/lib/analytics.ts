import { createContext, useContext, useMemo, createElement } from 'react'
import type { ReactNode } from 'react'
import mixpanel from 'mixpanel-browser'

const MIXPANEL_TOKEN = '764926f7d97049cbc037dbd9b00f5c45'
const STORAGE_KEY = 'data_analyst_user_id'

/**
 * Get or create a persistent user ID stored in localStorage
 * Returns a fallback ID if localStorage is unavailable (e.g., private browsing mode)
 */
export function getOrCreateUserId(): string {
  try {
    let userId = localStorage.getItem(STORAGE_KEY)
    if (!userId) {
      userId = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, userId)
    }
    return userId
  } catch (error) {
    // localStorage unavailable (private browsing, storage disabled, etc.)
    // Generate a session-only ID that won't persist
    console.warn('localStorage unavailable, using session-only user ID:', error)
    return `session-${crypto.randomUUID()}`
  }
}

/**
 * Check if we're running on localhost
 */
function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Initialize Mixpanel with the project token and user ID
 * Only initializes if not on localhost
 * Handles errors gracefully if localStorage is unavailable
 */
export function initializeMixpanel(): void {
  if (isLocalhost()) {
    console.log('🔕 Mixpanel disabled on localhost')
    return
  }
  
  try {
    mixpanel.init(MIXPANEL_TOKEN, {
      track_pageview: false, // We'll track pageviews manually if needed
      persistence: 'localStorage',
    })
    
    const userId = getOrCreateUserId()
    mixpanel.identify(userId)
  } catch (error) {
    // If Mixpanel initialization fails (e.g., localStorage issues), log but don't crash
    console.warn('Failed to initialize Mixpanel, analytics will be disabled:', error)
  }
}

export interface LLMCallMetrics {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
  timeToFirstTokenMs?: number
  source: string
}

export interface ToolCallMetrics {
  toolName: string
  inputArguments: Record<string, unknown>
  durationMs: number
  success: boolean
  // Error tracking fields
  errorMessage?: string      // Error message when success=false
  generatedCode?: string     // PandasAI generated Python code (useful for debugging)
}

export interface ChatMessageMetrics {
  threadLength: number
  totalTokensSoFar: number
  hasImages: boolean
}

export interface FileUploadMetrics {
  fileType: 'csv' | 'json'
  numRows: number
  numColumns: number
  fileName: string
  source: 'user_upload' | 'example_data'
}

export interface ExampleClickMetrics {
  type: 'example_data' | 'example_question'
  value: string
}

export interface ToolErrorMetrics {
  toolName: string
  errorMessage: string
  generatedCode?: string    // The Python code that caused the error
  question?: string         // The user's question that led to this error
}

export interface LLMErrorMetrics {
  source: string           // 'chat' | 'pandasai'
  errorMessage: string
  durationMs: number
}

export interface AnalyticsService {
  trackLLMCall(data: LLMCallMetrics): void
  trackToolCall(data: ToolCallMetrics): void
  trackToolError(data: ToolErrorMetrics): void
  trackLLMError(data: LLMErrorMetrics): void
  trackChatMessage(data: ChatMessageMetrics): void
  trackFileUpload(data: FileUploadMetrics): void
  trackExampleClick(data: ExampleClickMetrics): void
  trackNewConversation(): void
  trackRemoveDataframe(name: string): void
}

/**
 * No-op implementation for localhost/development
 */
const noOpAnalyticsService: AnalyticsService = {
  trackLLMCall: () => {},
  trackToolCall: () => {},
  trackToolError: () => {},
  trackLLMError: () => {},
  trackChatMessage: () => {},
  trackFileUpload: () => {},
  trackExampleClick: () => {},
  trackNewConversation: () => {},
  trackRemoveDataframe: () => {},
}

/**
 * Mixpanel implementation
 */
const mixpanelAnalyticsService: AnalyticsService = {
  trackLLMCall: (data: LLMCallMetrics) => {
    mixpanel.track('llm_call', {
      input_tokens: data.inputTokens,
      output_tokens: data.outputTokens,
      total_tokens: data.totalTokens,
      duration_ms: data.durationMs,
      time_to_first_token_ms: data.timeToFirstTokenMs,
      source: data.source,
    })
  },

  trackToolCall: (data: ToolCallMetrics) => {
    mixpanel.track('tool_call', {
      tool_name: data.toolName,
      input_arguments: data.inputArguments,
      duration_ms: data.durationMs,
      success: data.success,
      error_message: data.errorMessage,
      generated_code: data.generatedCode,
    })
  },

  trackToolError: (data: ToolErrorMetrics) => {
    mixpanel.track('tool_error', {
      tool_name: data.toolName,
      error_message: data.errorMessage,
      generated_code: data.generatedCode,
      question: data.question,
    })
  },

  trackLLMError: (data: LLMErrorMetrics) => {
    mixpanel.track('llm_error', {
      source: data.source,
      error_message: data.errorMessage,
      duration_ms: data.durationMs,
    })
  },

  trackChatMessage: (data: ChatMessageMetrics) => {
    mixpanel.track('chat_message', {
      thread_length: data.threadLength,
      total_tokens_so_far: data.totalTokensSoFar,
      has_images: data.hasImages,
    })
  },

  trackFileUpload: (data: FileUploadMetrics) => {
    mixpanel.track('file_upload', {
      file_type: data.fileType,
      num_rows: data.numRows,
      num_columns: data.numColumns,
      file_name: data.fileName,
      source: data.source,
    })
  },

  trackExampleClick: (data: ExampleClickMetrics) => {
    mixpanel.track('example_click', {
      type: data.type,
      value: data.value,
    })
  },

  trackNewConversation: () => {
    mixpanel.track('new_conversation')
  },

  trackRemoveDataframe: (name: string) => {
    mixpanel.track('remove_dataframe', {
      dataframe_name: name,
    })
  },
}

// Create analytics service based on environment
const createAnalyticsService = (): AnalyticsService => {
  return isLocalhost() ? noOpAnalyticsService : mixpanelAnalyticsService
}

// Default dependencies
const defaultDependencies = {
  analyticsService: createAnalyticsService(),
}

export type AnalyticsContextType = typeof defaultDependencies
export const AnalyticsContext = createContext<AnalyticsContextType>(defaultDependencies)

/**
 * Hook to access analytics service from context
 */
export function useAnalytics(): AnalyticsService {
  const { analyticsService } = useContext(AnalyticsContext)
  return analyticsService
}

/**
 * Analytics context provider component
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => defaultDependencies, [])
  
  return createElement(AnalyticsContext.Provider, { value }, children)
}

