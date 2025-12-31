import { useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type ResultType = 'text' | 'number' | 'table' | 'chart' | 'image'

interface ChartData {
  type: 'bar' | 'line' | 'pie'
  data: Record<string, unknown>[]
  xKey?: string
  yKey?: string
}

interface TableData {
  columns: string[]
  rows: Record<string, unknown>[]
}

interface ResultValue {
  type: ResultType
  value: string | number | TableData | ChartData
}

interface ResultsRendererProps {
  result: ResultValue | string | number | null
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

/**
 * Renders an image from a file path (typically a chart from PandasAI).
 */
function ImageRenderer({ src }: { src: string }) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4 text-zinc-400">
        <p>Failed to load image: {src}</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <img
        src={src}
        alt="Generated chart"
        className="max-w-full h-auto rounded"
        onError={() => setError(true)}
      />
    </div>
  )
}

export function ResultsRenderer({ result }: ResultsRendererProps) {
  if (result === null || result === undefined) {
    return null
  }

  // Handle simple string/number results
  if (typeof result === 'string' || typeof result === 'number') {
    const strResult = String(result)
    
    // Check if it's an image path
    if (strResult.endsWith('.png') || strResult.endsWith('.jpg') || strResult.endsWith('.jpeg')) {
      return <ImageRenderer src={strResult} />
    }
    
    return (
      <div className="bg-zinc-800 rounded-lg p-4">
        <span className="text-lg">{strResult}</span>
      </div>
    )
  }

  // Handle structured results
  const { type, value } = result as ResultValue

  switch (type) {
    case 'text':
      return (
        <div className="bg-zinc-800 rounded-lg p-4">
          <span>{String(value)}</span>
        </div>
      )

    case 'number':
      return (
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <span className="text-3xl font-bold text-blue-400">{String(value)}</span>
        </div>
      )

    case 'table':
      return <TableRenderer data={value as TableData} />

    case 'chart':
      return <ChartRenderer data={value as ChartData} />

    case 'image':
      return <ImageRenderer src={String(value)} />

    default:
      return (
        <div className="bg-zinc-800 rounded-lg p-4">
          <pre className="text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )
  }
}

function TableRenderer({ data }: { data: TableData }) {
  const { columns, rows } = data

  if (!rows || rows.length === 0) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4 text-zinc-400">
        No data to display
      </div>
    )
  }

  return (
    <div className="bg-zinc-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left font-medium text-zinc-300 bg-zinc-900"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-700/50 hover:bg-zinc-700/30">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-2 text-zinc-200">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChartRenderer({ data }: { data: ChartData }) {
  const { type, data: chartData, xKey = 'x', yKey = 'y' } = data

  if (!chartData || chartData.length === 0) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4 text-zinc-400">
        No chart data to display
      </div>
    )
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <ResponsiveContainer width="100%" height={300}>
        {type === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#f3f4f6' }}
            />
            <Bar dataKey={yKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#f3f4f6' }}
            />
            <Line type="monotone" dataKey={yKey} stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
          </LineChart>
        ) : (
          <PieChart>
            <Pie
              data={chartData}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name }) => name}
            >
              {chartData.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#f3f4f6' }}
            />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export type { ResultValue, ChartData, TableData }

