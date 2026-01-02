import { useFileUploadViewModel } from '../hooks/useFileUploadViewModel'

interface FileUploadProps {
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>
  disabled?: boolean
}

export function FileUpload({ onFileLoad, disabled }: FileUploadProps) {
  const {
    isDragging,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
  } = useFileUploadViewModel(onFileLoad, disabled)

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
