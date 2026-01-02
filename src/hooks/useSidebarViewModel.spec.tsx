/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import type { AnalyticsService } from '../lib/analytics'
import {
  useSidebarViewModel,
  UseSidebarViewModelContext,
  computeSystemStatus,
  type UseSidebarViewModelContextType,
  type SidebarViewModelProps,
} from './useSidebarViewModel'

describe(computeSystemStatus.name, () => {
  it.each([
    {
      webllmStatus: 'loading' as const,
      webllmError: null,
      pyodideStatus: 'ready',
      pandasStatus: 'ready',
      expected: { text: 'Loading AI model...', color: 'bg-yellow-500 animate-pulse' },
    },
    {
      webllmStatus: 'error' as const,
      webllmError: 'GPU not supported',
      pyodideStatus: 'ready',
      pandasStatus: 'ready',
      expected: { text: 'Model error: GPU not supported', color: 'bg-red-500' },
    },
    {
      webllmStatus: 'ready' as const,
      webllmError: null,
      pyodideStatus: 'loading',
      pandasStatus: 'idle',
      expected: { text: 'Loading Python...', color: 'bg-yellow-500 animate-pulse' },
    },
    {
      webllmStatus: 'ready' as const,
      webllmError: null,
      pyodideStatus: 'ready',
      pandasStatus: 'loading',
      expected: { text: 'Loading PandasAI...', color: 'bg-yellow-500 animate-pulse' },
    },
    {
      webllmStatus: 'ready' as const,
      webllmError: null,
      pyodideStatus: 'ready',
      pandasStatus: 'error',
      expected: { text: 'PandasAI Error', color: 'bg-red-500' },
    },
    {
      webllmStatus: 'ready' as const,
      webllmError: null,
      pyodideStatus: 'ready',
      pandasStatus: 'ready',
      expected: { text: 'Ready', color: 'bg-green-500' },
    },
    {
      webllmStatus: 'idle' as const,
      webllmError: null,
      pyodideStatus: 'idle',
      pandasStatus: 'idle',
      expected: { text: 'Loading Python...', color: 'bg-yellow-500 animate-pulse' },
    },
  ])(
    'should return $expected.text when webllm=$webllmStatus, pyodide=$pyodideStatus, pandas=$pandasStatus',
    ({ webllmStatus, webllmError, pyodideStatus, pandasStatus, expected }) => {
      const result = computeSystemStatus(webllmStatus, webllmError, pyodideStatus, pandasStatus)
      expect(result).toEqual(expected)
    }
  )
})

describe(useSidebarViewModel.name, () => {
  let mockContext: UseSidebarViewModelContextType
  let wrapper: ComponentType<{ children: ReactNode }>
  let mockAnalytics: Partial<AnalyticsService>

  const createDefaultProps = (overrides?: Partial<SidebarViewModelProps>): SidebarViewModelProps => ({
    webllmStatus: 'ready',
    webllmProgress: 1,
    webllmProgressText: 'Model loaded!',
    elapsedTime: 30,
    estimatedTimeRemaining: null,
    webllmError: null,
    pyodideStatus: 'ready',
    pandasStatus: 'ready',
    pandasError: null,
    hasQueuedFiles: false,
    dataframes: [{ name: 'test_df', rows: 100, columns: ['a', 'b'] }],
    setMessages: vi.fn(),
    retryPandasAI: vi.fn(),
    removeDataframe: vi.fn(),
    ...overrides,
  })

  beforeEach(() => {
    mockAnalytics = {
      trackLLMCall: vi.fn(),
      trackToolCall: vi.fn(),
      trackChatMessage: vi.fn(),
      trackFileUpload: vi.fn(),
      trackExampleClick: vi.fn(),
      trackNewConversation: vi.fn(),
      trackRemoveDataframe: vi.fn(),
    }

    mockContext = {
      useAnalytics: vi.fn(() => mockAnalytics as AnalyticsService),
    }

    wrapper = createContextWrapper(mockContext)
  })

  it('should compute isSystemReady correctly when all systems ready', () => {
    const props = createDefaultProps()
    const { result } = renderHook(() => useSidebarViewModel(props), { wrapper })

    expect(result.current.isSystemReady).toBe(true)
  })

  it.each([
    { pandasStatus: 'loading' as const, desc: 'pandas loading' },
    { pandasStatus: 'error' as const, desc: 'pandas error' },
    { webllmStatus: 'loading' as const, desc: 'webllm loading' },
    { hasQueuedFiles: true, desc: 'queued files' },
  ])('should set isSystemReady false when $desc', (override) => {
    const props = createDefaultProps(override)
    const { result } = renderHook(() => useSidebarViewModel(props), { wrapper })

    expect(result.current.isSystemReady).toBe(false)
  })

  it('should track analytics and clear messages on new conversation', () => {
    // Arrange
    const setMessages = vi.fn()
    const props = createDefaultProps({ setMessages })
    const { result } = renderHook(() => useSidebarViewModel(props), { wrapper })

    // Act
    act(() => {
      result.current.onNewConversation()
    })

    // Assert
    expect(mockAnalytics.trackNewConversation).toHaveBeenCalledOnce()
    expect(setMessages).toHaveBeenCalledWith([])
  })

  it('should track analytics and call removeDataframe on remove', async () => {
    // Arrange
    const removeDataframe = vi.fn()
    const props = createDefaultProps({ removeDataframe })
    const { result } = renderHook(() => useSidebarViewModel(props), { wrapper })

    // Act
    await act(async () => {
      await result.current.onRemoveDataframe('my_dataframe')
    })

    // Assert
    expect(mockAnalytics.trackRemoveDataframe).toHaveBeenCalledWith('my_dataframe')
    expect(removeDataframe).toHaveBeenCalledWith('my_dataframe')
  })

  it('should expose all loading state props', () => {
    const props = createDefaultProps({
      webllmProgress: 0.5,
      webllmProgressText: 'Loading weights...',
      elapsedTime: 15,
      estimatedTimeRemaining: 30,
    })
    const { result } = renderHook(() => useSidebarViewModel(props), { wrapper })

    expect(result.current.webllmProgress).toBe(0.5)
    expect(result.current.webllmProgressText).toBe('Loading weights...')
    expect(result.current.elapsedTime).toBe(15)
    expect(result.current.estimatedTimeRemaining).toBe(30)
  })

  it('should expose pandas error and retry callback', () => {
    const retryPandasAI = vi.fn()
    const props = createDefaultProps({
      pandasStatus: 'error',
      pandasError: 'Network error',
      retryPandasAI,
    })
    const { result } = renderHook(() => useSidebarViewModel(props), { wrapper })

    expect(result.current.pandasError).toBe('Network error')
    expect(result.current.onRetryPandas).toBe(retryPandasAI)
  })
})

// Helper function
function createContextWrapper(
  mockContext: UseSidebarViewModelContextType
): ComponentType<{ children: ReactNode }> {
  return ({ children }) => (
    <UseSidebarViewModelContext.Provider value={mockContext}>
      {children}
    </UseSidebarViewModelContext.Provider>
  )
}

