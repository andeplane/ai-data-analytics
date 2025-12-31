import { useState, useEffect, useCallback } from 'react'
import { usePyodide } from './hooks/usePyodide'
import { usePandasAI } from './hooks/usePandasAI'
import { useLLMChat, type Message } from './hooks/useLLMChat'
import { FileUpload } from './components/FileUpload'
import { DataFrameList, type DataFrame } from './components/DataFrameList'
import type { DataFrameInfo } from './lib/systemPrompt'

function App() {
  const { pyodide, status: pyodideStatus } = usePyodide()
  const { status: pandasStatus, loadPandasAI, loadDataframe, getDataframeInfo } = usePandasAI(pyodide)
  
  const [apiUrl] = useState('https://api.cognitedata.com/api/v1/projects/andershaf/ai/chat/completions')
  const [bearerToken] = useState(import.meta.env.VITE_COGNITE_TOKEN || '')
  
  const [dataframes, setDataframes] = useState<DataFrame[]>([])
  const [queuedFiles, setQueuedFiles] = useState<Array<{ name: string; content: string; type: 'csv' | 'json' }>>([])

  // Convert dataframes to DataFrameInfo for the chat hook
  const dataframeInfos: DataFrameInfo[] = dataframes.map((df) => ({
    name: df.name,
    rows: df.rows,
    columns: df.columns,
  }))

  // Chat handler using the new LLM chat hook
  const chat = useLLMChat({
    pyodide,
    apiUrl,
    bearerToken,
    dataframes: dataframeInfos,
  })

  // Auto-load PandasAI when Pyodide is ready
  useEffect(() => {
    if (pyodideStatus === 'ready' && pandasStatus === 'idle' && bearerToken) {
      loadPandasAI(apiUrl, bearerToken)
    }
  }, [pyodideStatus, pandasStatus, apiUrl, bearerToken, loadPandasAI])

  // Handle file upload
  const handleFileLoad = useCallback(async (name: string, content: string, type: 'csv' | 'json') => {
    // If PandasAI is not ready, queue the file
    if (pandasStatus !== 'ready') {
      setQueuedFiles(prev => [...prev, { name, content, type }])
      // Add to dataframes list immediately (will be processed when ready)
      setDataframes(prev => {
        const existing = prev.findIndex(df => df.name === name)
        if (existing >= 0) return prev
        const newDf: DataFrame = { name, rows: 0, columns: [] }
        return [...prev, newDf]
      })
      return
    }

    try {
      // Convert JSON to CSV if needed
      let csvContent = content
      if (type === 'json') {
        const json = JSON.parse(content)
        const arr = Array.isArray(json) ? json : [json]
        if (arr.length === 0) {
          throw new Error('JSON array is empty')
        }
        const headers = Object.keys(arr[0])
        const rows = arr.map((obj: Record<string, unknown>) => headers.map(h => String(obj[h] ?? '')).join(','))
        csvContent = [headers.join(','), ...rows].join('\n')
      }

      await loadDataframe(name, csvContent)
      
      // Get dataframe info
      const info = await getDataframeInfo(name)
      
      setDataframes(prev => {
        const existing = prev.findIndex(df => df.name === name)
        const newDf: DataFrame = { name, rows: info.rows, columns: info.columns }
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = newDf
          return updated
        }
        return [...prev, newDf]
      })
    } catch (err) {
      console.error('Failed to load file:', err)
      alert(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [loadDataframe, getDataframeInfo, pandasStatus])

  // Process queued files when PandasAI becomes ready
  useEffect(() => {
    if (pandasStatus === 'ready' && queuedFiles.length > 0 && pyodide) {
      const processQueue = async () => {
        const filesToProcess = [...queuedFiles]
        setQueuedFiles([])
        for (const file of filesToProcess) {
          try {
            // Convert JSON to CSV if needed
            let csvContent = file.content
            if (file.type === 'json') {
              const json = JSON.parse(file.content)
              const arr = Array.isArray(json) ? json : [json]
              if (arr.length === 0) {
                throw new Error('JSON array is empty')
              }
              const headers = Object.keys(arr[0])
              const rows = arr.map((obj: Record<string, unknown>) => headers.map(h => String(obj[h] ?? '')).join(','))
              csvContent = [headers.join(','), ...rows].join('\n')
            }

            await loadDataframe(file.name, csvContent)
            
            // Get dataframe info
            const info = await getDataframeInfo(file.name)
            
            setDataframes(prev => {
              const existing = prev.findIndex(df => df.name === file.name)
              const newDf: DataFrame = { name: file.name, rows: info.rows, columns: info.columns }
              if (existing >= 0) {
                const updated = [...prev]
                updated[existing] = newDf
                return updated
              }
              return [...prev, newDf]
            })
          } catch (err) {
            console.error('Failed to process queued file:', err)
          }
        }
      }
      processQueue()
    }
  }, [pandasStatus, queuedFiles, pyodide, loadDataframe, getDataframeInfo])

  // Send message handler
  const handleSendMessage = useCallback(() => {
    if (!chat.input.trim()) return
    chat.sendMessage(chat.input)
  }, [chat])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <aside className="w-72 border-r border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">📊</span>
            Data Analyst
          </h1>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${pandasStatus === 'ready' ? 'bg-green-500' : pandasStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
            <span className="text-zinc-400">
              {pandasStatus === 'ready' ? 'Ready' : pandasStatus === 'error' ? 'Error' : 'Loading...'}
            </span>
          </div>
        </div>

        {/* DataFrames List */}
        <div className="flex-1 p-4 overflow-y-auto">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            DataFrames ({dataframes.length})
          </h2>
          <DataFrameList 
            dataframes={dataframes} 
            activeDataframe={null}
            onSelect={() => {}}
          />
        </div>

        {/* File Upload */}
        <div className="p-4 border-t border-zinc-800">
          <FileUpload 
            onFileLoad={handleFileLoad}
          />
        </div>
      </aside>

      {/* Main Content - Chat Area */}
      <main className="flex-1 flex flex-col h-screen">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chat.messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center h-full text-zinc-500">
              <div className="text-center">
                <div className="text-5xl mb-4">💬</div>
                <p className="text-lg">Start a conversation</p>
                <p className="text-sm mt-2">
                  {dataframes.length === 0
                    ? 'Upload some data files and ask questions about them'
                    : `You have ${dataframes.length} dataframe${dataframes.length > 1 ? 's' : ''} loaded. Ask me anything!`}
                </p>
              </div>
            </div>
          ) : (
            chat.messages.map((message: Message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          
          {/* Loading indicator */}
          {chat.isLoading && (
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-2 text-sm">Thinking...</span>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900">
          <div className="flex gap-3">
            <input
              type="text"
              value={chat.input}
              onChange={(e) => chat.setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder={
                pandasStatus !== 'ready'
                  ? 'Waiting for system to load...'
                  : dataframes.length === 0
                  ? 'Upload a file first, or just say hi!'
                  : 'Ask about your data or just chat...'
              }
              disabled={chat.isLoading}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={chat.isLoading || !chat.input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg text-sm font-medium transition-colors"
            >
              {chat.isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </span>
              ) : (
                'Send'
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * Message bubble component for rendering chat messages.
 */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-zinc-100'
        }`}
      >
        {message.parts.map((part, idx) => {
          if (part.type === 'text' && part.text) {
            return (
              <p key={idx} className="whitespace-pre-wrap">
                {part.text}
              </p>
            )
          }
          if (part.type === 'image' && part.image) {
            return (
              <img
                key={idx}
                src={part.image}
                alt="Chart"
                className="mt-2 max-w-full rounded-lg"
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

export default App
