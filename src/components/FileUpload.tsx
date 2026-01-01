import { useCallback, useState } from 'react'

interface FileUploadProps {
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => void
  disabled?: boolean
}

export function FileUpload({ onFileLoad, disabled }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase()
        const type = ext === 'json' ? 'json' : 'csv'
        let name = file.name.replace(/\.[^/.]+$/, '') // Remove extension
        // Sanitize name: replace any non-alphanumeric characters with underscores
        // This ensures safe SQL identifiers (e.g., "customers-10000" -> "customers_10000")
        name = name.replace(/[^a-zA-Z0-9]/g, '_')
        onFileLoad(name, content, type)
      }
      reader.readAsText(file)
    },
    [onFileLoad]
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

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
        ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <input
        type="file"
        accept=".csv,.json"
        onChange={handleInputChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      <div className="pointer-events-none">
        <div className="text-3xl mb-2">📁</div>
        <p className="text-sm text-zinc-400">
          {isDragging ? 'Drop file here' : 'Drop CSV or JSON file here'}
        </p>
        <p className="text-xs text-zinc-500 mt-1">or click to browse</p>
      </div>
    </div>
  )
}

