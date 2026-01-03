import { useWelcomeModal } from '../hooks/useWelcomeModal'

/**
 * Welcome modal shown on first visit.
 * Explains the app's privacy-focused, local execution model.
 */
export function WelcomeModal() {
  const { isOpen, dismiss } = useWelcomeModal()

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-w-md w-full p-8">
        {/* Lock/Shield Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <h2 className="text-2xl font-bold text-zinc-100 text-center mb-4">
          On-device LLM-Powered Data Analyst
        </h2>

        {/* Description */}
        <p className="text-zinc-400 text-center mb-6">
          Analyze CSV and JSON files with natural language. Ask questions about your data, generate charts, and get insights—all powered by AI running entirely in your browser.
        </p>

        {/* Features */}
        <ul className="space-y-2 mb-8">
          <li className="flex items-start gap-3 text-sm text-zinc-300">
            <svg
              className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Runs 100% in your browser—no signup required</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-300">
            <svg
              className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Your data never leaves your device</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-300">
            <svg
              className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>LLM and Python analysis run locally</span>
          </li>
        </ul>

        {/* CTA Button */}
        <button
          onClick={dismiss}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors mb-6"
        >
          Get Started
        </button>

        {/* Powered By Footer */}
        <div className="text-center pt-6 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2">Powered by</p>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
            <a
              href="https://github.com/sinaptik-ai/pandas-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              PandasAI
            </a>
            <span className="text-zinc-600">·</span>
            <a
              href="https://github.com/pyodide/pyodide"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Pyodide
            </a>
            <span className="text-zinc-600">·</span>
            <a
              href="https://github.com/mlc-ai/web-llm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              WebLLM
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

