import { loadPyodide } from 'pyodide'
import type { PyodideInterface } from 'pyodide'

// Message types from main thread to worker
interface InitMessage {
  type: 'init'
}

interface RunPythonMessage {
  type: 'runPython'
  id: string
  code: string
}

interface RunPythonAsyncMessage {
  type: 'runPythonAsync'
  id: string
  code: string
}

interface LLMResponseMessage {
  type: 'llmResponse'
  id: string
  success: boolean
  result?: string
  error?: string
}

type WorkerMessage = InitMessage | RunPythonMessage | RunPythonAsyncMessage | LLMResponseMessage

// Progress update stages from PandasAI
export type PandasAIProgressStage =
  | 'generating_code'
  | 'code_generated'
  | 'executing_code'
  | 'code_executed'
  | 'fixing_error'
  | 'retrying'

// Message types from worker to main thread
interface StatusMessage {
  type: 'status'
  status: 'loading' | 'ready' | 'error'
  error?: string
}

interface ResultMessage {
  type: 'result'
  id: string
  success: boolean
  result?: unknown
  error?: string
}

interface LLMRequestMessage {
  type: 'llmRequest'
  id: string
  prompt: string
}

interface ProgressUpdateMessage {
  type: 'progressUpdate'
  stage: PandasAIProgressStage
  detail?: string
}

type WorkerResponse = StatusMessage | ResultMessage | LLMRequestMessage | ProgressUpdateMessage

let pyodide: PyodideInterface | null = null

// Track pending LLM requests - resolvers for promises waiting on main thread response
const pendingLLMRequests = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>()

/**
 * Generate a unique ID for request tracking
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Send a message to the main thread
 */
function postResponse(response: WorkerResponse) {
  self.postMessage(response)
}

/**
 * Create the webllmChat function that will be exposed to Python.
 * This sends a request to the main thread and returns a Promise.
 */
function createWebllmChat(): (prompt: string) => Promise<string> {
  return (prompt: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const id = generateId()
      pendingLLMRequests.set(id, { resolve, reject })
      postResponse({ type: 'llmRequest', id, prompt })
    })
  }
}

/**
 * Create the postProgress function that will be exposed to Python.
 * This sends progress updates to the main thread for UI feedback.
 */
function createPostProgress(): (stage: string, detail?: string) => void {
  return (stage: string, detail?: string): void => {
    postResponse({
      type: 'progressUpdate',
      stage: stage as PandasAIProgressStage,
      detail,
    })
  }
}

/**
 * Initialize Pyodide and load required packages
 */
async function initialize() {
  postResponse({ type: 'status', status: 'loading' })

  try {
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.6/full/',
    })

    // Load essential packages (from Pyodide distribution)
    await pyodide.loadPackage(['micropip', 'pandas', 'requests', 'pillow', 'matplotlib'])

    // Set matplotlib backend to 'Agg' (headless) before pyplot is imported
    // Required for Pyodide/web worker where there's no display
    await pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
`)

    // Expose webllmChat to Pyodide's JavaScript globals
    // This allows Python to call it via: from js import webllmChat
    // But since we're in a worker, we need to put it on self (the worker's global)
    const webllmChat = createWebllmChat()
    ;(self as unknown as Record<string, unknown>).webllmChat = webllmChat

    // Expose postProgress for PandasAI progress updates
    // Python can call it via: from js import postProgress
    const postProgress = createPostProgress()
    ;(self as unknown as Record<string, unknown>).postProgress = postProgress

    postResponse({ type: 'status', status: 'ready' })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to load Pyodide'
    postResponse({ type: 'status', status: 'error', error: errorMsg })
  }
}

/**
 * Run synchronous Python code
 */
function runPython(id: string, code: string) {
  if (!pyodide) {
    postResponse({
      type: 'result',
      id,
      success: false,
      error: 'Pyodide not loaded',
    })
    return
  }

  try {
    const result = pyodide.runPython(code)
    postResponse({
      type: 'result',
      id,
      success: true,
      result,
    })
  } catch (err) {
    postResponse({
      type: 'result',
      id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Run asynchronous Python code
 */
async function runPythonAsync(id: string, code: string) {
  if (!pyodide) {
    postResponse({
      type: 'result',
      id,
      success: false,
      error: 'Pyodide not loaded',
    })
    return
  }

  try {
    const result = await pyodide.runPythonAsync(code)
    postResponse({
      type: 'result',
      id,
      success: true,
      result,
    })
  } catch (err) {
    postResponse({
      type: 'result',
      id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Handle LLM response from main thread
 */
function handleLLMResponse(message: LLMResponseMessage) {
  const pending = pendingLLMRequests.get(message.id)
  if (pending) {
    pendingLLMRequests.delete(message.id)
    if (message.success && message.result !== undefined) {
      pending.resolve(message.result)
    } else {
      pending.reject(new Error(message.error ?? 'LLM request failed'))
    }
  }
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  switch (message.type) {
    case 'init':
      await initialize()
      break

    case 'runPython':
      runPython(message.id, message.code)
      break

    case 'runPythonAsync':
      await runPythonAsync(message.id, message.code)
      break

    case 'llmResponse':
      handleLLMResponse(message)
      break

    default:
      console.warn('Unknown message type:', message)
  }
}
