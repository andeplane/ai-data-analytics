import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Default dependencies for production
const defaultDependencies = {
  downloadFile: (src: string, filename: string) => {
    const link = document.createElement('a')
    link.href = src
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },
  addKeydownListener: (handler: (e: KeyboardEvent) => void) => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  },
}

export type UseChartImageViewModelContextType = typeof defaultDependencies
export const UseChartImageViewModelContext =
  createContext<UseChartImageViewModelContextType>(defaultDependencies)

export interface ChartImageViewModel {
  isModalOpen: boolean
  imageError: boolean
  openModal: () => void
  closeModal: () => void
  download: () => void
  handleImageError: () => void
}

export function useChartImageViewModel(src: string): ChartImageViewModel {
  const { downloadFile, addKeydownListener } = useContext(
    UseChartImageViewModelContext
  )
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const download = useCallback(() => {
    downloadFile(src, `chart-${Date.now()}.png`)
  }, [downloadFile, src])

  const handleImageError = useCallback(() => {
    setImageError(true)
  }, [])

  // Listen for ESC key globally when modal is open
  useEffect(() => {
    if (!isModalOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal()
      }
    }

    return addKeydownListener(handleEscape)
  }, [isModalOpen, closeModal, addKeydownListener])

  return {
    isModalOpen,
    imageError,
    openModal,
    closeModal,
    download,
    handleImageError,
  }
}

