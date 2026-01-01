import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePyodide } from './hooks/usePyodide'
import { usePandasAI } from './hooks/usePandasAI'
import { useWebLLM, MODEL_ID, formatTime } from './hooks/useWebLLM'
import { useLLMChat } from './hooks/useLLMChat'
import { FileUpload } from './components/FileUpload'
import { DataFrameList, type DataFrame } from './components/DataFrameList'
import type { DataFrameInfo } from './lib/systemPrompt'
import {
  ChatSection,
  ChatMessages,
  ChatInput,
  ChatMessage,
} from '@llamaindex/chat-ui'
import type { ChatHandler, Message } from '@llamaindex/chat-ui'

function App() {
  const { pyodide, status: pyodideStatus } = usePyodide()
  const { status: pandasStatus, loadPandasAI, loadDataframe, getDataframeInfo } = usePandasAI(pyodide)
  const { engine, status: webllmStatus, progress: webllmProgress, progressText: webllmProgressText, elapsedTime, estimatedTimeRemaining, error: webllmError, loadModel } = useWebLLM()
  
  const [dataframes, setDataframes] = useState<DataFrame[]>([])
  const [queuedFiles, setQueuedFiles] = useState<Array<{ name: string; content: string; type: 'csv' | 'json' }>>([])

  // Convert dataframes to DataFrameInfo for the chat hook
  const dataframeInfos: DataFrameInfo[] = dataframes.map((df) => ({
    name: df.name,
    rows: df.rows,
    columns: df.columns,
    head: df.head,
  }))

  // Chat handler using the LLM chat hook with web-llm engine
  const chat = useLLMChat({
    pyodide,
    engine,
    dataframes: dataframeInfos,
  })

  // Create a ChatHandler compatible object for @llamaindex/chat-ui
  const chatHandler: ChatHandler = useMemo(() => ({
    messages: chat.messages,
    status: chat.status,
    sendMessage: chat.sendMessage,
    stop: chat.stop,
    setMessages: chat.setMessages,
  }), [chat.messages, chat.status, chat.sendMessage, chat.stop, chat.setMessages])

  // Auto-load web-llm model on mount
  useEffect(() => {
    if (webllmStatus === 'idle') {
      loadModel()
    }
  }, [webllmStatus, loadModel])

  // Auto-load PandasAI when both Pyodide and web-llm are ready
  useEffect(() => {
    if (pyodideStatus === 'ready' && webllmStatus === 'ready' && pandasStatus === 'idle') {
      loadPandasAI()
    }
  }, [pyodideStatus, webllmStatus, pandasStatus, loadPandasAI])

  // Handle file upload
  const handleFileLoad = useCallback(async (name: string, content: string, type: 'csv' | 'json') => {
    // If PandasAI is not ready, queue the file
    if (pandasStatus !== 'ready') {
      setQueuedFiles(prev => [...prev, { name, content, type }])
      // Add to dataframes list immediately (will be processed when ready)
      setDataframes(prev => {
        const existing = prev.findIndex(df => df.name === name)
        if (existing >= 0) return prev
        const newDf: DataFrame = { name, rows: 0, columns: [], head: [] }
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
        const newDf: DataFrame = { name, rows: info.rows, columns: info.columns, head: info.head }
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
              const newDf: DataFrame = { name: file.name, rows: info.rows, columns: info.columns, head: info.head }
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

  // Compute overall system status
  const getSystemStatus = () => {
    if (webllmStatus === 'loading') return { text: 'Loading AI model...', color: 'bg-yellow-500 animate-pulse' }
    if (webllmStatus === 'error') return { text: `Model error: ${webllmError}`, color: 'bg-red-500' }
    if (pyodideStatus !== 'ready') return { text: 'Loading Python...', color: 'bg-yellow-500 animate-pulse' }
    if (pandasStatus === 'loading') return { text: 'Loading PandasAI...', color: 'bg-yellow-500 animate-pulse' }
    if (pandasStatus === 'error') return { text: 'PandasAI Error', color: 'bg-red-500' }
    if (pandasStatus === 'ready' && webllmStatus === 'ready') return { text: 'Ready', color: 'bg-green-500' }
    return { text: 'Initializing...', color: 'bg-yellow-500 animate-pulse' }
  }

  const systemStatus = getSystemStatus()
  const isSystemReady = pandasStatus === 'ready' && webllmStatus === 'ready'

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
            <span className={`w-2 h-2 rounded-full ${systemStatus.color}`} />
            <span className="text-zinc-400">{systemStatus.text}</span>
          </div>
          
          {/* Model loading progress */}
          {webllmStatus === 'loading' && (
            <div className="mt-3">
              <div className="text-xs text-zinc-500 mb-1 truncate" title={webllmProgressText}>
                {webllmProgressText}
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(webllmProgress * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>{Math.round(webllmProgress * 100)}%</span>
                <span>
                  {formatTime(elapsedTime)}
                  {estimatedTimeRemaining !== null && (
                    <span className="text-zinc-600"> • ETA {formatTime(estimatedTimeRemaining)}</span>
                  )}
                </span>
              </div>
            </div>
          )}
          
          {/* Model info when ready */}
          {webllmStatus === 'ready' && (
            <div className="mt-2 text-xs text-zinc-500">
              Model: {MODEL_ID.split('-').slice(0, 3).join('-')}
            </div>
          )}
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

      {/* Main Content - Chat Area using @llamaindex/chat-ui */}
      <main className="flex-1 flex flex-col h-screen">
        <ChatSection handler={chatHandler} className="flex-1 flex flex-col">
          {/* Chat Messages */}
          <ChatMessages className="flex-1 overflow-y-auto p-4">
            <ChatMessages.List className="space-y-4">
              {chatHandler.messages.map((message: Message, index: number) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLast={index === chatHandler.messages.length - 1}
                  className={message.role === 'user' ? 'justify-end' : 'justify-start'}
                >
                  <ChatMessage.Content>
                    <ChatMessage.Content.Markdown className="prose-invert" />
                    <ChatMessage.Content.File className="mt-2" />
                  </ChatMessage.Content>
                </ChatMessage>
              ))}
            </ChatMessages.List>
            
            <ChatMessages.Loading className="flex items-center gap-2 text-zinc-400 p-4">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-2 text-sm">Thinking...</span>
            </ChatMessages.Loading>
            
            <ChatMessages.Empty 
              className="flex-1 flex items-center justify-center h-full text-zinc-500"
              heading="Start a conversation"
              subheading={
                !isSystemReady
                  ? 'Please wait for the AI model to load...'
                  : dataframes.length === 0
                  ? 'Upload some data files and ask questions about them'
                  : `You have ${dataframes.length} dataframe${dataframes.length > 1 ? 's' : ''} loaded. Ask me anything!`
              }
            />
          </ChatMessages>

          {/* Input Area */}
          <ChatInput className="p-4 border-t border-zinc-800 bg-zinc-900">
            <ChatInput.Form className="flex gap-3">
              <ChatInput.Field 
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                placeholder={
                  !isSystemReady
                    ? 'Waiting for AI model to load...'
                    : dataframes.length === 0
                    ? 'Upload a file first, or just say hi!'
                    : 'Ask about your data or just chat...'
                }
              />
              <ChatInput.Submit 
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg text-sm font-medium transition-colors"
                disabled={!isSystemReady}
              >
                Send
              </ChatInput.Submit>
            </ChatInput.Form>
          </ChatInput>
        </ChatSection>
      </main>
    </div>
  )
}

export default App
