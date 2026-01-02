/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessagePart } from '@llamaindex/chat-ui'

// Note: Mocking @llamaindex/chat-ui because usePart requires ChatPartProvider context
// from the external library. While we could wrap with the library's provider, importing
// ChatPartProvider causes CSS-in-JS parsing errors in jsdom (due to @stitches/core via sandpack
// dependencies). Mocking usePart avoids these test environment issues while still allowing
// us to test the component's behavior.
const mockUsePart = vi.fn()
vi.mock('@llamaindex/chat-ui', () => ({
  usePart: (type: string) => mockUsePart(type),
}))

import { ToolCallCollapsible } from './ToolCallCollapsible'

describe(ToolCallCollapsible.name, () => {
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
    return render(<ToolCallCollapsible />)
  }

  it('should return null when part is not a tool-call part', () => {
    const textPart: MessagePart = { type: 'text', text: 'Hello' }
    const { container } = renderWithPart(textPart)

    expect(container.firstChild).toBeNull()
  })

  it('should return null when part has no toolName', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        input: 'Question',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    expect(container.firstChild).toBeNull()
  })

  it('should return null when part has no input', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    expect(container.firstChild).toBeNull()
  })

  it('should render collapsed by default', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'How many customers?',
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    expect(screen.getByText(/Analyze data: "How many customers\?"/)).toBeTruthy()
    expect(screen.getByText('Show details')).toBeTruthy()
    expect(screen.queryByText('print("Hello, World!")')).toBeNull()
  })

  it('should display tool name and input in header', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Generate chart',
        input: 'Bar chart of sales',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    expect(screen.getByText(/Generate chart: "Bar chart of sales"/)).toBeTruthy()
  })

  it('should expand when header is clicked', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
    act(() => {
      header.click()
    })

    // Syntax highlighter splits code into spans, so check container text
    expect(container.textContent).toContain('print')
    expect(container.textContent).toContain('Hello, World!')
  })

  it('should collapse when header is clicked again', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })

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

  it('should show copy button when expanded and code is present', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
    act(() => {
      header.click()
    })

    expect(screen.getByRole('button', { name: /copy code/i })).toBeTruthy()
  })

  it('should not show copy button when code is not present', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
    act(() => {
      header.click()
    })

    expect(screen.queryByRole('button', { name: /copy code/i })).toBeNull()
  })

  it('should copy code to clipboard when copy button is clicked', async () => {
    const code = 'print("Hello, World!")'
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code,
        language: 'python',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
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
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello, World!")',
        language: 'python',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
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
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: multilineCode,
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
    act(() => {
      header.click()
    })

    // Check for key parts of the code in container text
    expect(container.textContent).toContain('def')
    expect(container.textContent).toContain('fib')
    expect(container.textContent).toContain('return')
  })

  it('should not propagate copy button click to header', async () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
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

  it('should handle tool calls without code or result', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Generate chart',
        input: 'Bar chart of sales',
      },
    } as MessagePart

    renderWithPart(toolCallPart)

    expect(screen.getByText(/Generate chart: "Bar chart of sales"/)).toBeTruthy()
    expect(screen.queryByText('Show details')).toBeNull()
  })

  it('should display result when expanded', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        result: 'The average is 42.5',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
    act(() => {
      header.click()
    })

    expect(container.textContent).toContain('The average is 42.5')
  })

  it('should display both code and result when expanded', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello")',
        result: 'Hello',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const header = screen.getByRole('button', { name: /expand analyze data/i })
    act(() => {
      header.click()
    })

    expect(container.textContent).toContain('print')
    expect(container.textContent).toContain('Hello')
    expect(container.textContent).toContain('Code')
    expect(container.textContent).toContain('Result')
  })

  it('should expand when "Show details" button is clicked', () => {
    const toolCallPart: MessagePart = {
      type: 'tool-call',
      data: {
        toolName: 'Analyze data',
        input: 'Question',
        code: 'print("Hello")',
        language: 'python',
      },
    } as MessagePart

    const { container } = renderWithPart(toolCallPart)

    const showDetailsButton = screen.getByText('Show details')
    act(() => {
      showDetailsButton.click()
    })

    expect(container.textContent).toContain('print')
    expect(container.textContent).toContain('Hello')
  })
})

