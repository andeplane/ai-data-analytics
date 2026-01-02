import { createContext, useCallback, useContext, useState } from 'react'

export interface ExampleFile {
  name: string
  label: string
  description: string
  url: string
}

export const EXAMPLE_FILES: ExampleFile[] = [
  {
    name: 'customers_10000',
    label: 'customers_10000.csv',
    description:
      '10,000 customer records with names, companies, locations, and contact info',
    url: 'https://raw.githubusercontent.com/andeplane/ai-data-analytics/refs/heads/main/example-data/customers_10000.csv',
  },
  // More files can be added here later
]

// Default dependencies for production
const defaultDependencies = {
  fetchFile: async (url: string): Promise<string> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch file`)
    }
    return response.text()
  },
}

export type UseExampleDataBubblesViewModelContextType = typeof defaultDependencies
export const UseExampleDataBubblesViewModelContext = createContext<UseExampleDataBubblesViewModelContextType>(defaultDependencies)

export interface ExampleDataBubblesViewModel {
  loadingFile: string | null
  handleLoadExample: (file: ExampleFile) => Promise<void>
}

export function useExampleDataBubblesViewModel(
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>
): ExampleDataBubblesViewModel {
  const { fetchFile } = useContext(UseExampleDataBubblesViewModelContext)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)

  const handleLoadExample = useCallback(
    async (file: ExampleFile) => {
      setLoadingFile(file.name)
      try {
        const content = await fetchFile(file.url)
        await onFileLoad(file.name, content, 'csv')
      } catch (error) {
        console.error('Failed to load example file:', error)
        alert(
          `Failed to load example: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoadingFile(null)
      }
    },
    [fetchFile, onFileLoad]
  )

  return {
    loadingFile,
    handleLoadExample,
  }
}

