interface DataFrame {
  name: string
  rows: number
  columns: string[]
}

interface DataFrameListProps {
  dataframes: DataFrame[]
  activeDataframe: string | null
  onSelect: (name: string) => void
}

export function DataFrameList({ dataframes, activeDataframe, onSelect }: DataFrameListProps) {
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
        <button
          key={df.name}
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
      ))}
    </div>
  )
}

export type { DataFrame }

