interface LoadingOverlayProps {
  isVisible: boolean
  steps: LoadingStep[]
}

interface LoadingStep {
  label: string
  status: 'pending' | 'loading' | 'complete' | 'error'
  detail?: string
}

export function LoadingOverlay({ isVisible, steps }: LoadingOverlayProps) {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-zinc-900/95 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl border border-zinc-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          <h2 className="text-xl font-semibold">Loading Data Analyst</h2>
        </div>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="mt-0.5">
                {step.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />
                )}
                {step.status === 'loading' && (
                  <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                )}
                {step.status === 'complete' && (
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {step.status === 'error' && (
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className={`font-medium ${step.status === 'loading' ? 'text-blue-400' : step.status === 'complete' ? 'text-green-400' : step.status === 'error' ? 'text-red-400' : 'text-zinc-400'}`}>
                  {step.label}
                </div>
                {step.detail && (
                  <div className="text-sm text-zinc-500 mt-0.5">{step.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { LoadingStep }

