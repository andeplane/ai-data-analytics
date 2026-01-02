import { createContext, useCallback, useContext, useState } from 'react'
import { useAnalytics } from '../lib/analytics'

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
  {
    name: 'students-performance',
    label: 'students-performance.csv',
    description:
      'Student performance data with demographics, parental education, and test scores (math, reading, writing)',
    url: 'https://raw.githubusercontent.com/andeplane/ai-data-analytics/refs/heads/main/example-data/students-performance.csv',
  },
  {
    name: 'winequality-red',
    label: 'winequality-red.csv',
    description:
      'Red wine quality dataset with chemical properties (acidity, sugar, alcohol, etc.) and quality ratings',
    url: 'https://raw.githubusercontent.com/andeplane/ai-data-analytics/refs/heads/main/example-data/winequality-red.csv',
  },
  {
    name: 'housedata',
    label: 'housedata.csv',
    description:
      'House sales data with property details (bedrooms, bathrooms, square footage, location, price, year built, etc.)',
    url: 'https://raw.githubusercontent.com/andeplane/ai-data-analytics/refs/heads/main/example-data/housedata.csv',
  },
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
  onFileLoad: (name: string, content: string, type: 'csv' | 'json', source?: 'user_upload' | 'example_data') => Promise<void>
): ExampleDataBubblesViewModel {
  const { fetchFile } = useContext(UseExampleDataBubblesViewModelContext)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const analytics = useAnalytics()

  const handleLoadExample = useCallback(
    async (file: ExampleFile) => {
      setLoadingFile(file.name)
      try {
        // Track example click
        analytics.trackExampleClick({
          type: 'example_data',
          value: file.name,
        })
        
        const content = await fetchFile(file.url)
        await onFileLoad(file.name, content, 'csv', 'example_data')
      } catch (error) {
        console.error('Failed to load example file:', error)
        alert(
          `Failed to load example: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoadingFile(null)
      }
    },
    [fetchFile, onFileLoad, analytics]
  )

  return {
    loadingFile,
    handleLoadExample,
  }
}

