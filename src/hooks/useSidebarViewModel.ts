import { createContext, useCallback, useContext, useMemo } from 'react'
import { useAnalytics, type AnalyticsService } from '../lib/analytics'
import type { WebLLMStatus } from './useWebLLM'

export interface SystemStatus {
  text: string
  color: string
}

export interface DataFrameDisplay {
  name: string
  rows: number
  columns: string[]
}

export interface SidebarViewModelProps {
  webllmStatus: WebLLMStatus
  webllmProgress: number
  webllmProgressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  webllmError: string | null
  pyodideStatus: 'idle' | 'loading' | 'ready' | 'error'
  pandasStatus: 'idle' | 'loading' | 'ready' | 'error'
  pandasError: string | null
  hasQueuedFiles: boolean
  dataframes: DataFrameDisplay[]
  setMessages?: (messages: []) => void
  retryPandasAI: () => void
  removeDataframe: (name: string) => Promise<void>
}

export interface SidebarViewModel {
  // Status
  systemStatus: SystemStatus
  isSystemReady: boolean
  
  // WebLLM loading state
  webllmStatus: WebLLMStatus
  webllmProgress: number
  webllmProgressText: string
  elapsedTime: number
  estimatedTimeRemaining: number | null
  webllmError: string | null
  
  // PandasAI state
  pandasStatus: 'idle' | 'loading' | 'ready' | 'error'
  pandasError: string | null
  onRetryPandas: () => void
  
  // Data
  dataframes: DataFrameDisplay[]
  
  // Actions
  onNewConversation: () => void
  onRemoveDataframe: (name: string) => Promise<void>
}

// Default dependencies for production
const defaultDependencies = {
  useAnalytics: useAnalytics,
}

export type UseSidebarViewModelContextType = typeof defaultDependencies

export const UseSidebarViewModelContext = createContext<UseSidebarViewModelContextType>(defaultDependencies)

/**
 * Compute the system status from loading states
 */
function computeSystemStatus(
  webllmStatus: WebLLMStatus,
  webllmError: string | null,
  pyodideStatus: string,
  pandasStatus: string
): SystemStatus {
  if (webllmStatus === 'loading') {
    return { text: 'Loading AI model...', color: 'bg-yellow-500 animate-pulse' }
  }
  if (webllmStatus === 'error') {
    return { text: `Model error: ${webllmError}`, color: 'bg-red-500' }
  }
  if (pyodideStatus !== 'ready') {
    return { text: 'Loading Python...', color: 'bg-yellow-500 animate-pulse' }
  }
  if (pandasStatus === 'loading') {
    return { text: 'Loading PandasAI...', color: 'bg-yellow-500 animate-pulse' }
  }
  if (pandasStatus === 'error') {
    return { text: 'PandasAI Error', color: 'bg-red-500' }
  }
  if (pandasStatus === 'ready' && webllmStatus === 'ready') {
    return { text: 'Ready', color: 'bg-green-500' }
  }
  return { text: 'Initializing...', color: 'bg-yellow-500 animate-pulse' }
}

/**
 * ViewModel hook for the Sidebar component.
 * Separates presentation logic from state management for testability.
 */
export function useSidebarViewModel(props: SidebarViewModelProps): SidebarViewModel {
  const { useAnalytics: useAnalyticsDep } = useContext(UseSidebarViewModelContext)
  const analytics: AnalyticsService = useAnalyticsDep()

  const {
    webllmStatus,
    webllmProgress,
    webllmProgressText,
    elapsedTime,
    estimatedTimeRemaining,
    webllmError,
    pyodideStatus,
    pandasStatus,
    pandasError,
    hasQueuedFiles,
    dataframes,
    setMessages,
    retryPandasAI,
    removeDataframe,
  } = props

  const systemStatus = useMemo(
    () => computeSystemStatus(webllmStatus, webllmError, pyodideStatus, pandasStatus),
    [webllmStatus, webllmError, pyodideStatus, pandasStatus]
  )

  const isSystemReady = pandasStatus === 'ready' && webllmStatus === 'ready' && !hasQueuedFiles

  const onNewConversation = useCallback(() => {
    analytics.trackNewConversation()
    setMessages?.([])
  }, [analytics, setMessages])

  const onRemoveDataframe = useCallback(
    async (name: string) => {
      analytics.trackRemoveDataframe(name)
      await removeDataframe(name)
    },
    [analytics, removeDataframe]
  )

  return {
    // Status
    systemStatus,
    isSystemReady,
    
    // WebLLM loading state
    webllmStatus,
    webllmProgress,
    webllmProgressText,
    elapsedTime,
    estimatedTimeRemaining,
    webllmError,
    
    // PandasAI state
    pandasStatus,
    pandasError,
    onRetryPandas: retryPandasAI,
    
    // Data
    dataframes,
    
    // Actions
    onNewConversation,
    onRemoveDataframe,
  }
}

// Export computeSystemStatus for unit testing
export { computeSystemStatus }

