import { useEffect, useMemo, useCallback, useRef } from 'react'
import { usePyodide } from './hooks/usePyodide'
import { usePandasAI } from './hooks/usePandasAI'
import { useWebLLM, MODEL_ID, formatTime } from './hooks/useWebLLM'
import { useLLMChat, generateId, type SystemLoadingState } from './hooks/useLLMChat'
import { useStarterQuestions } from './hooks/useStarterQuestions'
import { useDataframes } from './hooks/useDataframes'
import { FileUpload } from './components/FileUpload'
import { DataFrameList } from './components/DataFrameList'
import { ChartImagePartUI } from './components/ChartImagePartUI'
import { StarterBubbles } from './components/StarterBubbles'
import { LoadingMessage } from './components/LoadingMessage'
import { callLLM } from './lib/llmCaller'
import type { DataFrameInfo } from './lib/systemPrompt'
import {
  ChatSection,
  ChatMessages,
  ChatInput,
  ChatMessage,
} from '@llamaindex/chat-ui'
import type { ChatHandler, Message, MessagePart } from '@llamaindex/chat-ui'

function App() {
  const { engine, status: webllmStatus, progress: webllmProgress, progressText: webllmProgressText, elapsedTime, estimatedTimeRemaining, error: webllmError, loadModel } = useWebLLM()
  
  // Keep a ref to the engine so the LLM handler can access it
  const engineRef = useRef(engine)
  useEffect(() => {
    engineRef.current = engine
  }, [engine])
  
  // LLM handler for Pyodide worker - called when PandasAI needs LLM inference
  const handleLLMRequest = useCallback(async (prompt: string): Promise<string> => {
    const currentEngine = engineRef.current
    if (!currentEngine) {
      throw new Error('WebLLM engine not ready')
    }
    
    return callLLM(currentEngine, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 2000,
      source: 'pandasai',
    })
  }, [])
  
  const { pyodide, status: pyodideStatus } = usePyodide({ onLLMRequest: handleLLMRequest })
  const { status: pandasStatus, loadPandasAI, loadDataframe, getDataframeInfo } = usePandasAI(pyodide)
  
  // Dataframe management
  const { dataframes, hasQueuedFiles, handleFileLoad } = useDataframes({
    pyodide,
    pandasStatus,
    loadDataframe,
    getDataframeInfo,
  })

  // Convert dataframes to DataFrameInfo for the chat hook
  const dataframeInfos: DataFrameInfo[] = dataframes.map((df) => ({
    name: df.name,
    rows: df.rows,
    columns: df.columns,
    head: df.head,
  }))

  // Build loading state object for the chat hook
  const loadingState: SystemLoadingState = useMemo(() => ({
    webllmStatus,
    webllmProgress,
    webllmProgressText,
    elapsedTime,
    estimatedTimeRemaining,
    pyodideStatus,
    pandasStatus,
    hasQueuedFiles,
  }), [webllmStatus, webllmProgress, webllmProgressText, elapsedTime, estimatedTimeRemaining, pyodideStatus, pandasStatus, hasQueuedFiles])

  // Chat handler using the LLM chat hook with web-llm engine
  const chat = useLLMChat({
    pyodide,
    engine,
    dataframes: dataframeInfos,
    loadingState,
  })

  // Generate context-aware starter questions based on loaded dataframes
  const { questions: starterQuestions, isLoading: starterQuestionsLoading } = useStarterQuestions({
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

  // Auto-load PandasAI when Pyodide is ready (no need to wait for WebLLM)
  // WebLLM is only needed when actually calling the LLM, not during setup
  useEffect(() => {
    if (pyodideStatus === 'ready' && pandasStatus === 'idle') {
      loadPandasAI()
    }
  }, [pyodideStatus, pandasStatus, loadPandasAI])

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
  const isSystemReady = pandasStatus === 'ready' && webllmStatus === 'ready' && !hasQueuedFiles

  // Helper to check if a message part is a loading part
  const isLoadingPart = (part: MessagePart): part is MessagePart & { type: 'loading'; loadingState: SystemLoadingState } => {
    return (part as { type: string }).type === 'loading'
  }

  // Helper to render message content (handles loading messages)
  const renderMessageContent = (message: Message) => {
    const loadingPart = message.parts.find(isLoadingPart)
    
    if (loadingPart) {
      // Use the current loading state (most up-to-date) instead of the stored one
      return (
        <ChatMessage.Content>
          <LoadingMessage
            webllmStatus={loadingState.webllmStatus}
            webllmProgress={loadingState.webllmProgress}
            webllmProgressText={loadingState.webllmProgressText}
            elapsedTime={loadingState.elapsedTime}
            estimatedTimeRemaining={loadingState.estimatedTimeRemaining}
            pyodideStatus={loadingState.pyodideStatus}
            pandasStatus={loadingState.pandasStatus}
            hasQueuedFiles={loadingState.hasQueuedFiles}
          />
        </ChatMessage.Content>
      )
    }

    return (
      <ChatMessage.Content>
        <ChatMessage.Content.Markdown className="prose-invert" />
        {/* Render chart images with custom component for proper sizing */}
        <ChartImagePartUI className="mt-2" />
      </ChatMessage.Content>
    )
  }

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
          
          {/* New Conversation button */}
          <button
            onClick={() => chat.setMessages?.([])}
            className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors"
          >
            + New Conversation
          </button>
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
                  {renderMessageContent(message)}
                </ChatMessage>
              ))}
            </ChatMessages.List>
            
            <ChatMessages.Loading className="flex items-center gap-2 text-zinc-400 p-4">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-2 text-sm">Thinking...</span>
            </ChatMessages.Loading>
            
            <ChatMessages.Empty className="flex-1 flex flex-col items-center justify-center h-full text-zinc-500">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-zinc-300 mb-2">Start a conversation</h2>
                <p className="text-sm">
                  {dataframes.length === 0
                    ? 'Upload some data files and ask questions about them'
                    : `You have ${dataframes.length} dataframe${dataframes.length > 1 ? 's' : ''} loaded. Ask me anything!`}
                </p>
              </div>
              
              {/* Starter question bubbles */}
              {isSystemReady && dataframes.length > 0 && (
                <StarterBubbles
                  questions={starterQuestions}
                  isLoading={starterQuestionsLoading}
                  onSelect={(question) => {
                    chat.sendMessage({
                      id: generateId(),
                      role: 'user',
                      parts: [{ type: 'text', text: question }],
                    })
                  }}
                />
              )}
            </ChatMessages.Empty>
          </ChatMessages>

          {/* Input Area */}
          <ChatInput className="p-4 border-t border-zinc-800 bg-zinc-900">
            <ChatInput.Form className="flex gap-3">
              <ChatInput.Field 
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                placeholder={
                  dataframes.length === 0
                    ? 'Upload a file first, or just say hi!'
                    : 'Ask about your data or just chat...'
                }
              />
              <ChatInput.Submit 
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg text-sm font-medium transition-colors"
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
