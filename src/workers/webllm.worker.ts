import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Run WebLLM in a dedicated Web Worker to isolate its WASM from Pyodide
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};

