/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PyodideProxy } from './usePyodide'
import { useToolExecutor } from './useToolExecutor'
import type { AnalyzeDataArgs } from '../lib/tools'

describe(useToolExecutor.name, () => {
  let mockPyodide: PyodideProxy

  beforeEach(() => {
    mockPyodide = {
      runPython: vi.fn(),
      runPythonAsync: vi.fn(),
      writeFile: vi.fn(),
    }

    // Suppress console.error for error tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
  })

  describe('executeAnalyzeData', () => {
    it('should return error when pyodide is null', async () => {
      // Arrange
      const { result } = renderHook(() => useToolExecutor({ pyodide: null }))
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'What is the average?',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(toolResult).toEqual({
        success: false,
        result: 'Error: Python environment not ready',
      })
    })

    it('should return error when dataframe_names is empty', async () => {
      // Arrange
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: [],
        question: 'What is the average?',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(toolResult).toEqual({
        success: false,
        result: 'Error: No dataframes specified',
      })
      expect(mockPyodide.runPythonAsync).not.toHaveBeenCalled()
    })

    it('should call pyodide.runPythonAsync with generated code', async () => {
      // Arrange
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue(
        JSON.stringify({
          success: true,
          result: 'The average is 42',
        })
      )
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'What is the average?',
      }

      // Act
      await act(async () => {
        await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(mockPyodide.runPythonAsync).toHaveBeenCalledTimes(1)
      const pythonCode = vi.mocked(mockPyodide.runPythonAsync).mock.calls[0][0]
      expect(pythonCode).toContain('df_names = ["df1"]')
      expect(pythonCode).toContain('question = "What is the average?"')
    })

    it('should return parsed result on success', async () => {
      // Arrange
      const mockResult = {
        success: true,
        result: 'The average is 42',
      }
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue(
        JSON.stringify(mockResult)
      )
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'What is the average?',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(toolResult).toEqual({
        success: true,
        result: 'The average is 42',
        chartPath: undefined,
      })
    })

    it('should return result with chartPath when present', async () => {
      // Arrange
      const mockResult = {
        success: true,
        result: 'Chart generated',
        chartPath: 'data:image/png;base64,abc123',
      }
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue(
        JSON.stringify(mockResult)
      )
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'Show me a chart',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(toolResult).toEqual({
        success: true,
        result: 'Chart generated',
        chartPath: 'data:image/png;base64,abc123',
      })
    })

    it('should handle multiple dataframes', async () => {
      // Arrange
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue(
        JSON.stringify({
          success: true,
          result: 'Analysis complete',
        })
      )
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1', 'df2', 'df3'],
        question: 'Compare the dataframes',
      }

      // Act
      await act(async () => {
        await result.current.executeAnalyzeData(args)
      })

      // Assert
      const pythonCode = vi.mocked(mockPyodide.runPythonAsync).mock.calls[0][0]
      expect(pythonCode).toContain('df_names = ["df1","df2","df3"]')
    })

    it('should handle Python execution errors', async () => {
      // Arrange
      const error = new Error('Python execution failed')
      vi.mocked(mockPyodide.runPythonAsync).mockRejectedValue(error)
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'What is the average?',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(toolResult).toEqual({
        success: false,
        result: 'Error executing analysis: Python execution failed',
      })
      expect(console.error).toHaveBeenCalledWith(
        'Tool execution error:',
        error
      )
    })

    it('should handle invalid JSON response', async () => {
      // Arrange
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue('invalid json')
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'What is the average?',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeAnalyzeData(args)
      })

      // Assert
      expect(toolResult).toEqual({
        success: false,
        result: expect.stringContaining('Error executing analysis:'),
      })
    })
  })

  describe('executeTool', () => {
    it('should route analyze_data tool correctly', async () => {
      // Arrange
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue(
        JSON.stringify({
          success: true,
          result: 'Result',
        })
      )
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'Test question',
      }

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeTool('analyze_data', args)
      })

      // Assert
      expect(toolResult).toBeDefined()
      expect(toolResult!.success).toBe(true)
      expect(mockPyodide.runPythonAsync).toHaveBeenCalled()
    })

    it('should return error for unknown tool', async () => {
      // Arrange
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeTool('unknown_tool', {})
      })

      // Assert
      expect(toolResult).toEqual({
        success: false,
        result: 'Unknown tool: unknown_tool',
      })
      expect(mockPyodide.runPythonAsync).not.toHaveBeenCalled()
    })

    it('should return error for invalid analyze_data arguments', async () => {
      // Arrange
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )

      // Act
      let toolResult
      await act(async () => {
        toolResult = await result.current.executeTool('analyze_data', {
          invalid: 'args',
        })
      })

      // Assert
      expect(toolResult).toEqual({
        success: false,
        result: 'Invalid arguments for analyze_data tool',
      })
      expect(mockPyodide.runPythonAsync).not.toHaveBeenCalled()
    })

    it('should log tool execution', async () => {
      // Arrange
      vi.mocked(mockPyodide.runPythonAsync).mockResolvedValue(
        JSON.stringify({
          success: true,
          result: 'Result',
        })
      )
      const { result } = renderHook(() =>
        useToolExecutor({ pyodide: mockPyodide })
      )
      const args: AnalyzeDataArgs = {
        dataframe_names: ['df1'],
        question: 'Test question',
      }

      // Act
      await act(async () => {
        await result.current.executeTool('analyze_data', args)
      })

      // Assert
      expect(console.groupCollapsed).toHaveBeenCalledWith(
        '🔧 Executing tool: analyze_data'
      )
      expect(console.log).toHaveBeenCalledWith('Arguments:', args)
      expect(console.groupEnd).toHaveBeenCalled()
    })
  })
})

