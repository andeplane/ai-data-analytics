/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type UseChartImageViewModelContextType,
  UseChartImageViewModelContext,
  useChartImageViewModel,
} from './useChartImageViewModel'

describe(useChartImageViewModel.name, () => {
  let mockContext: UseChartImageViewModelContextType
  let wrapper: ComponentType<{ children: ReactNode }>
  let capturedKeydownHandler: ((e: KeyboardEvent) => void) | null
  let cleanupFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    capturedKeydownHandler = null
    cleanupFn = vi.fn()

    mockContext = {
      downloadFile: vi.fn(),
      addKeydownListener: vi.fn((handler) => {
        capturedKeydownHandler = handler
        return cleanupFn
      }),
    }

    wrapper = createContextWrapper(mockContext)
  })

  it('should have isModalOpen false and imageError false initially', () => {
    const { result } = renderHook(
      () => useChartImageViewModel('https://example.test/chart.png'),
      { wrapper }
    )

    expect(result.current.isModalOpen).toBe(false)
    expect(result.current.imageError).toBe(false)
  })

  it('should set isModalOpen to true when openModal is called', () => {
    const { result } = renderHook(
      () => useChartImageViewModel('https://example.test/chart.png'),
      { wrapper }
    )

    act(() => {
      result.current.openModal()
    })

    expect(result.current.isModalOpen).toBe(true)
  })

  it('should set isModalOpen to false when closeModal is called', () => {
    const { result } = renderHook(
      () => useChartImageViewModel('https://example.test/chart.png'),
      { wrapper }
    )

    // Open first
    act(() => {
      result.current.openModal()
    })
    expect(result.current.isModalOpen).toBe(true)

    // Then close
    act(() => {
      result.current.closeModal()
    })
    expect(result.current.isModalOpen).toBe(false)
  })

  it('should call downloadFile with src and generated filename', () => {
    // Arrange
    const mockDateNow = 1704153600000
    vi.spyOn(Date, 'now').mockReturnValue(mockDateNow)

    const { result } = renderHook(
      () => useChartImageViewModel('https://example.test/chart.png'),
      { wrapper }
    )

    // Act
    act(() => {
      result.current.download()
    })

    // Assert
    expect(mockContext.downloadFile).toHaveBeenCalledWith(
      'https://example.test/chart.png',
      `chart-${mockDateNow}.png`
    )
  })

  it('should set imageError to true when handleImageError is called', () => {
    const { result } = renderHook(
      () => useChartImageViewModel('https://example.test/chart.png'),
      { wrapper }
    )

    act(() => {
      result.current.handleImageError()
    })

    expect(result.current.imageError).toBe(true)
  })

  describe('keyboard listener', () => {
    it('should register keydown listener when modal opens', () => {
      const { result } = renderHook(
        () => useChartImageViewModel('https://example.test/chart.png'),
        { wrapper }
      )

      // Initially no listener registered
      expect(mockContext.addKeydownListener).not.toHaveBeenCalled()

      // Open modal
      act(() => {
        result.current.openModal()
      })

      // Listener should be registered
      expect(mockContext.addKeydownListener).toHaveBeenCalledTimes(1)
    })

    it('should close modal when Escape key is pressed', () => {
      const { result } = renderHook(
        () => useChartImageViewModel('https://example.test/chart.png'),
        { wrapper }
      )

      // Open modal
      act(() => {
        result.current.openModal()
      })
      expect(result.current.isModalOpen).toBe(true)

      // Simulate Escape key press
      act(() => {
        capturedKeydownHandler!({ key: 'Escape' } as KeyboardEvent)
      })

      expect(result.current.isModalOpen).toBe(false)
    })

    it('should not close modal for other keys', () => {
      const { result } = renderHook(
        () => useChartImageViewModel('https://example.test/chart.png'),
        { wrapper }
      )

      // Open modal
      act(() => {
        result.current.openModal()
      })

      // Simulate other key press
      act(() => {
        capturedKeydownHandler!({ key: 'Enter' } as KeyboardEvent)
      })

      expect(result.current.isModalOpen).toBe(true)
    })

    it('should cleanup listener when modal closes', () => {
      const { result } = renderHook(
        () => useChartImageViewModel('https://example.test/chart.png'),
        { wrapper }
      )

      // Open modal
      act(() => {
        result.current.openModal()
      })

      // Close modal
      act(() => {
        result.current.closeModal()
      })

      // Cleanup should have been called
      expect(cleanupFn).toHaveBeenCalled()
    })

    it('should cleanup listener on unmount', () => {
      const { result, unmount } = renderHook(
        () => useChartImageViewModel('https://example.test/chart.png'),
        { wrapper }
      )

      // Open modal
      act(() => {
        result.current.openModal()
      })

      // Unmount
      unmount()

      // Cleanup should have been called
      expect(cleanupFn).toHaveBeenCalled()
    })
  })
})

// Helper function at bottom of file
function createContextWrapper(
  mockContext: UseChartImageViewModelContextType
): ComponentType<{ children: ReactNode }> {
  return ({ children }) => (
    <UseChartImageViewModelContext.Provider value={mockContext}>
      {children}
    </UseChartImageViewModelContext.Provider>
  )
}

