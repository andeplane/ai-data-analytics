import type { DataFrame } from '../hooks/useDataframes'

interface DataFrameListProps {
  dataframes: DataFrame[]
  activeDataframe: string | null
  onSelect: (name: string) => void
  onRemove: (name: string) => void
}

export function DataFrameList({ dataframes, activeDataframe, onSelect, onRemove }: DataFrameListProps) {
  if (dataframes.length === 0) {
    return (
      <div className="text-zinc-500 text-sm italic">
        No dataframes loaded
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {dataframes.map((df) => (
        <div
          key={df.name}
          className="group relative"
        >
          <button
            onClick={() => onSelect(df.name)}
            className={`
              w-full text-left p-3 rounded-lg transition-colors
              ${activeDataframe === df.name 
                ? 'bg-blue-600/20 border border-blue-500/50' 
                : 'bg-zinc-800 hover:bg-zinc-700 border border-transparent'}
            `}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{df.name}</div>
                <div className="text-xs text-zinc-400">
                  {df.rows} rows · {df.columns.length} columns
                </div>
              </div>
            </div>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(df.name)
            }}
            className="
              absolute right-2 top-1/2 -translate-y-1/2
              opacity-0 group-hover:opacity-100
              w-6 h-6 flex items-center justify-center
              rounded hover:bg-zinc-700
              text-zinc-400 hover:text-zinc-200
              transition-opacity
            "
            title="Remove dataframe"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

