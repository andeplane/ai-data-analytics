/**
 * Parse error message to provide user-friendly network error messages
 */
export function parseNetworkError(error: string | null | undefined): string {
  if (!error) return 'An error occurred'
  
  const errorLower = error.toLowerCase()
  if (
    errorLower.includes('aborterror') ||
    errorLower.includes('failed to fetch') ||
    errorLower.includes('networkerror') ||
    errorLower.includes('network request failed')
  ) {
    return 'Network connection failed. Please check your internet and try again.'
  }
  
  return error
}

