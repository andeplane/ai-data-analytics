/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type UseFileUploadViewModelContextType,
  UseFileUploadViewModelContext,
} from './useFileUploadViewModel'
import { useChatDragAndDrop } from './useChatDragAndDrop'

describe(useChatDragAndDrop.name, () => {
  let mockContext: UseFileUploadViewModelContextType
  let wrapper: ComponentType<{ children: ReactNode }>
  let mockOnFileLoad: Parameters<typeof useChatDragAndDrop>[0]

  beforeEach(() => {
    mockContext = {
      readFileAsText: vi.fn(() => Promise.resolve('file content')),
    }
    mockOnFileLoad = vi.fn(() => Promise.resolve())
    wrapper = createContextWrapper(mockContext)
  })

  it('should have isDragging false initially', () => {
    const { result } = renderHook(
      () => useChatDragAndDrop(mockOnFileLoad),
      { wrapper }
    )

    expect(result.current.isDragging).toBe(false)
  })

  describe('filename sanitization', () => {
    it.each([
      ['customers-10000.csv', 'customers_10000', 'csv'],
      ['data.file.name.json', 'data_file_name', 'json'],
      ['simple.csv', 'simple', 'csv'],
      ['file with spaces.csv', 'file_with_spaces', 'csv'],
      ['file@special#chars!.json', 'file_special_chars_', 'json'],
      ['UPPERCASE.CSV', 'UPPERCASE', 'csv'],
    ] as const)(
      'should sanitize "%s" to "%s" with type "%s"',
      async (filename, expectedName, expectedType) => {
        const { result } = renderHook(
          () => useChatDragAndDrop(mockOnFileLoad),
          { wrapper }
        )

        const mockFile = createMockFile(filename)

        await act(async () => {
          await result.current.handleDrop(createMockDropEvent([mockFile]))
        })

        await waitFor(() => {
          expect(mockOnFileLoad).toHaveBeenCalledWith(
            expectedName,
            'file content',
            expectedType
          )
        })
      }
    )
  })

  describe('file type detection', () => {
    it.each([
      ['data.json', 'json'],
      ['data.JSON', 'json'],
      ['data.csv', 'csv'],
      ['data.CSV', 'csv'],
    ] as const)(
      'should detect "%s" as type "%s"',
      async (filename, expectedType) => {
        const { result } = renderHook(
          () => useChatDragAndDrop(mockOnFileLoad),
          { wrapper }
        )

        const mockFile = createMockFile(filename)

        await act(async () => {
          await result.current.handleDrop(createMockDropEvent([mockFile]))
        })

        await waitFor(() => {
          expect(mockOnFileLoad).toHaveBeenCalledWith(
            expect.any(String),
            'file content',
            expectedType
          )
        })
      }
    )
  })

  describe('handleDrop', () => {
    it('should process valid CSV file', async () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([createMockFile('data.csv')])

      await act(async () => {
        await result.current.handleDrop(dropEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledWith('data', 'file content', 'csv')
      })
      expect(dropEvent.preventDefault).toHaveBeenCalled()
    })

    it('should process valid JSON file', async () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([createMockFile('data.json')])

      await act(async () => {
        await result.current.handleDrop(dropEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledWith('data', 'file content', 'json')
      })
    })

    it('should ignore invalid file types', async () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([
        createMockFile('image.png'),
        createMockFile('document.pdf'),
      ])

      await act(async () => {
        await result.current.handleDrop(dropEvent)
      })

      expect(mockOnFileLoad).not.toHaveBeenCalled()
    })

    it('should process first valid file when multiple files dropped', async () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([
        createMockFile('image.png'),
        createMockFile('valid.csv'),
        createMockFile('another.json'),
      ])

      await act(async () => {
        await result.current.handleDrop(dropEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledTimes(1)
        expect(mockOnFileLoad).toHaveBeenCalledWith('valid', 'file content', 'csv')
      })
    })

    it('should do nothing when disabled', async () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad, true),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([createMockFile('data.csv')])

      await act(async () => {
        await result.current.handleDrop(dropEvent)
      })

      expect(mockOnFileLoad).not.toHaveBeenCalled()
      expect(dropEvent.preventDefault).toHaveBeenCalled() // Still prevents default
    })

    it('should set isDragging to false after drop', async () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      // First set dragging to true
      act(() => {
        result.current.handleDragEnter(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(true)

      // Then drop
      await act(async () => {
        await result.current.handleDrop(createMockDropEvent([]))
      })

      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('drag state management', () => {
    it('should set isDragging to true on dragEnter', () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      const dragEvent = createMockDragEvent()

      act(() => {
        result.current.handleDragEnter(dragEvent)
      })

      expect(result.current.isDragging).toBe(true)
      expect(dragEvent.preventDefault).toHaveBeenCalled()
    })

    it('should prevent default on dragOver', () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      const dragEvent = createMockDragEvent()

      act(() => {
        result.current.handleDragOver(dragEvent)
      })

      expect(dragEvent.preventDefault).toHaveBeenCalled()
    })

    it('should set isDragging to false when drag counter reaches zero', () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      // Enter first element
      act(() => {
        result.current.handleDragEnter(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(true)

      // Enter nested element (counter = 2)
      act(() => {
        result.current.handleDragEnter(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(true)

      // Leave nested element (counter = 1, still dragging)
      act(() => {
        result.current.handleDragLeave(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(true)

      // Leave first element (counter = 0, stop dragging)
      act(() => {
        result.current.handleDragLeave(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(false)
    })

    it('should prevent counter from going negative and recover drag functionality', () => {
      const { result } = renderHook(
        () => useChatDragAndDrop(mockOnFileLoad),
        { wrapper }
      )

      // Simulate edge case: dragLeave called more than dragEnter
      // This can happen with nested elements and event ordering
      act(() => {
        result.current.handleDragLeave(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(false)

      // Counter should be clamped to 0, not negative
      // Now dragEnter should work correctly
      act(() => {
        result.current.handleDragEnter(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(true)

      // And dragLeave should work correctly too
      act(() => {
        result.current.handleDragLeave(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(false)
    })
  })
})

// Helper functions at bottom of file
function createContextWrapper(
  mockContext: UseFileUploadViewModelContextType
): ComponentType<{ children: ReactNode }> {
  return ({ children }) => (
    <UseFileUploadViewModelContext.Provider value={mockContext}>
      {children}
    </UseFileUploadViewModelContext.Provider>
  )
}

function createMockFile(name: string): File {
  return { name } as File
}

function createMockDropEvent(files: File[]): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      files: files,
    },
  } as unknown as React.DragEvent
}

function createMockDragEvent(): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.DragEvent
}

