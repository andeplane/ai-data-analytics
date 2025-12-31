import { useState, useEffect, useCallback } from 'react'
import { ChatSection } from '@llamaindex/chat-ui'
import { usePyodide } from './hooks/usePyodide'
import { usePandasAI } from './hooks/usePandasAI'
import { usePandasAIChat, generateId, type Message } from './hooks/usePandasAIChat'
import { FileUpload } from './components/FileUpload'
import { DataFrameList, type DataFrame } from './components/DataFrameList'
import '@llamaindex/chat-ui/styles/markdown.css'

function App() {
  const { pyodide, status: pyodideStatus } = usePyodide()
  const { status: pandasStatus, loadPandasAI, loadDataframe, getDataframeInfo } = usePandasAI(pyodide)
  
  const [apiUrl] = useState('https://api.cognitedata.com/api/v1/projects/andershaf/ai/chat/completions')
  const [bearerToken] = useState(import.meta.env.VITE_COGNITE_TOKEN || '')
  
  const [dataframes, setDataframes] = useState<DataFrame[]>([])
  const [activeDataframe, setActiveDataframe] = useState<string | null>(null)
  const [queuedFiles, setQueuedFiles] = useState<Array<{ name: string; content: string; type: 'csv' | 'json' }>>([])

  // Chat handler for @llamaindex/chat-ui
  const chatHandler = usePandasAIChat({ pyodide, activeDataframe })

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
      if (!activeDataframe) {
        setActiveDataframe(name)
      }
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
      
      // Auto-select if first dataframe
      if (!activeDataframe) {
        setActiveDataframe(name)
      }
    } catch (err) {
      console.error('Failed to load file:', err)
      alert(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [loadDataframe, getDataframeInfo, activeDataframe, pandasStatus])

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
            
            // Auto-select if first dataframe
            if (!activeDataframe) {
              setActiveDataframe(file.name)
            }
          } catch (err) {
            console.error('Failed to process queued file:', err)
          }
        }
      }
      processQueue()
    }
  }, [pandasStatus, queuedFiles, pyodide, loadDataframe, getDataframeInfo, activeDataframe])

  // Custom send message handler
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !activeDataframe) return

    // If PandasAI is not ready, show waiting message
    if (pandasStatus !== 'ready') {
      const waitingMessage: Message = {
        id: generateId(),
        role: 'assistant',
        parts: [{ type: 'text', text: 'Waiting for PandasAI to load... Please wait a moment and try again.' }],
      }
      if (chatHandler.setMessages) {
        chatHandler.setMessages([...chatHandler.messages, waitingMessage])
      }
      return
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      parts: [{ type: 'text', text: content }],
    }

    await chatHandler.sendMessage(userMessage)
    chatHandler.setInput('')
  }, [chatHandler, activeDataframe, pandasStatus])

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
              DataFrames
            </h2>
            <DataFrameList 
              dataframes={dataframes} 
              activeDataframe={activeDataframe}
              onSelect={setActiveDataframe}
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
        <main className="flex-1 flex flex-col">
          {!activeDataframe ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500">
              <div className="text-center">
                <div className="text-5xl mb-4">📁</div>
                <p className="text-lg">Upload a CSV or JSON file to get started</p>
                <p className="text-sm mt-2">Then ask questions about your data</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-screen">
              {/* Active DataFrame Header */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <span className="font-medium">{activeDataframe}</span>
                  <span className="text-xs text-zinc-500">
                    ({dataframes.find(df => df.name === activeDataframe)?.rows} rows)
                  </span>
                </div>
              </div>

              {/* Chat Section */}
              <div className="flex-1 overflow-hidden">
                <ChatSection 
                  handler={{
                    messages: chatHandler.messages,
                    status: chatHandler.status,
                    sendMessage: chatHandler.sendMessage,
                    stop: chatHandler.stop,
                    setMessages: chatHandler.setMessages,
                  }}
                />
              </div>

              {/* Custom Input - fallback if ChatSection doesn't render input */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={chatHandler.input}
                    onChange={(e) => chatHandler.setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage(chatHandler.input)}
                    placeholder="Ask a question about your data..."
                    disabled={chatHandler.isLoading}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleSendMessage(chatHandler.input)}
                    disabled={chatHandler.isLoading || !chatHandler.input.trim() || pandasStatus !== 'ready'}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    {chatHandler.isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Thinking...
                      </span>
                    ) : pandasStatus !== 'ready' ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      'Send'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
  )
}

export default App
