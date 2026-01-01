import { useState, useCallback } from 'react'

interface ChartImageProps {
  src: string
  alt?: string
  className?: string
}

/**
 * ChartImage component for displaying chart images from PandasAI.
 * - Displays the image at a reasonable size (max-width 600px)
 * - Opens a modal overlay when clicked for full-size viewing
 * - Provides a download button
 */
export function ChartImage({ src, alt = 'Chart', className }: ChartImageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleClick = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const handleDownload = useCallback(() => {
    // Create a temporary link element to trigger download
    const link = document.createElement('a')
    link.href = src
    link.download = `chart-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [src])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    },
    [handleClose]
  )

  if (imageError) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4 text-zinc-400">
        <p>Failed to load chart image</p>
      </div>
    )
  }

  return (
    <>
      {/* Inline preview */}
      <div
        className={`w-fit bg-zinc-800 rounded-lg p-3 cursor-pointer hover:bg-zinc-700/80 transition-colors ${className ?? ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full h-auto rounded max-h-[400px] object-contain"
          style={{ maxWidth: '600px' }}
          onError={() => setImageError(true)}
        />
        <p className="text-xs text-zinc-500 mt-2 text-center">
          Click to view full size
        </p>
      </div>

      {/* Modal overlay */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={handleClose}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-2 right-2 z-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full p-2 transition-colors"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="absolute top-2 right-14 z-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full p-2 transition-colors"
              aria-label="Download"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>

            {/* Full-size image */}
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  )
}

