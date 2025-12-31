import sys
import os

# Disable analytics
os.environ["SCARF_NO_ANALYTICS"] = "true"

_RUNNING_IN_BROWSER = sys.platform == "emscripten" and "pyodide" in sys.modules


async def patch_and_load_pandasai(api_url: str, bearer_token: str):
    """
    Patch PandasAI to work in Pyodide and return configured classes.
    Uses a custom LLM that calls an external API.
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
    import requests

    # Custom LLM that calls external API
    class CustomLLM(LLM):
        api_url: str = ""
        bearer_token: str = ""
        model: str = "azure/gpt-4.1"
        temperature: float = 0.0
        max_tokens: int = 2000

        def __init__(self, api_url: str, bearer_token: str, **kwargs):
            super().__init__()
            self.api_url = api_url
            self.bearer_token = bearer_token
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, value)

        def call(self, instruction, context=None):
            prompt = instruction.to_string() if hasattr(instruction, 'to_string') else str(instruction)
            
            messages = []
            if context and hasattr(context, 'memory'):
                messages = context.memory.to_openai_messages() if context.memory else []
            messages.append({"role": "user", "content": prompt})

            payload = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature,
                "maxTokens": self.max_tokens,
            }

            # Handle token with or without "Bearer " prefix
            auth_value = self.bearer_token if self.bearer_token.startswith("Bearer ") else f"Bearer {self.bearer_token}"
            headers = {
                "Authorization": auth_value,
                "Content-Type": "application/json",
                "cdf-version": "alpha",
            }

            print(f"Sending request to LLM...")
            
            response = requests.post(self.api_url, json=payload, headers=headers)
            
            if not response.ok:
                print(f"Error response: {response.status_code}")
                print(f"Response body: {response.text}")
                response.raise_for_status()
            
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            print(f"LLM response received ({len(content)} chars)")
            return content

        @property
        def type(self) -> str:
            return "custom"

    # Create the LLM instance
    llm = CustomLLM(api_url=api_url, bearer_token=bearer_token)

    # Dict to store dataframes by filename
    dataframes = {}

    print("PandasAI loaded successfully!")

    return {
        "SmartDataframe": SmartDataframe,
        "Agent": Agent,
        "llm": llm,
        "dataframes": dataframes,
    }
