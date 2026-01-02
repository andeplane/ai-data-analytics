/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ExampleFile,
  type UseExampleDataBubblesViewModelContextType,
  UseExampleDataBubblesViewModelContext,
  useExampleDataBubblesViewModel,
} from './useExampleDataBubblesViewModel'

describe(useExampleDataBubblesViewModel.name, () => {
  let mockContext: UseExampleDataBubblesViewModelContextType
  let wrapper: ComponentType<{ children: ReactNode }>
  let mockOnFileLoad: Parameters<typeof useExampleDataBubblesViewModel>[0]

  beforeEach(() => {
    mockContext = {
      fetchFile: vi.fn(() => Promise.resolve('csv,content,here')),
    }
    mockOnFileLoad = vi.fn(() => Promise.resolve())
    wrapper = createContextWrapper(mockContext)

    // Suppress console.error for error tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Mock alert
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('should have loadingFile as null initially', () => {
    const { result } = renderHook(
      () => useExampleDataBubblesViewModel(mockOnFileLoad),
      { wrapper }
    )

    expect(result.current.loadingFile).toBeNull()
  })

  it('should set loadingFile during fetch and clear after success', async () => {
    // Arrange
    const file = createMockExampleFile()
    let resolvePromise: (value: string) => void
    vi.mocked(mockContext.fetchFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve
        })
    )

    const { result } = renderHook(
      () => useExampleDataBubblesViewModel(mockOnFileLoad),
      { wrapper }
    )

    // Act - start loading
    act(() => {
      result.current.handleLoadExample(file)
    })

    // Assert - loading state is set
    expect(result.current.loadingFile).toBe('test_file')

    // Act - resolve the fetch
    await act(async () => {
      resolvePromise!('fetched content')
    })

    // Assert - loading state is cleared
    await waitFor(() => expect(result.current.loadingFile).toBeNull())
  })

  it('should call onFileLoad with fetched content on success', async () => {
    // Arrange
    const file = createMockExampleFile()
    vi.mocked(mockContext.fetchFile).mockResolvedValue('csv,data,here')

    const { result } = renderHook(
      () => useExampleDataBubblesViewModel(mockOnFileLoad),
      { wrapper }
    )

    // Act
    await act(async () => {
      await result.current.handleLoadExample(file)
    })

    // Assert
    expect(mockContext.fetchFile).toHaveBeenCalledWith(
      'https://example.test/data.csv'
    )
    expect(mockOnFileLoad).toHaveBeenCalledWith(
      'test_file',
      'csv,data,here',
      'csv',
      'example_data'
    )
  })

  it('should show alert and clear loading on fetch error', async () => {
    // Arrange
    const file = createMockExampleFile()
    vi.mocked(mockContext.fetchFile).mockRejectedValue(
      new Error('Network error')
    )

    const { result } = renderHook(
      () => useExampleDataBubblesViewModel(mockOnFileLoad),
      { wrapper }
    )

    // Act
    await act(async () => {
      await result.current.handleLoadExample(file)
    })

    // Assert
    expect(window.alert).toHaveBeenCalledWith(
      'Failed to load example: Network error'
    )
    expect(result.current.loadingFile).toBeNull()
    expect(mockOnFileLoad).not.toHaveBeenCalled()
  })

  it('should handle non-Error thrown values', async () => {
    // Arrange
    const file = createMockExampleFile()
    vi.mocked(mockContext.fetchFile).mockRejectedValue('String error')

    const { result } = renderHook(
      () => useExampleDataBubblesViewModel(mockOnFileLoad),
      { wrapper }
    )

    // Act
    await act(async () => {
      await result.current.handleLoadExample(file)
    })

    // Assert
    expect(window.alert).toHaveBeenCalledWith(
      'Failed to load example: String error'
    )
  })
})

// Helper functions at bottom of file
function createContextWrapper(
  mockContext: UseExampleDataBubblesViewModelContextType
): ComponentType<{ children: ReactNode }> {
  return ({ children }) => (
    <UseExampleDataBubblesViewModelContext.Provider value={mockContext}>
      {children}
    </UseExampleDataBubblesViewModelContext.Provider>
  )
}

function createMockExampleFile(): ExampleFile {
  return {
    name: 'test_file',
    label: 'test_file.csv',
    description: 'Test file description',
    url: 'https://example.test/data.csv',
  }
}

