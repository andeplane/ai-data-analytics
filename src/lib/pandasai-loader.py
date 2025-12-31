import sys
import os

# Disable analytics
os.environ["SCARF_NO_ANALYTICS"] = "true"

_RUNNING_IN_BROWSER = sys.platform == "emscripten" and "pyodide" in sys.modules


async def patch_and_load_pandasai():
    """
    Patch PandasAI to work in Pyodide and return configured classes.
    Uses web-llm via JavaScript interop for LLM calls.
    """
    import micropip
    from types import ModuleType

    # Mock dotenv module - it's not available in Pyodide
    dotenv_mock = ModuleType("dotenv")
    dotenv_mock.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = dotenv_mock

    # Install DuckDB - works in Pyodide v0.27.6
    print("Installing duckdb...")
    await micropip.install("duckdb")

    # Install dependencies - ALL PINNED VERSIONS
    print("Installing pandasai dependencies...")
    
    await micropip.install([
        "pydantic==2.10.6",
        "jinja2==3.1.5",
        "pyyaml==6.0.2",
        "sqlglot==26.14.0",
        "astor==0.8.1",
    ])
    
    # Install pandasai without dependencies
    print("Installing pandasai (without deps)...")
    await micropip.install("pandasai==3.0.0", deps=False)

    # Import pandasai modules
    print("Importing pandasai modules...")
    from pandasai import SmartDataframe, Agent
    from pandasai.llm import LLM

    # Import JavaScript interop for calling web-llm
    from js import webllmChat
    from pyodide.ffi import to_js

    # Custom LLM that calls web-llm via JavaScript interop
    class WebLLM(LLM):
        model: str = "Hermes-3-Llama-3.1-8B-q4f16_1-MLC"
        temperature: float = 0.0

        def __init__(self, **kwargs):
            super().__init__()
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, value)

        def call(self, instruction, context=None):
            import asyncio
            
            prompt = instruction.to_string() if hasattr(instruction, 'to_string') else str(instruction)
            
            # Add context/memory if available
            if context and hasattr(context, 'memory') and context.memory:
                memory_messages = context.memory.to_openai_messages()
                if memory_messages:
                    context_str = "\n".join([f"{m['role']}: {m['content']}" for m in memory_messages])
                    prompt = f"{context_str}\n\nuser: {prompt}"

            print(f"Calling web-llm via JS interop...")
            
            # Call the JavaScript function exposed by useWebLLM hook
            # webllmChat is an async JS function, so we need to await the Promise
            loop = asyncio.get_event_loop()
            
            async def call_webllm():
                result = await webllmChat(prompt)
                return result
            
            # Run the async call
            if loop.is_running():
                # We're already in an async context, create a task
                import pyodide
                result = pyodide.ffi.run_sync(webllmChat(prompt))
            else:
                result = loop.run_until_complete(call_webllm())
            
            content = str(result)
            print(f"web-llm response received ({len(content)} chars)")
            return content

        @property
        def type(self) -> str:
            return "webllm"

    # Create the LLM instance
    llm = WebLLM()

    # Dict to store dataframes by filename
    dataframes = {}

    print("PandasAI loaded successfully with web-llm!")

    return {
        "SmartDataframe": SmartDataframe,
        "Agent": Agent,
        "llm": llm,
        "dataframes": dataframes,
    }
