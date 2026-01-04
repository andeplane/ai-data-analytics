import { useCallback, useContext, useRef, useState } from 'react'
import {
  UseFileUploadViewModelContext,
  sanitizeFilename,
  getFileType,
} from './useFileUploadViewModel'

export interface ChatDragAndDropViewModel {
  isDragging: boolean
  handleDrop: (e: React.DragEvent) => Promise<void>
  handleDragOver: (e: React.DragEvent) => void
  handleDragEnter: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
}

/**
 * Hook for drag-and-drop file upload in the chat window.
 * Follows ViewModel pattern with dependency injection via UseFileUploadViewModelContext.
 */
export function useChatDragAndDrop(
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>,
  disabled?: boolean
): ChatDragAndDropViewModel {
  const { readFileAsText } = useContext(UseFileUploadViewModelContext)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const handleFile = useCallback(
    async (file: File) => {
      const content = await readFileAsText(file)
      const name = sanitizeFilename(file.name)
      const type = getFileType(file.name)
      await onFileLoad(name, content, type)
    },
    [readFileAsText, onFileLoad]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragging(false)
      if (disabled) return

      const files = Array.from(e.dataTransfer.files)
      const validFile = files.find((f) => {
        const lowerName = f.name.toLowerCase()
        return lowerName.endsWith('.csv') || lowerName.endsWith('.json')
      })
      if (validFile) {
        await handleFile(validFile)
      }
    },
    [handleFile, disabled]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Reset counter to 0 if it's negative (safeguard before incrementing)
    if (dragCounterRef.current < 0) {
      dragCounterRef.current = 0
    }
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    // Prevent counter from going negative
    if (dragCounterRef.current < 0) {
      dragCounterRef.current = 0
    }
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  return {
    isDragging,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
  }
}

