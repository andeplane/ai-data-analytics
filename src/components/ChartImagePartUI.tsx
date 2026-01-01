import { usePart, FilePartType } from '@llamaindex/chat-ui'
import { ChartImage } from './ChartImage'

interface ChartImagePartUIProps {
  className?: string
}

/**
 * Render an image file part using ChartImage for better display (sizing, modal, download).
 * Uses the part context from @llamaindex/chat-ui to only render when the current part
 * is a data-file with an image media type.
 * 
 * This follows the same pattern as the built-in FilePartUI but renders with ChartImage
 * instead of ChatFile for a better chart viewing experience.
 */
export function ChartImagePartUI({ className }: ChartImagePartUIProps) {
  const file = usePart(FilePartType)
  
  // Only render if current part is a file and is an image
  if (!file) return null
  if (!file.data.mediaType?.startsWith('image/')) return null

  return (
    <ChartImage
      src={file.data.url}
      alt={file.data.filename}
      className={className}
    />
  )
}

