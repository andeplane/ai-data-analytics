import { useEffect, useMemo, useCallback, useRef } from 'react'
import { usePyodide } from './hooks/usePyodide'
import { usePandasAI } from './hooks/usePandasAI'
import { useWebLLM } from './hooks/useWebLLM'
import { useLLMChat, generateId, type SystemLoadingState } from './hooks/useLLMChat'
import { useStarterQuestions } from './hooks/useStarterQuestions'
import { useDataframes } from './hooks/useDataframes'
import { Sidebar } from './components/Sidebar'
import { ChartImagePartUI } from './components/ChartImagePartUI'
import { ToolCallCollapsible } from './components/ToolCallCollapsible'
import { StarterBubbles } from './components/StarterBubbles'
import { ExampleDataBubbles } from './components/ExampleDataBubbles'
import { LoadingMessage } from './components/LoadingMessage'
import { ThinkingMessage } from './components/ThinkingMessage'
import { callLLM } from './lib/llmCaller'
import type { DataFrameInfo } from './lib/systemPrompt'
import { useAnalytics } from './lib/analytics'
import {
  ChatSection,
  ChatMessages,
  ChatInput,
  ChatMessage,
} from '@llamaindex/chat-ui'
import type { ChatHandler, Message, MessagePart } from '@llamaindex/chat-ui'

function App() {
  const analytics = useAnalytics()
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
  
  const { pyodide, status: pyodideStatus, error: pyodideError } = usePyodide({ onLLMRequest: handleLLMRequest })
  const { status: pandasStatus, error: pandasError, loadPandasAI, retryPandasAI, loadDataframe, getDataframeInfo, removeDataframe } = usePandasAI(pyodide)
  
  // Dataframe management
  const { dataframes, hasQueuedFiles, handleFileLoad, removeDataframe: handleRemoveDataframe } = useDataframes({
    pyodide,
    pandasStatus,
    loadDataframe,
    getDataframeInfo,
    removeDataframe,
  })
  
  // Wrapper for file load that passes user_upload source
  const handleUserFileLoad = useCallback(async (name: string, content: string, type: 'csv' | 'json') => {
    await handleFileLoad(name, content, type, 'user_upload')
  }, [handleFileLoad])

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
    pyodideError,
    pandasError,
    onRetryPandas: retryPandasAI,
  }), [webllmStatus, webllmProgress, webllmProgressText, elapsedTime, estimatedTimeRemaining, pyodideStatus, pandasStatus, hasQueuedFiles, pyodideError, pandasError, retryPandasAI])

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

  // Compute isSystemReady for the chat area
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
            pyodideError={loadingState.pyodideError}
            pandasError={loadingState.pandasError}
            onRetryPandas={loadingState.onRetryPandas}
          />
        </ChatMessage.Content>
      )
    }

    return (
      <ChatMessage.Content>
        {/* Render tool call executions in collapsible section (above response) */}
        <ToolCallCollapsible />
        <ChatMessage.Content.Markdown className="prose-invert" />
        {/* Render chart images with custom component for proper sizing */}
        <ChartImagePartUI className="mt-2" />
      </ChatMessage.Content>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <Sidebar
        webllmStatus={webllmStatus}
        webllmProgress={webllmProgress}
        webllmProgressText={webllmProgressText}
        elapsedTime={elapsedTime}
        estimatedTimeRemaining={estimatedTimeRemaining}
        webllmError={webllmError}
        pyodideStatus={pyodideStatus}
        pandasStatus={pandasStatus}
        pandasError={pandasError}
        hasQueuedFiles={hasQueuedFiles}
        dataframes={dataframes.map(df => ({ name: df.name, rows: df.rows, columns: df.columns }))}
        dataframesForList={dataframes}
        setMessages={chat.setMessages}
        retryPandasAI={retryPandasAI}
        removeDataframe={handleRemoveDataframe}
        onFileLoad={handleUserFileLoad}
      />

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
            
            <ChatMessages.Loading className="p-4">
              <ThinkingMessage toolCallProgress={chat.toolCallProgress} />
            </ChatMessages.Loading>
            
            <ChatMessages.Empty className="flex-1 flex flex-col items-center justify-center h-full text-zinc-500">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-zinc-300 mb-2">Start a conversation</h2>
                {dataframes.length > 0 && (
                  <p className="text-sm">
                    {`You have ${dataframes.length} dataframe${dataframes.length > 1 ? 's' : ''} loaded. Ask me anything!`}
                  </p>
                )}
              </div>
              
              {/* Example data bubbles when no dataframes loaded */}
              {dataframes.length === 0 && (
                <div className="mt-4">
                  <ExampleDataBubbles onFileLoad={handleFileLoad} />
                </div>
              )}
              
              {/* Starter question bubbles */}
              {isSystemReady && dataframes.length > 0 && (
                <StarterBubbles
                  questions={starterQuestions}
                  isLoading={starterQuestionsLoading}
                  onSelect={(question) => {
                    analytics.trackExampleClick({
                      type: 'example_question',
                      value: question,
                    })
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
