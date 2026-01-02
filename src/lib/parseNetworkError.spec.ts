import { describe, it, expect } from 'vitest'
import { parseNetworkError } from './parseNetworkError'

describe(parseNetworkError.name, () => {
  it.each([
    { input: null, expected: 'An error occurred' },
    { input: undefined, expected: 'An error occurred' },
    { input: '', expected: 'An error occurred' },
  ])('should return default message for falsy input: $input', ({ input, expected }) => {
    expect(parseNetworkError(input)).toBe(expected)
  })

  it.each([
    { input: 'AbortError: The operation was aborted', description: 'AbortError' },
    { input: 'Failed to fetch', description: 'failed to fetch' },
    { input: 'NetworkError when attempting to fetch resource', description: 'NetworkError' },
    { input: 'Network request failed', description: 'network request failed' },
  ])('should return network error message for $description', ({ input }) => {
    expect(parseNetworkError(input)).toBe(
      'Network connection failed. Please check your internet and try again.'
    )
  })

  it('should return original error for non-network errors', () => {
    const customError = 'Something went wrong with the API'
    expect(parseNetworkError(customError)).toBe(customError)
  })

  it('should handle case-insensitive matching', () => {
    expect(parseNetworkError('FAILED TO FETCH')).toBe(
      'Network connection failed. Please check your internet and try again.'
    )
  })
})

