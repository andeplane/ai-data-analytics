import { describe, expect, test } from 'vitest'
import { isAnalyzeDataArgs } from './tools'

describe('isAnalyzeDataArgs', () => {
  test.each([
    [{ dataframe_names: ['df1'], question: 'test' }, true],
    [{ dataframe_names: [], question: '' }, true],
    [null, false],
    [undefined, false],
    [{ question: 'test' }, false], // missing dataframe_names
    [{ dataframe_names: ['df1'] }, false], // missing question
    [{ dataframe_names: [123], question: 'test' }, false], // wrong type in array
    [{ dataframe_names: ['df1'], question: 123 }, false], // wrong type for question
    [{ dataframe_names: 'not-array', question: 'test' }, false], // dataframe_names not array
  ])('isAnalyzeDataArgs(%j) returns %s', (input, expected) => {
    expect(isAnalyzeDataArgs(input)).toBe(expected)
  })
})

