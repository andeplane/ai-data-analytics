interface DragDropOverlayProps {
  isDragging: boolean
  onDrop: (e: React.DragEvent) => Promise<void>
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

/**
 * Full-screen overlay that appears when dragging files over the window.
 * Similar to ChatGPT's drag-and-drop interface.
 */
export function DragDropOverlay({ 
  isDragging, 
  onDrop, 
  onDragOver, 
  onDragEnter,
  onDragLeave 
}: DragDropOverlayProps) {
  if (!isDragging) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <div className="flex flex-col items-center justify-center text-center space-y-6">
        {/* Icons row */}
        <div className="flex items-center justify-center gap-8">
          {/* Code icon (purple) */}
          <div className="w-16 h-16 flex items-center justify-center">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              className="text-purple-500"
            >
              <path
                d="M8 6L3 12L8 18M16 6L21 12L16 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          
          {/* Document icon (blue) */}
          <div className="w-16 h-16 flex items-center justify-center">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              className="text-blue-500"
            >
              <path
                d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 2V8H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          
          {/* Image icon (purple) */}
          <div className="w-16 h-16 flex items-center justify-center">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              className="text-purple-500"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle
                cx="8.5"
                cy="8.5"
                r="1.5"
                fill="currentColor"
              />
              <path
                d="M21 15L16 10L5 21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        
        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-4xl font-normal text-zinc-300">Add anything</h2>
          <p className="text-lg text-zinc-500">Drop any file here to add it to the conversation</p>
        </div>
      </div>
    </div>
  )
}

