import { describe, it, expect } from 'vitest'
import {
  buildAnalyzeDataPythonCode,
  parseToolExecutionResult,
} from './toolExecutorUtils'

describe(buildAnalyzeDataPythonCode.name, () => {
  it('should include escaped names in Python code', () => {
    const code = buildAnalyzeDataPythonCode(['df1', 'df2'], 'test question')

    expect(code).toContain('df_names = ["df1","df2"]')
  })

  it('should include escaped question in Python code', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'What is the average?')

    expect(code).toContain('question = "What is the average?"')
  })

  it('should handle names with special characters', () => {
    const escapedNames = ['my"df', 'path\\name']
    const code = buildAnalyzeDataPythonCode(escapedNames, 'test')

    // The escaped names should be in the JSON array
    expect(code).toContain(JSON.stringify(escapedNames))
  })

  it('should handle question with special characters', () => {
    const escapedQuestion = 'What is "the" average?'
    const code = buildAnalyzeDataPythonCode(['df1'], escapedQuestion)

    // The escaped question should be in the Python string
    expect(code).toContain(`question = "${escapedQuestion}"`)
  })

  it('should include single dataframe logic', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code).toContain('if len(df_names) == 1:')
    expect(code).toContain('sdf = dataframes[df_names[0]]')
    expect(code).toContain('result = sdf.chat(question)')
  })

  it('should include multiple dataframe logic', () => {
    const code = buildAnalyzeDataPythonCode(['df1', 'df2'], 'test')

    expect(code).toContain('else:')
    expect(code).toContain('from pandasai import Agent')
    expect(code).toContain('agent = Agent(raw_dfs, config={"llm": llm})')
  })

  it('should include chart detection logic', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code).toContain('chart_path = None')
    expect(code).toContain('result_str.endswith(\'.png\')')
    expect(code).toContain('glob.glob("exports/charts/*.png")')
  })

  it('should include base64 conversion logic', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code).toContain('import base64')
    expect(code).toContain('chart_base64 = base64.b64encode(chart_bytes).decode(\'utf-8\')')
    expect(code).toContain('chart_data_url = f"data:image/png;base64,{chart_base64}"')
  })

  it('should include error handling', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code).toContain('except Exception as e:')
    expect(code).toContain('import traceback')
    expect(code).toContain('traceback.print_exc()')
  })

  it('should return result_json at the end', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code.trim().endsWith('result_json')).toBe(true)
  })

  it('should include directory creation', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code).toContain('os.makedirs("exports/charts", exist_ok=True)')
  })

  it('should include dataframe validation', () => {
    const code = buildAnalyzeDataPythonCode(['df1'], 'test')

    expect(code).toContain('missing = [name for name in df_names if name not in dataframes]')
    expect(code).toContain('if missing:')
  })
})

describe(parseToolExecutionResult.name, () => {
  it('should parse successful result without chart', () => {
    const json = JSON.stringify({
      success: true,
      result: 'The average is 42',
    })

    const result = parseToolExecutionResult(json)

    expect(result).toEqual({
      success: true,
      result: 'The average is 42',
      chartPath: undefined,
    })
  })

  it('should parse successful result with chart', () => {
    const json = JSON.stringify({
      success: true,
      result: 'Chart generated',
      chartPath: 'data:image/png;base64,abc123',
    })

    const result = parseToolExecutionResult(json)

    expect(result).toEqual({
      success: true,
      result: 'Chart generated',
      chartPath: 'data:image/png;base64,abc123',
    })
  })

  it('should parse error result', () => {
    const json = JSON.stringify({
      success: false,
      result: 'Error: Dataframes not found',
    })

    const result = parseToolExecutionResult(json)

    expect(result).toEqual({
      success: false,
      result: 'Error: Dataframes not found',
      chartPath: undefined,
    })
  })

  it('should handle missing success field (defaults to false)', () => {
    const json = JSON.stringify({
      result: 'Some result',
    })

    const result = parseToolExecutionResult(json)

    expect(result.success).toBe(false)
    expect(result.result).toBe('Some result')
  })

  it('should handle missing result field (defaults to empty string)', () => {
    const json = JSON.stringify({
      success: true,
    })

    const result = parseToolExecutionResult(json)

    expect(result.success).toBe(true)
    expect(result.result).toBe('')
  })

  it('should handle null chartPath', () => {
    const json = JSON.stringify({
      success: true,
      result: 'Test',
      chartPath: null,
    })

    const result = parseToolExecutionResult(json)

    expect(result.chartPath).toBeUndefined()
  })

  it('should handle empty string chartPath', () => {
    const json = JSON.stringify({
      success: true,
      result: 'Test',
      chartPath: '',
    })

    const result = parseToolExecutionResult(json)

    expect(result.chartPath).toBeUndefined()
  })

  it('should preserve chartPath when present', () => {
    const chartPath = 'data:image/png;base64,xyz789'
    const json = JSON.stringify({
      success: true,
      result: 'Test',
      chartPath,
    })

    const result = parseToolExecutionResult(json)

    expect(result.chartPath).toBe(chartPath)
  })
})

