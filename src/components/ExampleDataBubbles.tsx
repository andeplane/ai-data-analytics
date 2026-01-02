import {
  EXAMPLE_FILES,
  useExampleDataBubblesViewModel,
} from '../hooks/useExampleDataBubblesViewModel'

interface ExampleDataBubblesProps {
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>
}

export function ExampleDataBubbles({ onFileLoad }: ExampleDataBubblesProps) {
  const { loadingFile, handleLoadExample } = useExampleDataBubblesViewModel(onFileLoad)

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
