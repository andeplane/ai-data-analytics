import { createContext, useCallback, useContext, useState } from 'react'

// Default dependencies for production
const defaultDependencies = {
  readFileAsText: (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  },
}

export type UseFileUploadViewModelContextType = typeof defaultDependencies
export const UseFileUploadViewModelContext =
  createContext<UseFileUploadViewModelContextType>(defaultDependencies)

export interface FileUploadViewModel {
  isDragging: boolean
  handleFile: (file: File) => void
  handleDrop: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: () => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

/**
 * Sanitize filename to create a safe SQL identifier.
 * Removes extension and replaces non-alphanumeric characters with underscores.
 */
function sanitizeFilename(filename: string): string {
  let name = filename.replace(/\.[^/.]+$/, '') // Remove extension
  // Replace any non-alphanumeric characters with underscores
  // This ensures safe SQL identifiers (e.g., "customers-10000" -> "customers_10000")
  name = name.replace(/[^a-zA-Z0-9]/g, '_')
  return name
}

/**
 * Determine file type from extension.
 */
function getFileType(filename: string): 'csv' | 'json' {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext === 'json' ? 'json' : 'csv'
}

export function useFileUploadViewModel(
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => void,
  disabled?: boolean
): FileUploadViewModel {
  const { readFileAsText } = useContext(UseFileUploadViewModelContext)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      const content = await readFileAsText(file)
      const name = sanitizeFilename(file.name)
      const type = getFileType(file.name)
      onFileLoad(name, content, type)
    },
    [readFileAsText, onFileLoad]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (disabled) return

      const files = Array.from(e.dataTransfer.files)
      const validFile = files.find(
        (f) => f.name.endsWith('.csv') || f.name.endsWith('.json')
      )
      if (validFile) {
        handleFile(validFile)
      }
    },
    [handleFile, disabled]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
      e.target.value = '' // Reset input
    },
    [handleFile]
  )

  return {
    isDragging,
    handleFile,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
  }
}

