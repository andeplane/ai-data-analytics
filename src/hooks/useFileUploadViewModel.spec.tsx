/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type UseFileUploadViewModelContextType,
  UseFileUploadViewModelContext,
  useFileUploadViewModel,
} from './useFileUploadViewModel'

describe(useFileUploadViewModel.name, () => {
  let mockContext: UseFileUploadViewModelContextType
  let wrapper: ComponentType<{ children: ReactNode }>
  let mockOnFileLoad: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockContext = {
      readFileAsText: vi.fn(() => Promise.resolve('file content')),
    }
    mockOnFileLoad = vi.fn()
    wrapper = createContextWrapper(mockContext)
  })

  it('should have isDragging false initially', () => {
    const { result } = renderHook(
      () => useFileUploadViewModel(mockOnFileLoad),
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
          () => useFileUploadViewModel(mockOnFileLoad),
          { wrapper }
        )

        const mockFile = createMockFile(filename)

        await act(async () => {
          await result.current.handleFile(mockFile)
        })

        expect(mockOnFileLoad).toHaveBeenCalledWith(
          expectedName,
          'file content',
          expectedType
        )
      }
    )
  })

  describe('file type detection', () => {
    it.each([
      ['data.json', 'json'],
      ['data.JSON', 'json'],
      ['data.csv', 'csv'],
      ['data.CSV', 'csv'],
      ['data.txt', 'csv'], // Default to csv for unknown types
      ['data.xlsx', 'csv'], // Default to csv for unknown types
    ] as const)(
      'should detect "%s" as type "%s"',
      async (filename, expectedType) => {
        const { result } = renderHook(
          () => useFileUploadViewModel(mockOnFileLoad),
          { wrapper }
        )

        const mockFile = createMockFile(filename)

        await act(async () => {
          await result.current.handleFile(mockFile)
        })

        expect(mockOnFileLoad).toHaveBeenCalledWith(
          expect.any(String),
          'file content',
          expectedType
        )
      }
    )
  })

  describe('handleDrop', () => {
    it('should process valid CSV file', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([createMockFile('data.csv')])

      await act(async () => {
        result.current.handleDrop(dropEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledWith('data', 'file content', 'csv')
      })
      expect(dropEvent.preventDefault).toHaveBeenCalled()
    })

    it('should process valid JSON file', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([createMockFile('data.json')])

      await act(async () => {
        result.current.handleDrop(dropEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledWith('data', 'file content', 'json')
      })
    })

    it('should ignore invalid file types', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([
        createMockFile('image.png'),
        createMockFile('document.pdf'),
      ])

      await act(async () => {
        result.current.handleDrop(dropEvent)
      })

      expect(mockOnFileLoad).not.toHaveBeenCalled()
    })

    it('should process first valid file when multiple files dropped', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([
        createMockFile('image.png'),
        createMockFile('valid.csv'),
        createMockFile('another.json'),
      ])

      await act(async () => {
        result.current.handleDrop(dropEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledTimes(1)
        expect(mockOnFileLoad).toHaveBeenCalledWith('valid', 'file content', 'csv')
      })
    })

    it('should do nothing when disabled', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad, true),
        { wrapper }
      )

      const dropEvent = createMockDropEvent([createMockFile('data.csv')])

      await act(async () => {
        result.current.handleDrop(dropEvent)
      })

      expect(mockOnFileLoad).not.toHaveBeenCalled()
      expect(dropEvent.preventDefault).toHaveBeenCalled() // Still prevents default
    })

    it('should set isDragging to false after drop', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      // First set dragging to true
      act(() => {
        result.current.handleDragOver(createMockDragEvent())
      })
      expect(result.current.isDragging).toBe(true)

      // Then drop
      await act(async () => {
        result.current.handleDrop(createMockDropEvent([]))
      })

      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('drag state management', () => {
    it('should set isDragging to true on dragOver', () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const dragEvent = createMockDragEvent()

      act(() => {
        result.current.handleDragOver(dragEvent)
      })

      expect(result.current.isDragging).toBe(true)
      expect(dragEvent.preventDefault).toHaveBeenCalled()
    })

    it('should set isDragging to false on dragLeave', () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      // First set to true
      act(() => {
        result.current.handleDragOver(createMockDragEvent())
      })

      // Then leave
      act(() => {
        result.current.handleDragLeave()
      })

      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('handleInputChange', () => {
    it('should process file from input', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const inputEvent = createMockInputChangeEvent(createMockFile('input.csv'))

      await act(async () => {
        result.current.handleInputChange(inputEvent)
      })

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledWith('input', 'file content', 'csv')
      })
      expect(inputEvent.target.value).toBe('')
    })

    it('should do nothing if no file selected', async () => {
      const { result } = renderHook(
        () => useFileUploadViewModel(mockOnFileLoad),
        { wrapper }
      )

      const inputEvent = createMockInputChangeEvent(null)

      await act(async () => {
        result.current.handleInputChange(inputEvent)
      })

      expect(mockOnFileLoad).not.toHaveBeenCalled()
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
    dataTransfer: {
      files: files,
    },
  } as unknown as React.DragEvent
}

function createMockDragEvent(): React.DragEvent {
  return {
    preventDefault: vi.fn(),
  } as unknown as React.DragEvent
}

function createMockInputChangeEvent(
  file: File | null
): React.ChangeEvent<HTMLInputElement> {
  return {
    target: {
      files: file ? [file] : null,
      value: 'some-value',
    },
  } as unknown as React.ChangeEvent<HTMLInputElement>
}

