/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessagePart } from '@llamaindex/chat-ui'

// Mock usePart hook before importing component
const mockUsePart = vi.fn()
vi.mock('@llamaindex/chat-ui', () => ({
  usePart: (type: string) => mockUsePart(type),
}))

import { AnalysisCodeCollapsible } from './AnalysisCodeCollapsible'

describe(AnalysisCodeCollapsible.name, () => {
  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  const renderWithPart = (part: MessagePart | null) => {
    mockUsePart.mockReturnValue(part)
    return render(<AnalysisCodeCollapsible />)
  }

  it('should return null when part is not a code part', () => {
    const textPart: MessagePart = { type: 'text', text: 'Hello' }
    const { container } = renderWithPart(textPart)

    expect(container.firstChild).toBeNull()
  })

  it('should return null when part has no code data', () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {},
    } as MessagePart

    const { container } = renderWithPart(codePart)

    expect(container.firstChild).toBeNull()
  })

  it('should render collapsed by default', () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    renderWithPart(codePart)

    expect(screen.getByRole('button', { name: /expand analysis code/i })).toBeTruthy()
    expect(screen.queryByText('print("Hello, World!")')).toBeNull()
  })

  it('should expand when header is clicked', () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })
    act(() => {
      header.click()
    })

    // Syntax highlighter splits code into spans, so check container text
    expect(container.textContent).toContain('print')
    expect(container.textContent).toContain('Hello, World!')
  })

  it('should collapse when header is clicked again', () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })

    // Expand
    act(() => {
      header.click()
    })
    expect(container.textContent).toContain('Hello, World!')

    // Collapse
    act(() => {
      header.click()
    })
    expect(container.textContent).not.toContain('Hello, World!')
  })

  it('should show copy button when expanded', () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })
    act(() => {
      header.click()
    })

    expect(screen.getByRole('button', { name: /copy code/i })).toBeTruthy()
  })

  it('should copy code to clipboard when copy button is clicked', async () => {
    const code = 'print("Hello, World!")'
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code,
        language: 'python',
      },
    } as MessagePart

    renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })
    act(() => {
      header.click()
    })

    const copyButton = screen.getByRole('button', { name: /copy code/i })
    await act(async () => {
      copyButton.click()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code)
  })

  it('should show "Copied" message after copying', async () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })
    act(() => {
      header.click()
    })

    const copyButton = screen.getByRole('button', { name: /copy code/i })
    await act(async () => {
      copyButton.click()
    })

    expect(screen.getByText('Copied')).toBeTruthy()
    expect(screen.queryByText('Copy code')).toBeNull()
  })

  it('should preserve multiline code', () => {
    const multilineCode = 'def fib(n):\n    if n <= 1:\n        return n\n    return fib(n-1) + fib(n-2)'
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: multilineCode,
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })
    act(() => {
      header.click()
    })

    // Check for key parts of the code in container text
    expect(container.textContent).toContain('def')
    expect(container.textContent).toContain('fib')
    expect(container.textContent).toContain('return')
  })

  it('should not propagate copy button click to header', async () => {
    const codePart: MessagePart = {
      type: 'data-code',
      data: {
        code: 'print("Hello")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(codePart)

    const header = screen.getByRole('button', { name: /expand analysis code/i })
    act(() => {
      header.click()
    })

    const copyButton = screen.getByRole('button', { name: /copy code/i })
    
    // Click copy button - should not collapse the code
    await act(async () => {
      copyButton.click()
    })

    // Code should still be visible (check container text)
    expect(container.textContent).toContain('print')
    expect(container.textContent).toContain('Hello')
  })
})

