interface StarterBubblesProps {
  questions: string[]
  onSelect: (question: string) => void
  isLoading?: boolean
}

export function StarterBubbles({ questions, onSelect, isLoading }: StarterBubblesProps) {
  if (isLoading) {
    return (
      <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-full animate-pulse"
          >
            <span className="invisible">Loading question...</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
      {questions.map((question) => (
        <button
          key={question}
          onClick={() => onSelect(question)}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full text-sm text-zinc-300 transition-colors"
        >
          {question}
        </button>
      ))}
    </div>
  )
}
