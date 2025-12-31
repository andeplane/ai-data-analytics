/// <reference types="vite/client" />

// Allow importing .py files as raw strings
declare module '*.py?raw' {
  const content: string
  export default content
}

