import { useState } from 'react'
import { usePyodide } from './hooks/usePyodide'
import { usePandasAI } from './hooks/usePandasAI'

function App() {
  const { pyodide, status: pyodideStatus, error: pyodideError } = usePyodide()
  const { status: pandasStatus, error: pandasError, loadPandasAI, chat, loadDataframe } = usePandasAI(pyodide)
  
  const [apiUrl, setApiUrl] = useState('https://api.cognitedata.com/api/v1/projects/andershaf/ai/chat/completions')
  const [bearerToken, setBearerToken] = useState(import.meta.env.VITE_COGNITE_TOKEN || '')
  const [logs, setLogs] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [csvData, setCsvData] = useState('')

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const handleLoadPandasAI = async () => {
    if (!apiUrl || !bearerToken) {
      addLog('ERROR: Please enter API URL and Bearer Token')
      return
    }
    addLog('Loading PandasAI...')
    try {
      await loadPandasAI(apiUrl, bearerToken)
      addLog('PandasAI loaded successfully!')
    } catch (err) {
      addLog(`ERROR: ${err}`)
    }
  }

  const handleLoadCsv = async () => {
    if (!csvData) {
      addLog('ERROR: Please enter CSV data')
      return
    }
    addLog('Loading CSV data...')
    try {
      await loadDataframe('data', csvData)
      addLog('CSV loaded as "data" dataframe')
    } catch (err) {
      addLog(`ERROR: ${err}`)
    }
  }

  const handleChat = async () => {
    if (!question) {
      addLog('ERROR: Please enter a question')
      return
    }
    addLog(`Asking: ${question}`)
    try {
      const result = await chat('data', question)
      addLog(`Answer: ${result}`)
    } catch (err) {
      addLog(`ERROR: ${err}`)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Data Analyst - Dev Mode</h1>
        
        {/* Status */}
        <div className="mb-8 p-4 bg-zinc-900 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Status</h2>
          <p>Pyodide: <span className={pyodideStatus === 'ready' ? 'text-green-400' : pyodideStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}>{pyodideStatus}</span></p>
          {pyodideError && <p className="text-red-400 text-sm">{pyodideError}</p>}
          <p>PandasAI: <span className={pandasStatus === 'ready' ? 'text-green-400' : pandasStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}>{pandasStatus}</span></p>
          {pandasError && <p className="text-red-400 text-sm mt-1 whitespace-pre-wrap">{pandasError}</p>}
        </div>

        {/* API Config */}
        <div className="mb-8 p-4 bg-zinc-900 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">LLM API Config</h2>
          <div className="space-y-2">
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="API URL (e.g., https://api.openai.com/v1/chat/completions)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              placeholder="Bearer Token"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={handleLoadPandasAI}
              disabled={pyodideStatus !== 'ready'}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium"
            >
              Load PandasAI
            </button>
          </div>
        </div>

        {/* CSV Input */}
        <div className="mb-8 p-4 bg-zinc-900 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">CSV Data</h2>
          <textarea
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            placeholder="name,age,city&#10;John,30,NYC&#10;Jane,25,LA"
            className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={handleLoadCsv}
            disabled={pandasStatus !== 'ready'}
            className="mt-2 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium"
          >
            Load CSV
          </button>
        </div>

        {/* Chat */}
        <div className="mb-8 p-4 bg-zinc-900 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Chat</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What is the average age?"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            />
            <button
              onClick={handleChat}
              disabled={pandasStatus !== 'ready'}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium"
            >
              Ask
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="p-4 bg-zinc-900 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Logs</h2>
          <div className="h-64 overflow-y-auto bg-black rounded p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-zinc-500">No logs yet...</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className={log.includes('ERROR') ? 'text-red-400' : 'text-zinc-300'}>
                  {log}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
