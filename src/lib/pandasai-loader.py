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
    import pandasai
    from pandasai import DataFrame, Agent
    from pandasai.llm import LLM
    from pandasai.core.prompts.generate_python_code_with_sql import GeneratePythonCodeWithSQLPrompt
    from pandasai.core.prompts.correct_execute_sql_query_usage_error_prompt import CorrectExecuteSQLQueryUsageErrorPrompt

    # Note: webllmChat is imported lazily inside WebLLM.call() to allow
    # PandasAI to load before WebLLM engine is ready.
    # When running in a web worker, webllmChat is exposed on self by pyodide.worker.ts,
    # so 'from js import webllmChat' imports it from the worker's global scope.

    # DuckDB SQL syntax instructions to append to prompts
    DUCKDB_SQL_INSTRUCTIONS = '''

### CRITICAL: Code Format Requirements
You MUST wrap your Python code in markdown code blocks using triple backticks. The code extractor REQUIRES this format.
Always start with ```python and end with ```.

### CRITICAL: Do NOT redefine functions
The `execute_sql_query` function is ALREADY DEFINED in the execution environment.
NEVER write `def execute_sql_query` - this will cause an error!

WRONG (causes error):
```python
def execute_sql_query(sql_query: str) -> pd.DataFrame:
    """This method connects to the database..."""
    pass  # DO NOT WRITE THIS - FUNCTION IS ALREADY DEFINED
```

CORRECT (just call it):
```python
df = execute_sql_query(sql_query)  # Function is already available, just call it
```

### CRITICAL: Always declare result variable
You MUST end your code with a `result` variable declaration. This is MANDATORY. Without it, an error occurs.
For plots: result = {'type': 'plot', 'value': 'exports/charts/chart.png'}
For dataframes: result = {'type': 'dataframe', 'value': df}
For numbers: result = {'type': 'number', 'value': 42}
For strings: result = {'type': 'string', 'value': 'The answer is...'}

### COMPLETE EXAMPLE (follow this pattern):
```python
import pandas as pd
import matplotlib.pyplot as plt

sql_query = "SELECT Country, COUNT(*) as count FROM table_name GROUP BY Country LIMIT 10"
df = execute_sql_query(sql_query)

plt.figure(figsize=(8, 8))
plt.pie(df['count'], labels=df['Country'], autopct='%1.1f%%')
plt.title('Top 10 Countries')
plt.savefig('exports/charts/chart.png')

result = {'type': 'plot', 'value': 'exports/charts/chart.png'}
```

### IMPORTANT: DuckDB SQL Syntax Requirements
The database dialect is DuckDB. You MUST use DuckDB-compatible SQL syntax:
- Use `LIMIT n` instead of `TOP n` to limit results
- Example: `SELECT * FROM table_name LIMIT 10` (NOT `SELECT TOP 10 * FROM table_name`)
- Use standard SQL syntax compatible with DuckDB
- For ordering: `SELECT * FROM table_name ORDER BY column_name DESC LIMIT 10`
- Do NOT use SQL Server-specific syntax like `TOP`, `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`
'''

    # Monkey-patch GeneratePythonCodeWithSQLPrompt to add DuckDB instructions
    original_to_string_sql = GeneratePythonCodeWithSQLPrompt.to_string
    
    def patched_to_string_sql(self):
        """Patched to_string that appends DuckDB SQL syntax instructions."""
        # Clear cache to ensure fresh render, then call original
        self._resolved_prompt = None
        original_prompt = original_to_string_sql(self)
        # Append DuckDB instructions and update cache
        patched_prompt = original_prompt + DUCKDB_SQL_INSTRUCTIONS
        self._resolved_prompt = patched_prompt
        return patched_prompt
    
    GeneratePythonCodeWithSQLPrompt.to_string = patched_to_string_sql
    print("Patched GeneratePythonCodeWithSQLPrompt with DuckDB SQL syntax instructions")

    # Monkey-patch CorrectExecuteSQLQueryUsageErrorPrompt to add DuckDB instructions
    original_to_string_error = CorrectExecuteSQLQueryUsageErrorPrompt.to_string
    
    def patched_to_string_error(self):
        """Patched to_string that appends DuckDB SQL syntax hints for error correction."""
        # Clear cache to ensure fresh render, then call original
        self._resolved_prompt = None
        original_prompt = original_to_string_error(self)
        duckdb_error_hints = DUCKDB_SQL_INSTRUCTIONS + """
### Common DuckDB Syntax Errors:
- If you used `TOP`, replace it with `LIMIT` at the end of the query
- Example fix: Change `SELECT TOP 10 * FROM table` to `SELECT * FROM table LIMIT 10`
- Ensure all SQL syntax is compatible with DuckDB dialect
"""
        # Append DuckDB error hints and update cache
        patched_prompt = original_prompt + duckdb_error_hints
        self._resolved_prompt = patched_prompt
        return patched_prompt
    
    CorrectExecuteSQLQueryUsageErrorPrompt.to_string = patched_to_string_error
    print("Patched CorrectExecuteSQLQueryUsageErrorPrompt with DuckDB SQL syntax hints")

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
            # Lazy import - allows PandasAI to load before WebLLM engine is ready.
            # In the web worker, webllmChat is exposed on self by pyodide.worker.ts.
            from js import webllmChat
            import pyodide
            
            prompt = instruction.to_string() if hasattr(instruction, 'to_string') else str(instruction)
            
            # Add context/memory if available
            if context and hasattr(context, 'memory') and context.memory:
                memory_messages = context.memory.to_openai_messages()
                if memory_messages:
                    context_str = "\n".join([f"{m['role']}: {m['content']}" for m in memory_messages])
                    prompt = f"{context_str}\n\nuser: {prompt}"

            # Call the JavaScript function exposed by pyodide.worker.ts
            # webllmChat returns a Promise that resolves when the main thread responds
            # All detailed logging happens in the unified llmCaller.ts interface
            loop = asyncio.get_event_loop()
            
            async def call_webllm():
                result = await webllmChat(prompt)
                return result
            
            # Run the async call
            if loop.is_running():
                # We're already in an async context, create a task
                result = pyodide.ffi.run_sync(webllmChat(prompt))
            else:
                result = loop.run_until_complete(call_webllm())
            
            return str(result)

        @property
        def type(self) -> str:
            return "webllm"

    # Create the LLM instance and configure it globally
    llm = WebLLM()
    pandasai.config.set({"llm": llm})
    print("Configured LLM globally via pandasai.config")

    # Dict to store dataframes by filename
    dataframes = {}

    # Create exports/charts directory for PandasAI chart output
    os.makedirs("exports/charts", exist_ok=True)
    print("Created exports/charts directory for chart output")

    print("PandasAI loaded successfully with web-llm!")

    return {
        "DataFrame": DataFrame,
        "Agent": Agent,
        "llm": llm,
        "dataframes": dataframes,
    }
