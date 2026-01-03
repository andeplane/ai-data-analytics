import { useState } from 'react'

const STORAGE_KEY = 'data-analyst-welcomed'

/**
 * Hook to manage welcome modal visibility.
 * Shows modal on first visit, then stores dismissal in localStorage.
 */
export function useWelcomeModal() {
  // Lazy initialization: check localStorage only once on mount
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const hasSeenWelcome = localStorage.getItem(STORAGE_KEY) === 'true'
      return !hasSeenWelcome
    } catch (error) {
      // Handle localStorage errors gracefully (e.g., private browsing mode)
      console.warn('Failed to read welcome modal state:', error)
      return false
    }
  })

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
      setIsOpen(false)
    } catch (error) {
      // Handle localStorage errors gracefully (e.g., private browsing mode)
      console.warn('Failed to save welcome modal dismissal:', error)
      setIsOpen(false)
    }
  }

  return {
    isOpen,
    dismiss,
  }
}

