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
        "scikit-learn",
        "scipy",
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

### CRITICAL: SQL Column References - NEVER quote column names
Column names in SQL must be written WITHOUT quotes (they are identifiers, not strings):
- CORRECT: `SELECT total_sulfur_dioxide, quality FROM table_name`
- WRONG: `SELECT 'total_sulfur_dioxide', 'quality' FROM table_name` (these become string literals!)

For aggregate functions like CORR(), AVG(), SUM(), COUNT(), etc., column names must also be unquoted:
- CORRECT: `CORR(total_sulfur_dioxide, quality)` → returns correlation coefficient
- WRONG: `CORR('total_sulfur_dioxide', 'quality')` → ERROR: "No function matches corr(VARCHAR, VARCHAR)"

Only quote VALUES in WHERE clauses, not column names:
- CORRECT: `WHERE country = 'USA'` (value is quoted, column is not)
- CORRECT: `WHERE total_sulfur_dioxide > 100` (column unquoted, number unquoted)
- WRONG: `WHERE 'total_sulfur_dioxide' > 100` (column should not be quoted)

### CRITICAL: Escape single quotes in SQL string values
Data values often contain apostrophes (single quotes). You MUST escape them by doubling the quote in SQL:
- `'master's degree'` must be written as `'master''s degree'`
- `'associate's degree'` must be written as `'associate''s degree'`
- `'O'Brien'` must be written as `'O''Brien'`
This applies to ALL string literals in WHERE, IN, LIKE clauses, etc.

### CRITICAL: Statistical Analysis - Use pandas/scikit-learn, NOT SQL GROUP BY
For statistical analysis (correlation, regression, statistical tests, distributions), you MUST use pandas and scikit-learn methods, NOT SQL GROUP BY queries.

**When to use SQL vs Python:**
- **SQL**: Use for filtering, aggregation, grouping, sorting, joining tables
- **Python (pandas/scikit-learn)**: Use for correlation analysis, linear regression, statistical tests, distribution analysis, machine learning

**CORRECT: Correlation analysis with pandas**
```python
import pandas as pd

# Fetch the data using SQL
df = execute_sql_query("SELECT quality, alcohol FROM table_name")

# Calculate correlation using pandas built-in method
correlation = df['quality'].corr(df['alcohol'])

# Or calculate full correlation matrix for all numeric columns
corr_matrix = df.corr(numeric_only=True)

result = {'type': 'dataframe', 'value': corr_matrix}
```

**WRONG: Using SQL GROUP BY for correlation**
```python
# DO NOT do this - SQL GROUP BY doesn't calculate correlation coefficients
sql_query = "SELECT quality, alcohol, COUNT(*) as count FROM table_name GROUP BY quality, alcohol"
df = execute_sql_query(sql_query)
# This only counts occurrences, it doesn't measure correlation!
```

**CORRECT: Linear regression with scikit-learn**
```python
from sklearn.linear_model import LinearRegression
import pandas as pd

# Fetch the data using SQL
df = execute_sql_query("SELECT feature1, feature2, target FROM table_name")

# Prepare features and target
X = df[['feature1', 'feature2']].values
y = df['target'].values

# Fit linear regression model
model = LinearRegression().fit(X, y)

# Get results
r_squared = model.score(X, y)
coefficients = model.coef_
intercept = model.intercept_

result = {'type': 'string', 'value': f'R² = {r_squared:.4f}, coefficients = {coefficients}, intercept = {intercept:.4f}'}
```

**CORRECT: Visualization with statistical analysis**
```python
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Fetch the data using SQL
df = execute_sql_query("SELECT alcohol, quality FROM table_name")

# Create scatter plot
plt.figure(figsize=(10, 6))
plt.scatter(df['alcohol'], df['quality'], alpha=0.5)

# Add trend line using numpy polyfit
z = np.polyfit(df['alcohol'], df['quality'], 1)
p = np.poly1d(z)
plt.plot(df['alcohol'].sort_values(), p(df['alcohol'].sort_values()), 'r--', label=f'Trend line (y={z[0]:.2f}x+{z[1]:.2f})')

# Calculate and display correlation
correlation = df['alcohol'].corr(df['quality'])
plt.title(f'Correlation between Alcohol and Quality: {correlation:.3f}')
plt.xlabel('Alcohol')
plt.ylabel('Quality')
plt.legend()
plt.savefig('exports/charts/chart.png')

result = {'type': 'plot', 'value': 'exports/charts/chart.png'}
```

**Key principles:**
1. Use SQL to fetch/aggregate data: `execute_sql_query("SELECT columns FROM table WHERE conditions")`
2. Use pandas methods for statistical operations: `.corr()`, `.describe()`, `.value_counts()`, etc.
3. Use scikit-learn for machine learning: `LinearRegression()`, `LogisticRegression()`, etc.
4. Use scipy.stats for statistical tests: `pearsonr()`, `spearmanr()`, `ttest_ind()`, etc.
5. Always combine: Fetch data with SQL, then analyze with Python statistical libraries
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

    # Monkey-patch Agent methods to emit progress events for UI feedback
    # This allows the frontend to show "Generating code...", "Running code...", etc.
    from pandasai import Agent
    from js import postProgress
    
    # Store original methods
    _original_generate_code = Agent.generate_code
    _original_execute_code = Agent.execute_code
    _original_regenerate_code_after_error = Agent._regenerate_code_after_error
    
    # Store last execution error traceback for progress reporting (closure variable)
    last_execution_traceback = [None]  # Use list to allow modification in nested functions
    
    print("Setting up PandasAI progress event monkey-patches...")
    
    def patched_generate_code(self, query):
        """Wrapped generate_code that emits progress events."""
        postProgress("generating_code")
        result = _original_generate_code(self, query)
        postProgress("code_generated")
        return result
    
    def patched_execute_code(self, code):
        """Wrapped execute_code that emits progress events and captures tracebacks."""
        import traceback
        
        last_execution_traceback[0] = None
        
        postProgress("executing_code")
        try:
            result = _original_execute_code(self, code)
            postProgress("code_executed")
            return result
        except Exception as e:
            # Capture the full traceback while we're still in the exception context
            tb = traceback.format_exc()
            last_execution_traceback[0] = tb
            # Always log to console for debugging
            print("=" * 60)
            print("PANDASAI EXECUTION ERROR")
            print("=" * 60)
            print("Code attempted:")
            print(code)
            print("-" * 60)
            print("Error traceback:")
            print(tb)
            print("=" * 60)
            raise
    
    def patched_regenerate_code_after_error(self, code, error):
        """Wrapped _regenerate_code_after_error that emits progress events."""
        import traceback
        import sys
        
        # Build error detail with both code attempted and full traceback
        error_parts = []
        
        # Include the code that was attempted
        if code:
            error_parts.append("CODE:")
            error_parts.append(code)
            error_parts.append("")
        
        # Try EVERYTHING to get the traceback
        traceback_str = None
        debug_info = []
        
        # Method 1: Use captured traceback from execute_code
        if last_execution_traceback[0]:
            traceback_str = last_execution_traceback[0]
            debug_info.append("Source: captured from execute_code")
        
        # Method 2: Try sys.exc_info() - might still be in exception context
        if not traceback_str:
            try:
                exc_type, exc_value, exc_tb = sys.exc_info()
                if exc_tb:
                    traceback_str = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
                    debug_info.append("Source: sys.exc_info()")
            except:
                pass
        
        # Method 3: Try the error's __cause__ (CodeExecutionError chains original)
        if not traceback_str and error:
            try:
                cause = getattr(error, '__cause__', None)
                if cause:
                    tb = getattr(cause, '__traceback__', None)
                    if tb:
                        traceback_str = ''.join(traceback.format_exception(type(cause), cause, tb))
                        debug_info.append(f"Source: error.__cause__ ({type(cause).__name__})")
            except Exception as e:
                debug_info.append(f"__cause__ failed: {e}")
        
        # Method 4: Try error's own __traceback__
        if not traceback_str and error:
            try:
                tb = getattr(error, '__traceback__', None)
                if tb:
                    traceback_str = ''.join(traceback.format_exception(type(error), error, tb))
                    debug_info.append(f"Source: error.__traceback__ ({type(error).__name__})")
            except Exception as e:
                debug_info.append(f"__traceback__ failed: {e}")
        
        # Method 5: Just format the exception without traceback
        if not traceback_str and error:
            traceback_str = f"{type(error).__name__}: {str(error)}"
            debug_info.append("Source: str(error) only - no traceback available")
        
        # Add error section
        error_parts.append("ERROR:")
        if traceback_str:
            error_parts.append(traceback_str)
        else:
            error_parts.append("Unknown error")
        
        # Add debug info
        if debug_info:
            error_parts.append("")
            error_parts.append(f"[Debug: {'; '.join(debug_info)}]")
        
        error_detail = "\n".join(error_parts)
        
        # Always log to console for debugging
        print("=" * 60)
        print("PANDASAI ERROR - REGENERATING CODE")
        print("=" * 60)
        print(error_detail)
        print("=" * 60)
        
        postProgress("fixing_error", error_detail)
        return _original_regenerate_code_after_error(self, code, error)
    
    # Apply monkey-patches
    Agent.generate_code = patched_generate_code
    Agent.execute_code = patched_execute_code
    Agent._regenerate_code_after_error = patched_regenerate_code_after_error
    print("Patched Agent methods with progress event emitters")

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
