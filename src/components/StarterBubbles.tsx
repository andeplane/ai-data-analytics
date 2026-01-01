// Conversation starter suggestions
const STARTER_QUESTIONS = [
  'Show first 10 rows',
  'What columns are in my data?',
  'Give me a summary of the data',
  'Show basic statistics',
]

interface StarterBubblesProps {
  onSelect: (question: string) => void
}

export function StarterBubbles({ onSelect }: StarterBubblesProps) {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
      {STARTER_QUESTIONS.map((question) => (
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

