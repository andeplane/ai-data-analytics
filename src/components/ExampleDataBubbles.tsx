import { useState } from 'react'

interface ExampleFile {
  name: string
  label: string
  description: string
  url: string
}

const EXAMPLE_FILES: ExampleFile[] = [
  {
    name: 'customers_10000',
    label: 'customers_10000.csv',
    description: '10,000 customer records with names, companies, locations, and contact info',
    url: 'https://raw.githubusercontent.com/andeplane/ai-data-analytics/refs/heads/main/example-data/customers_10000.csv'
  },
  // More files can be added here later
]

interface ExampleDataBubblesProps {
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>
}

export function ExampleDataBubbles({ onFileLoad }: ExampleDataBubblesProps) {
  const [loadingFile, setLoadingFile] = useState<string | null>(null)

  const handleLoadExample = async (file: ExampleFile) => {
    setLoadingFile(file.name)
    try {
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch ${file.label}`)
      }
      const content = await response.text()
      await onFileLoad(file.name, content, 'csv')
    } catch (error) {
      console.error('Failed to load example file:', error)
      alert(`Failed to load example: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoadingFile(null)
    }
  }

  return (
    <div className="text-center">
      <p className="text-sm text-zinc-400 mb-4">
        Upload your own files or try one of the examples below
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_FILES.map((file) => (
          <button
            key={file.name}
            onClick={() => handleLoadExample(file)}
            disabled={loadingFile !== null}
            title={file.description}
            className={`
              px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 
              rounded-full text-sm text-zinc-300 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              ${loadingFile === file.name ? 'animate-pulse' : ''}
            `}
          >
            {loadingFile === file.name ? 'Loading...' : file.label}
          </button>
        ))}
      </div>
    </div>
  )
}
